import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import test, { before, after } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Quiz from "../src/models/Quiz.js";
import Attempt from "../src/models/Attempt.js";
import { submitAttempt, getAttemptResult, getMyAttempts } from "../src/controllers/attemptController.js";

// These tests never load .env or connect to MongoDB. Database methods are mocked.
const secret = randomBytes(32).toString("hex");
const originalSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = secret;
const userId = "507f1f77bcf86cd799439011";
const quizId = "507f1f77bcf86cd799439012";
const questionId = "507f1f77bcf86cd799439013";
const attemptId = "507f1f77bcf86cd799439014";
const person = { _id: userId, publicId: "QV-1234ABCD", name: "Test Student", email: "student@example.test", role: "student" };
let server, base;
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});
const cookie = () => `token=${jwt.sign({ userId }, secret, { expiresIn: "5m" })}`;
const request = (path, options = {}) => fetch(`${base}/api${path}`, options);
const jsonPost = body => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });

test("health and all authenticated API families reject anonymous access", async () => {
  assert.equal((await request("/health")).status, 200);
  for (const path of ["/auth/me", "/quizzes/mine", "/attempts/mine", "/groups", "/groups/requests", "/notifications", "/groups/GRP-1234ABCD/messages", "/assignments", "/assignment-attempts/not-a-token"]) {
    assert.equal((await request(path)).status, 401, path);
  }
});

test("public registration rejects admin and other roles before a database lookup", async t => {
  const lookup = t.mock.method(User, "findOne", () => { throw new Error("Must not access database"); });
  for (const role of ["admin", "user", "ADMIN", null, { role: "teacher" }]) {
    const res = await request("/auth/register", jsonPost({ name: "Test User", email: "test@example.test", password: "test-password", role }));
    assert.equal(res.status, 400);
  }
  assert.equal(lookup.mock.callCount(), 0);
});

test("student and teacher registration hash passwords and return only public identity", async t => {
  t.mock.method(User, "findOne", async () => null);
  const create = t.mock.method(User, "create", async input => {
    assert.equal(input.email, "new@example.test");
    assert.equal(input.name, "New User");
    assert.equal(bcrypt.getRounds(input.password), 12);
    assert.equal(await bcrypt.compare("test-password", input.password), true);
    return new User(input);
  });
  for (const role of ["student", "teacher"]) {
    const res = await request("/auth/register", jsonPost({ name: " New User ", email: " NEW@example.test ", password: "test-password", role, publicId: "QV-FFFFFFFF" }));
    assert.equal(res.status, 201);
    const { user } = await res.json();
    assert.equal(user.role, role);
    assert.match(user.publicId, /^QV-[A-F0-9]{8}$/);
    assert.notEqual(user.publicId, "QV-FFFFFFFF");
    assert.deepEqual(Object.keys(user).sort(), ["email", "name", "publicId", "role"]);
  }
  assert.equal(create.mock.callCount(), 2);
});

test("login uses an httpOnly cookie; current-user profile and logout preserve identity safety", async t => {
  const password = await bcrypt.hash("test-password", 4);
  t.mock.method(User, "findOne", filter => {
    assert.equal(filter.email, person.email);
    return { select: async projection => { assert.equal(projection, "+password"); return { ...person, password }; } };
  });
  t.mock.method(User, "findById", async () => person);
  const login = await request("/auth/login", jsonPost({ email: " STUDENT@example.test ", password: "test-password" }));
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  const tokenCookie = setCookie.split(";")[0];
  const current = await request("/auth/me", { headers: { Cookie: tokenCookie } });
  assert.equal(current.status, 200);
  assert.deepEqual((await current.json()).user, { publicId: person.publicId, name: person.name, email: person.email, role: person.role });
  const logout = await request("/auth/logout", { method: "POST", headers: { Cookie: tokenCookie } });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /token=;/);
  const invalid = await request("/auth/login", jsonPost({ email: person.email, password: "wrong" }));
  assert.equal(invalid.status, 401);
});

