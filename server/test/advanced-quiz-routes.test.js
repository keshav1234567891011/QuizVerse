import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import test, { before, after } from "node:test";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
const app = createApp();
import Quiz from "../src/models/Quiz.js";
import Attempt from "../src/models/Attempt.js";
import User from "../src/models/User.js";
import { mixedQuestions, mixedResponses } from "../test-support/assignmentFixture.js";
const teacher = { _id: "507f1f77bcf86cd799439011", role: "teacher", name: "Teacher" }, student = { _id: "507f1f77bcf86cd799439013", role: "student", name: "Student" };
const secret = crypto.randomBytes(32).toString("hex"), previous = process.env.JWT_SECRET;
let server, base;
before(async () => { process.env.JWT_SECRET = secret; server = app.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}/api`; });
after(async () => { await new Promise(resolve => server.close(resolve)); if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; });
const request = async (user, path, method = "GET", body) => {
  const response = await fetch(`${base}/${path}`, { method, headers: { "Content-Type": "application/json", ...(user ? { Cookie: `token=${jwt.sign({ userId: user._id }, secret)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
};
function fixture(t) {
  let quiz, attempt;
  t.mock.method(User, "findById", async id => [teacher, student].find(u => u._id === id));
  t.mock.method(Quiz, "create", async input => {
    quiz = new Quiz(input); await quiz.validate();
    quiz.save = async () => { await quiz.validate(); return quiz; }; return quiz;
  });
  t.mock.method(Quiz, "findById", async () => quiz);
  t.mock.method(Attempt, "create", async input => { attempt = new Attempt(input); await attempt.validate(); attempt.save = async () => { await attempt.validate(); return attempt; }; return attempt; });
  t.mock.method(Attempt, "findById", () => ({ select: async () => attempt, populate: async () => ({ ...attempt.toObject(), quiz: { _id: quiz._id, title: quiz.title } }) }));
  return { get quiz() { return quiz; }, get attempt() { return attempt; } };
}
test("mixed quiz HTTP flow creates, publishes, safely plays and persists frozen standalone results", async t => {
  const f = fixture(t), raw = mixedQuestions().map(({ _id, ...q }) => { void _id; return q; });
  const created = await request(teacher, "quizzes", "POST", { title: "Six types", category: "Science", timerMode: "none", status: "published", visibility: "public", questions: raw });
  assert.equal(created.status, 201); const quizId = created.data.quiz._id;
  assert.equal((await request(student, "quizzes", "POST", { title: "Denied" })).status, 403);
  const playable = await request(null, `quizzes/play/${quizId}`); assert.equal(playable.status, 200);
  const start = await request(student, `attempts/start/${quizId}`, "POST"); assert.equal(start.status, 201);
  const frozen = start.data.quiz, answers = mixedResponses().map((a, i) => ({ questionId: frozen.questions[i]._id, ...a }));
  for (const name of ["correctOption", "correctBoolean", "acceptedAnswers", "correctNumber", "numericTolerance", '"blanks"', "quizSnapshot"]) assert.ok(!JSON.stringify({ playable: playable.data, start: start.data }).includes(name));
  f.quiz.questions[0].correctOption = 1; f.quiz.questions[3].acceptedAnswers = ["Changed"]; f.quiz.questions[4].correctNumber = 100;
  const submit = await request(student, `attempts/${start.data.attempt._id}/submit`, "POST", { answers, score: 999 });
  assert.equal(submit.status, 200); assert.equal(submit.data.result.score, 12); assert.equal(submit.data.result.review.length, 6);
  assert.equal(submit.data.result.review[2].submittedAnswer, "False"); assert.equal(submit.data.result.review[4].submittedAnswer, "0");
  const saved = await request(student, `attempts/${start.data.attempt._id}`); assert.equal(saved.status, 200); assert.equal(saved.data.result.review.length, 6);
  for (const name of ["correctOption", "acceptedAnswers", "correctNumber", "numericTolerance", "quizSnapshot"]) assert.ok(!JSON.stringify(saved.data).includes(name));
});
test("quiz editing preserves/reorders IDs, strips old type fields and rejects foreign/duplicate IDs", async t => {
  const f = fixture(t), create = await request(teacher, "quizzes", "POST", { title: "Edit quiz", category: "Science", questions: mixedQuestions().slice(0, 2).map(({ _id, ...q }) => { void _id; return q; }), timerMode: "none" });
  assert.equal(create.status, 201); const id = create.data.quiz._id, old = f.quiz.questions.map(q => q.toObject());
  const reversed = [...old].reverse(); const update = await request(teacher, `quizzes/${id}`, "PUT", { questions: reversed });
  assert.equal(update.status, 200); assert.deepEqual(update.data.quiz.questions.map(q => q._id), reversed.map(q => String(q._id)));
  for (const list of [[old[0], old[0]], [{ ...old[0], _id: "507f1f77bcf86cd799439099" }]]) assert.equal((await request(teacher, `quizzes/${id}`, "PUT", { questions: list })).status, 400);
  const changed = await request(teacher, `quizzes/${id}`, "PUT", { questions: [{ ...old[0], questionType: "shortAnswer", acceptedAnswers: ["A"] }] });
  assert.equal(changed.status, 200); assert.equal(changed.data.quiz.questions[0]._id, String(old[0]._id)); assert.ok(!("correctOption" in changed.data.quiz.questions[0]));
  assert.equal((await request(student, `quizzes/${id}`, "PUT", { questions: [] })).status, 403);
});
test("malformed quiz create/update/publish configurations return actionable 400 responses", async t => {
  fixture(t);
  const q = { questionType: "numeric", questionText: "Value", correctNumber: 0, numericTolerance: -1 };
  const bad = await request(teacher, "quizzes", "POST", { title: "Invalid quiz", category: "Science", questions: [q] });
  assert.equal(bad.status, 400); assert.match(bad.data.message, /tolerance/);
  const draft = await request(teacher, "quizzes", "POST", { title: "Empty quiz", category: "Science", questions: [] });
  assert.equal(draft.status, 201);
  assert.equal((await request(teacher, `quizzes/${draft.data.quiz._id}`, "PUT", { status: "published" })).status, 400);
});
