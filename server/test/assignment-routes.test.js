import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import test, { before, after } from "node:test";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
const app = createApp();
import { assignmentFixture } from "../test-support/assignmentFixture.js";

let server, base;
const secret = crypto.randomBytes(32).toString("hex"), previousSecret = process.env.JWT_SECRET;
before(async () => {
  process.env.JWT_SECRET = secret;
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
});
const request = (user, path, method = "GET", body) => fetch(`${base}/${path}`, { method,
  headers: { "Content-Type": "application/json", Cookie: `token=${jwt.sign({ userId: user._id }, secret, { expiresIn: "5m" })}` },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

test("authenticated assignment APIs complete publication, student attempt, persistent result and isolated teacher report", async t => {
  const f = assignmentFixture(t);
  // The existing auth middleware awaits User.findById; fixture queries are thenable.
  const created = await request(f.teacher, "assignments", "POST", { quizId: f.state.quizzes[0]._id, groupCode: "GRP-AAAAAAAA" });
  assert.equal(created.status, 201); const { assignment } = await created.json();
  const published = await request(f.teacher, `assignments/${assignment.token}`, "PATCH", { action: "publish" });
  assert.equal(published.status, 200);
  const list = await request(f.student, "assignments");
  assert.equal(list.status, 200); assert.equal((await list.json()).assignments[0].token, assignment.token);
  const opened = await request(f.student, `assignments/${assignment.token}`);
  assert.equal(opened.status, 200); assert.equal((await opened.json()).assignment.state, "open");
  const started = await request(f.student, `assignments/${assignment.token}/start`, "POST");
  assert.equal(started.status, 200); const { session } = await started.json();
  const safe = JSON.stringify(session); assert.ok(!safe.includes("correctOption")); assert.ok(!safe.includes("_id"));
  assert.equal((await request(f.student, `assignment-attempts/${session.publicId}/answer`, "PUT", { key: "0", selectedOption: 0 })).status, 200);
  const submitted = await request(f.student, `assignment-attempts/${session.publicId}/submit`, "POST", { score: 999 });
  assert.equal(submitted.status, 200); assert.equal((await submitted.json()).result.percentage, 50);
  const saved = await request(f.student, `assignment-attempts/${session.publicId}`);
  assert.equal(saved.status, 200); assert.equal((await saved.json()).result.assignment.token, assignment.token);
  const report = await request(f.teacher, `assignments/${assignment.token}/analytics`);
  assert.equal(report.status, 200); const analytics = (await report.json()).analytics;
  assert.equal(analytics.completedStudents, 1); assert.equal(analytics.averageScore, 50);
});
test("assignment API routes enforce student creation denial and token/attempt access independently of UI", async t => {
  const f = assignmentFixture(t);
  const input = { quizId: f.state.quizzes[0]._id, groupCode: "GRP-AAAAAAAA" };
  assert.equal((await request(f.student, "assignments", "POST", input)).status, 403);
  assert.equal((await request(f.otherTeacher, "assignments", "POST", input)).status, 403);
  const created = await request(f.teacher, "assignments", "POST", input);
  const { assignment } = await created.json();
  await request(f.teacher, `assignments/${assignment.token}`, "PATCH", { action: "publish" });
  assert.equal((await request(f.outsider, `assignments/${assignment.token}`)).status, 403);
  assert.equal((await request(f.outsider, `assignments/${assignment.token}/start`, "POST")).status, 403);
  assert.equal((await request(f.otherTeacher, `assignments/${assignment.token}`, "PATCH", { action: "close" })).status, 403);
  assert.equal((await request(f.admin, `assignments/${assignment.token}/analytics`)).status, 200);
  assert.equal((await request(f.student, `assignments/${assignment.token}/analytics`)).status, 403);
  const started = await request(f.student, `assignments/${assignment.token}/start`, "POST");
  const { session } = await started.json();
  assert.equal((await request(f.outsider, `assignment-attempts/${session.publicId}`)).status, 403);
  assert.equal((await request(f.outsider, `assignment-attempts/${session.publicId}/submit`, "POST")).status, 403);
});
test("assignment discovery hides drafts, unrelated classrooms and newly joined students outside the published roster", async t => {
  const f = assignmentFixture(t), input = { quizId: f.state.quizzes[0]._id, groupCode: "GRP-AAAAAAAA" };
  const draft = await request(f.teacher, "assignments", "POST", input);
  const { assignment } = await draft.json();
  const before = await request(f.student, "assignments"); assert.deepEqual((await before.json()).assignments, []);
  await request(f.teacher, `assignments/${assignment.token}`, "PATCH", { action: "publish" });
  f.state.groups[0].students.push(f.outsider._id);
  for (const user of [f.outsider, f.studentB, f.otherTeacher]) {
    const hidden = await request(user, "assignments"); assert.equal(hidden.status, 200); assert.deepEqual((await hidden.json()).assignments, []);
  }
  for (const user of [f.teacher, f.admin, f.student]) {
    const visible = await request(user, "assignments"); assert.equal(visible.status, 200); assert.equal((await visible.json()).assignments.length, 1);
  }
});