test("production login cookies have Secure and invalid tokens cannot authenticate", async t => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  t.after(() => { if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original; });
  t.mock.method(User, "findOne", () => ({ select: async () => ({ ...person, password: await bcrypt.hash("test-password", 4) }) }));
  const login = await request("/auth/login", jsonPost({ email: person.email, password: "test-password" }));
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /; Secure/i);
  assert.equal((await request("/auth/me", { headers: { Cookie: "token=invalid" } })).status, 401);
});

test("students cannot access quiz CRUD or classroom-manager routes", async t => {
  t.mock.method(User, "findById", async () => person);
  for (const [path, method] of [["/quizzes", "POST"], ["/quizzes/mine", "GET"], [`/quizzes/${quizId}`, "GET"], [`/quizzes/${quizId}`, "PUT"], [`/quizzes/${quizId}`, "DELETE"], ["/groups", "POST"], ["/groups/GRP-1234ABCD/invitations", "POST"], ["/groups/GRP-1234ABCD", "DELETE"]]) {
    assert.equal((await request(path, { method, headers: { Cookie: cookie() } })).status, 403, path);
  }
});

test("teachers cannot impersonate students to request classroom membership", async t => {
  t.mock.method(User, "findById", async () => ({ ...person, role: "teacher" }));
  const res = await request("/groups/join-requests", { ...jsonPost({ groupCode: "GRP-1234ABCD" }), headers: { "Content-Type": "application/json", Cookie: cookie() } });
  assert.equal(res.status, 403);
});

test("playable API omits answer keys and blocks drafts/private quizzes", async t => {
  const quiz = new Quiz({ _id: quizId, title: "Test quiz", category: "Science", creator: userId, status: "published", visibility: "public", questions: [{ _id: questionId, questionText: "Question?", options: ["A", "B"], correctOption: 1, marks: 2 }] });
  t.mock.method(Quiz, "findById", async () => quiz);
  const playable = await request(`/quizzes/play/${quizId}`);
  assert.equal(playable.status, 200);
  const body = await playable.json();
  assert.equal(body.quiz.questions[0].options.length, 2);
  assert.equal(JSON.stringify(body).includes("correctOption"), false);
  quiz.status = "draft";
  assert.equal((await request(`/quizzes/play/${quizId}`)).status, 403);
  quiz.status = "published"; quiz.visibility = "private";
  assert.equal((await request(`/quizzes/play/${quizId}`)).status, 403);
  quiz.visibility = "unlisted";
  assert.equal((await request(`/quizzes/play/${quizId}`)).status, 200);
});

test("quiz CRUD preserves teacher ownership and permits admin management", async t => {
  let actor = { ...person, role: "teacher" };
  t.mock.method(User, "findById", async () => actor);
  let quiz;
  t.mock.method(Quiz, "create", async input => {
    assert.equal(input.creator, userId); // Submitted creator identity is ignored.
    quiz = new Quiz({ ...input, _id: quizId });
    quiz.save = async () => quiz;
    quiz.deleteOne = async () => { quiz = null; };
    return quiz;
  });
  t.mock.method(Quiz, "findById", async () => quiz);
  t.mock.method(Quiz, "find", filter => {
    assert.deepEqual(filter, actor.role === "admin" ? {} : { creator: actor._id });
    return { sort: async () => quiz ? [quiz] : [] };
  });
  const headers = { "Content-Type": "application/json", Cookie: cookie() };
  const created = await request("/quizzes", { ...jsonPost({ title: "Creator quiz", category: "Science", creator: attemptId, status: "draft", visibility: "private", questions: [{ questionText: "Question?", options: ["A", "B"], correctOption: 1 }] }), headers });
  assert.equal(created.status, 201);
  assert.equal((await request("/quizzes/mine", { headers })).status, 200);
  assert.equal((await request(`/quizzes/${quizId}`, { headers })).status, 200);
  assert.equal((await request(`/quizzes/${quizId}`, { method: "PUT", headers, body: JSON.stringify({ status: "published", visibility: "public", creator: attemptId }) })).status, 200);
  assert.equal(quiz.status, "published");
  assert.equal(String(quiz.creator), userId);
  actor = { ...actor, _id: attemptId };
  for (const method of ["GET", "PUT", "DELETE"]) assert.equal((await request(`/quizzes/${quizId}`, { method, headers })).status, 403);
  actor.role = "admin";
  assert.equal((await request("/quizzes/mine", { headers })).status, 200);
  assert.equal((await request(`/quizzes/${quizId}`, { method: "PUT", headers, body: JSON.stringify({ status: "draft" }) })).status, 200);
  assert.equal(quiz.status, "draft");
  assert.equal((await request(`/quizzes/${quizId}`, { method: "DELETE", headers })).status, 200);
  assert.equal(quiz, null);
});

