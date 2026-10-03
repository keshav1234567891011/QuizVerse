import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import test, { before, after } from "node:test";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
const app = createApp();
import { adminFixture } from "../test-support/adminFixture.js";
import { submitAttempt, startAttempt } from "../src/controllers/attemptController.js";
import { gradeAnswers } from "../src/services/scoringService.js";
import { mixedQuestions, mixedResponses } from "../test-support/assignmentFixture.js";
let server, base;
const secret = crypto.randomBytes(32).toString("hex"), previousSecret = process.env.JWT_SECRET;
before(async () => { process.env.JWT_SECRET = secret; server = app.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}/api`; });
after(async () => { await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
const cookie = user => `token=${jwt.sign({ userId: user._id }, secret)}`;
async function request(user, path, method = "GET", body) {
  const response = await fetch(`${base}/${path}`, { method, headers: { ...(user ? { Cookie: cookie(user) } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
test("every admin endpoint rejects anonymous, student and teacher requests before resource operations", async t => {
  const f = adminFixture(t);
  const paths = [["dashboard"], ["users"], ["users/QV-33333333"], ["users/QV-33333333/role", "PATCH", { role: "teacher" }], ["users/QV-33333333/status", "PATCH", { accountStatus: "suspended" }], ["quizzes"], ["quizzes/bad"], ["quizzes/bad/moderation", "PATCH", { action: "restrict" }], ["groups"], ["groups/GRP-AAAAAAAA"], ["groups/GRP-AAAAAAAA/status", "PATCH", { status: "archived" }], ["assignments"], ["assignments/bad"], ["assignments/bad/analytics"], ["attempts"], ["attempts/bad"]];
  for (const actor of [null, f.student, f.teacher]) for (const [path, method, body] of paths) assert.equal((await request(actor, `admin/${path}`, method, body)).status, actor ? 403 : 401, path);
});
test("admin HTTP vertical flow loads metrics, changes role, suspends, moderates and inspects platform records", async t => {
  const f = adminFixture(t);
  assert.equal((await request(f.admin, "admin/dashboard")).data.dashboard.metrics.totalUsers, 3);
  assert.equal((await request(f.admin, "admin/users?search=QV-33333333&role=student")).data.users.total, 1);
  assert.equal((await request(f.admin, `admin/users/${f.student.publicId}/role`, "PATCH", { role: "teacher" })).status, 200);
  assert.equal((await request(f.admin, `admin/users/${f.student.publicId}/role`, "PATCH", { role: "admin" })).status, 400);
  assert.equal((await request(f.admin, `admin/users/${f.student.publicId}/status`, "PATCH", { accountStatus: "suspended" })).status, 200);
  assert.equal((await request(f.student, "auth/me")).status, 403);
  assert.equal((await request(f.admin, `admin/users/${f.student.publicId}/status`, "PATCH", { accountStatus: "active" })).status, 200);
  assert.equal((await request(f.student, "auth/me")).status, 200);
  const ref = f.state.quizzes[0].publicId;
  assert.equal((await request(f.admin, `admin/quizzes/${ref}/moderation`, "PATCH", { action: "restrict" })).status, 200);
  assert.equal((await request(f.admin, "admin/groups/GRP-AAAAAAAA/status", "PATCH", { status: "archived" })).status, 200);
  for (const path of ["admin/quizzes", "admin/groups", "admin/assignments", "admin/attempts", `admin/assignments/${f.state.assignments[0].shareToken}/analytics`, `admin/attempts/${f.state.attempts[0].publicId}`]) {
    const result = await request(f.admin, path); assert.equal(result.status, 200, path);
    for (const key of ["quizSnapshot", "password", "correctOption", "acceptedAnswers", "correctNumber", '"_id"']) assert.ok(!JSON.stringify(result.data).includes(key), key);
  }
});
test("legacy status is active; suspension rejects login and existing cookies, logout remains available", async t => {
  const f = adminFixture(t), fixturePassword = "fixture-pass";
  f.student.password = await bcrypt.hash(fixturePassword, 4);
  assert.equal((await request(f.student, "auth/me")).status, 200);
  assert.equal((await request(null, "auth/login", "POST", { email: f.student.email, password: fixturePassword })).status, 200);
  f.student.accountStatus = "suspended";
  assert.equal((await request(null, "auth/login", "POST", { email: f.student.email, password: fixturePassword })).status, 403);
  assert.equal((await request(f.student, "attempts/mine")).status, 403);
  assert.equal((await request(f.student, "auth/logout", "POST")).status, 200);
  f.student.accountStatus = "active";
  assert.equal((await request(f.student, "auth/me")).status, 200);
  assert.equal((await request(null, "auth/register", "POST", { name: "Denied", email: "denied@example.test", password: fixturePassword, role: "admin" })).status, 400);
});
test("restricted quiz blocks public play/new starts and teacher republishing, even when status is published", async t => {
  const f = adminFixture(t); const q = f.state.quizzes[0]; q.moderationState = "restricted";
  assert.equal((await request(null, `quizzes/play/${q._id}`)).status, 403);
  assert.equal((await request(null, "quizzes/public")).data.quizzes.length, 0);
  assert.equal((await request(f.teacher, `quizzes/${q._id}`, "PUT", { status: "published", moderationState: "active" })).status, 409);
  const result = response(); await startAttempt({ user: f.student, params: { quizId: q._id } }, result); assert.equal(result.code, 403);
});
test("already-started frozen standalone attempt grades after source restriction", async t => {
  const f = adminFixture(t), frozen = mixedQuestions(), attempt = f.state.attempts[0];
  Object.assign(attempt, { assignment: null, status: "in-progress", quizSnapshot: { questions: frozen }, startedAt: new Date(), answers: [] });
  f.state.quizzes[0].moderationState = "restricted"; f.state.quizzes[0].status = "draft";
  // A select with +quizSnapshot returns the live mock document, like Mongoose.
  const Attempt = (await import("../src/models/Attempt.js")).default;
  t.mock.method(Attempt, "findById", () => ({ select: async () => { attempt.save = async () => {}; return attempt; } }));
  const res = response();
  await submitAttempt({ user: f.student, params: { attemptId: attempt._id }, body: { answers: mixedResponses().map((a, i) => ({ questionId: frozen[i]._id, ...a })) } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.result.score, gradeAnswers(frozen, mixedResponses().map((a, i) => ({ questionId: frozen[i]._id, ...a }))).score);
  assert.ok(!JSON.stringify(res.body).includes("correctOption"));
});
