import crypto from "node:crypto";
import Notification from "../src/models/Notification.js";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Assignment from "../src/models/Assignment.js";
import Attempt from "../src/models/Attempt.js";
import Quiz from "../src/models/Quiz.js";
import Group from "../src/models/Group.js";
import User from "../src/models/User.js";

// In-memory transactional service double. It does not prove MongoDB locking;
// the optional replica-set test is kept separate and disabled by default.
export function assignmentFixture(t) {
  const id = () => crypto.randomBytes(12).toString("hex");
  const teacher = { _id: id(), name: "Teacher", role: "teacher", publicId: "QV-11111111" };
  const student = { _id: id(), name: "Student A", role: "student", publicId: "QV-22222222" };
  const studentB = { _id: id(), name: "Student B", role: "student", publicId: "QV-33333333" };
  const outsider = { _id: id(), name: "Outsider", role: "student", publicId: "QV-44444444" };
  const otherTeacher = { _id: id(), role: "teacher" }, admin = { _id: id(), role: "admin" };
  let state = {
    users: [teacher, student, studentB, outsider, otherTeacher, admin],
    groups: [
      { _id: id(), groupCode: "GRP-AAAAAAAA", name: "Class A", teacher: teacher._id, students: [student._id], status: "active", membershipRevision: 0 },
      { _id: id(), groupCode: "GRP-BBBBBBBB", name: "Class B", teacher: teacher._id, students: [studentB._id], status: "active", membershipRevision: 0 },
    ],
    quizzes: [{ _id: id(), creator: teacher._id, title: "Reusable JavaScript Quiz", description: "Frozen content", category: "Programming",
      difficulty: "easy", status: "published", visibility: "private", timerMode: "none", totalTimeLimit: null,
      questions: [{ _id: id(), questionText: "One plus one?", options: ["Two", "Three"], correctOption: 0, marks: 5, timeLimit: 5 },
        { _id: id(), questionText: "Two plus two?", options: ["Three", "Four"], correctOption: 1, marks: 5, timeLimit: 5 }] }],
    assignments: [], attempts: [], notifications: [],
  };
  const session = {};
  const values = (record, path) => {
    if (!path.length) return Array.isArray(record) ? record : [record];
    if (Array.isArray(record)) return record.flatMap(item => values(item, path));
    return values(record?.[path[0]], path.slice(1));
  };
  const matches = (record, filter) => record && Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some(branch => matches(record, branch));
    const actual = values(record, key.split("."));
    if (value && typeof value === "object" && "$in" in value) return actual.some(a => value.$in.some(x => String(x) === String(a)));
    if (value && typeof value === "object" && "$ne" in value) return actual.every(a => String(a) !== String(value.$ne));
    return actual.some(a => String(a) === String(value));
  });
  const query = value => ({ select() { return this; }, sort() { return this; },
    session(actual) { assert.equal(actual, session); return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
  const document = row => {
    if (!row) return null;
    Object.defineProperty(row, "save", { configurable: true, value: async options => {
      assert.equal(options.session, session); return row;
    } });
    return row;
  };
  let queue = Promise.resolve();
  t.mock.method(mongoose.connection, "transaction", callback => {
    const run = queue.then(async () => {
      const before = structuredClone(state);
      try { return await callback(session); } catch (error) { state = before; throw error; }
    });
    queue = run.catch(() => {}); return run;
  });
  for (const [Model, key] of [[Group, "groups"], [Quiz, "quizzes"], [Assignment, "assignments"], [Attempt, "attempts"], [User, "users"]]) {
    t.mock.method(Model, "findById", value => query(document(state[key].find(row => row._id === String(value)))));
    t.mock.method(Model, "findOne", filter => query(document(state[key].find(row => matches(row, filter)))));
    t.mock.method(Model, "find", filter => query(state[key].filter(row => matches(row, filter)).map(document)));
  }
  t.mock.method(Group, "findOneAndUpdate", async (filter, update, options) => {
    assert.equal(options.session, session);
    const row = state.groups.find(row => matches(row, filter));
    if (row) row.membershipRevision += update.$inc.membershipRevision;
    return row;
  });
  t.mock.method(Assignment, "findOneAndUpdate", (filter, update, options) => {
    assert.equal(options.session, session);
    const row = state.assignments.find(row => matches(row, filter));
    if (row) row.revision += update.$inc.revision;
    return query(document(row));
  });
  t.mock.method(Assignment, "create", async ([input], options) => {
    assert.equal(options.session, session);
    const row = { _id: id(), shareToken: crypto.randomBytes(24).toString("hex"), status: "draft", assignedStudents: [],
      quizSnapshot: null, publishedAt: null, createdAt: new Date(), revision: 0, ...input };
    state.assignments.push(row); return [document(row)];
  });
  t.mock.method(Attempt, "create", async ([input], options) => {
    assert.equal(options.session, session);
    const row = { _id: id(), publicId: crypto.randomUUID(), status: "in-progress", answers: [], currentQuestionIndex: 0, ...input };
    state.attempts.push(row); return [document(row)];
  });
  t.mock.method(Attempt, "exists", filter => query(state.attempts.some(row => matches(row, filter))));
  t.mock.method(Attempt, "countDocuments", filter => query(state.attempts.filter(row => matches(row, filter)).length));
  t.mock.method(Notification, "bulkWrite", async (operations, options) => {
    assert.equal(options.session, session);
    for (const { updateOne: op } of operations) {
      if (!state.notifications.some(row => String(row.recipient) === String(op.filter.recipient) && row.eventKey === op.filter.eventKey)) {
        state.notifications.push({ ...op.update.$setOnInsert, createdAt: new Date() });
      }
    }
  });
  return { teacher, student, studentB, outsider, otherTeacher, admin, get state() { return state; } };
}