test("public discovery includes public creator identity without answer keys", async t => {
  const quiz = { _id: quizId, title: "Public quiz", questions: [{ correctOption: 1 }], creator: person };
  t.mock.method(Quiz, "find", filter => {
    assert.deepEqual(filter, { status: "published", visibility: "public" });
    return { populate: () => ({ sort: async () => [quiz] }) };
  });
  const res = await request("/quizzes/public");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.quizzes[0].creator, { publicId: person.publicId, name: person.name });
  assert.equal(JSON.stringify(body).includes("correctOption"), false);
});

test("scoring ignores client score, preserves unanswered zeroes, and rejects repeat submissions", async t => {
  const quiz = new Quiz({ _id: quizId, title: "Test quiz", category: "Science", creator: userId, questions: [{ _id: questionId, questionText: "Question?", options: ["A", "B"], correctOption: 1, marks: 2 }, { questionText: "Other?", options: ["A", "B"], correctOption: 0, marks: 3 }] });
  const attempt = { _id: attemptId, quiz: quizId, user: userId, status: "in-progress", startedAt: new Date(), save: async () => {} };
  t.mock.method(Quiz, "findById", async () => quiz);
  t.mock.method(Attempt, "findById", () => ({ select: async () => attempt }));
  const req = { user: person, params: { attemptId }, body: { score: 9999, answers: [{ questionId, selectedOption: 1, isCorrect: true, marksAwarded: 9999 }] } };
  const res = response();
  await submitAttempt(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.result.score, 2);
  assert.equal(res.body.result.totalMarks, 5);
  assert.equal(res.body.result.percentage, 40);
  assert.equal(attempt.answers[1].selectedOption, null);
  assert.equal(attempt.answers[1].marksAwarded, 0);
  const again = response(); await submitAttempt(req, again); assert.equal(again.code, 409);
});

test("attempt results/history restrict ownership and retain persisted summary fields", async t => {
  const attempt = { _id: attemptId, quiz: { title: "Saved quiz" }, user: userId, status: "submitted", score: 2, totalMarks: 5, correctAnswers: 1, totalQuestions: 2, percentage: 40, startedAt: new Date(), submittedAt: new Date(), timeTakenSeconds: 10 };
  t.mock.method(Attempt, "findById", () => ({ populate: async () => attempt }));
  const res = response(); await getAttemptResult({ user: person, params: { attemptId } }, res);
  assert.equal(res.body.result.percentage, 40);
  const denied = response(); await getAttemptResult({ user: { _id: quizId }, params: { attemptId } }, denied);
  assert.equal(denied.code, 403);
  t.mock.method(Attempt, "find", filter => {
    assert.deepEqual(filter, { user: userId, status: "submitted" });
    return { populate: () => ({ sort: async () => [attempt] }) };
  });
  const history = response(); await getMyAttempts({ user: person }, history);
  assert.equal(history.body.attempts[0].score, 2);
});
