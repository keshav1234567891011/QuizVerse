import crypto from "node:crypto";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Quiz from "../src/models/Quiz.js";
import Group from "../src/models/Group.js";
import Assignment from "../src/models/Assignment.js";
import Attempt from "../src/models/Attempt.js";
import Notification from "../src/models/Notification.js";
import GroupMessage from "../src/models/GroupMessage.js";

export function matches(row, filter = {}) {
  const values = (value, path) => !path.length ? (Array.isArray(value) ? value : [value]) : Array.isArray(value) ? value.flatMap(v => values(v, path)) : values(value?.[path[0]], path.slice(1));
  return !!row && Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some(f => matches(row, f));
    if (key === "$and") return expected.every(f => matches(row, f));
    const actual = values(row, key.split("."));
    if (expected instanceof RegExp) return actual.some(v => expected.test(String(v ?? "")));
    if (expected && typeof expected === "object" && !(expected instanceof Date)) return Object.entries(expected).every(([op, value]) => {
      if (op === "$in") return actual.some(v => value.some(x => String(x) === String(v)));
      if (op === "$ne") return actual.every(v => value === null ? v != null : String(v) !== String(value));
      if (op === "$exists") return value ? actual.some(v => v !== undefined) : actual.every(v => v === undefined);
      if (op === "$gt") return actual.some(v => v != null && new Date(v) > new Date(value));
      if (op === "$gte") return actual.some(v => v != null && new Date(v) >= new Date(value));
      if (op === "$lte") return actual.some(v => v != null && new Date(v) <= new Date(value));
      throw new Error(`Unsupported fixture operator ${op}`);
    });
    return actual.some(v => expected === null ? v == null : String(v) === String(expected));
  });
}
export function adminFixture(t) {
  const id = () => crypto.randomBytes(12).toString("hex"), now = new Date();
  const admin = { _id: id(), publicId: "QV-11111111", name: "Admin", email: "admin@example.test", role: "admin", accountStatus: "active", createdAt: now };
  const teacher = { _id: id(), publicId: "QV-22222222", name: "Teacher", email: "teacher@example.test", role: "teacher", accountStatus: "active", createdAt: now };
  const student = { _id: id(), publicId: "QV-33333333", name: "Student", email: "student@example.test", role: "student", createdAt: now };
  const state = { users: [admin, teacher, student], quizzes: [], groups: [], assignments: [], attempts: [], notifications: [], messages: [] };
  state.quizzes.push({ _id: id(), publicId: crypto.randomUUID(), creator: teacher._id, title: "Advanced", description: "Test content", category: "Science", difficulty: "easy", status: "published", moderationState: "active", visibility: "public", timerMode: "none", questions: [{ _id: id(), questionText: "Two?", options: ["Two", "Three"], correctOption: 0, marks: 1, timeLimit: 30 }], createdAt: now });
  state.groups.push({ _id: id(), name: "Classroom", groupCode: "GRP-AAAAAAAA", description: "Learning", teacher: teacher._id, students: [student._id], status: "active", membershipRevision: 0, createdAt: now });
  state.assignments.push({ _id: id(), quiz: state.quizzes[0]._id, group: state.groups[0]._id, teacher: teacher._id, title: "Advanced", shareToken: crypto.randomBytes(24).toString("hex"), groupSnapshot: { name: "Classroom", groupCode: "GRP-AAAAAAAA" }, assignedStudents: [{ user: student._id, name: student.name, publicId: student.publicId }], status: "published", dueAt: null, opensAt: null, attemptLimit: 2, publishedAt: now, createdAt: now, quizSnapshot: { questions: state.quizzes[0].questions } });
  state.attempts.push({ _id: id(), publicId: crypto.randomUUID(), quiz: state.quizzes[0]._id, assignment: state.assignments[0]._id, user: student._id, status: "submitted", score: 1, totalMarks: 1, percentage: 100, attemptNumber: 1, submittedAt: now, createdAt: now, startedAt: now, answers: [{ correctOption: 0 }], quizSnapshot: { secret: "grading-key" }, review: [{ key: "0", questionText: "Two?", questionType: "singleChoice", submittedAnswer: "Two", state: "correct", earnedMarks: 1, availableMarks: 1 }] });
  const collections = new Map([[User, "users"], [Quiz, "quizzes"], [Group, "groups"], [Assignment, "assignments"], [Attempt, "attempts"], [Notification, "notifications"], [GroupMessage, "messages"]]);
  const populations = { teacher: "users", creator: "users", user: "users", group: "groups", quiz: "quizzes", assignment: "assignments" };
  const project = (row, fields) => {
    if (!row) return null;
    if (!fields || fields.includes("+password")) return structuredClone(row);
    const output = { _id: row._id };
    for (const f of fields.split(" ")) if (f && row[f.split(".")[0]] !== undefined) output[f.split(".")[0]] = structuredClone(row[f.split(".")[0]]);
    return output;
  };
  function populate(row, specs) {
    for (const { path, select } of specs) {
      const target = state[populations[path]].find(r => String(r._id) === String(row[path]?._id || row[path]));
      row[path] = target ? project(target, select) : null;
    }
    return row;
  }
  function document(row) {
    if (!row) return null;
    Object.defineProperty(row, "save", { configurable: true, value: async () => row });
    Object.defineProperty(row, "toObject", { configurable: true, value: () => structuredClone(row) });
    return row;
  }
  function query(rows) {
    let fields, sort, skip = 0, limit = Infinity, lean = false, specs = [];
    const request = { select(value) { fields = value; return this; }, sort(value) { sort = value; return this; }, skip(value) { skip = value; return this; }, limit(value) { limit = value; return this; }, session() { return this; }, lean() { lean = true; return this; }, populate(path, select) { specs.push({ path, select }); return this; }, then(resolve, reject) {
      try {
        const list = Array.isArray(rows) ? [...rows] : rows;
        if (Array.isArray(list) && sort) list.sort((a, b) => { for (const [key, dir] of Object.entries(sort)) { const x = a[key], y = b[key]; if (x < y) return -dir; if (x > y) return dir; } return 0; });
        const read = row => lean || fields || specs.length ? populate(project(row, fields), specs) : document(row);
        const result = Array.isArray(list) ? list.slice(skip, skip + limit).map(read) : list ? read(list) : null;
        return Promise.resolve(result).then(resolve, reject);
      } catch (error) { return Promise.reject(error).then(resolve, reject); }
    } };
    return request;
  }
  t.mock.method(mongoose.connection, "transaction", async callback => callback({}));
  for (const [Model, collection] of collections) {
    t.mock.method(Model, "find", filter => query(state[collection].filter(row => matches(row, filter))));
    t.mock.method(Model, "findOne", filter => query(state[collection].find(row => matches(row, filter))));
    t.mock.method(Model, "findById", value => query(state[collection].find(row => String(row._id) === String(value))));
    t.mock.method(Model, "exists", filter => query(state[collection].find(row => matches(row, filter)) ? { _id: id() } : null));
    t.mock.method(Model, "countDocuments", async filter => state[collection].filter(row => matches(row, filter)).length);
    t.mock.method(Model, "findOneAndUpdate", (filter, update) => {
      const row = state[collection].find(row => matches(row, filter));
      if (row) { Object.assign(row, update.$set || {}); for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value; }
      return query(row);
    });
  }
  t.mock.method(Assignment, "populate", async (row, specs) => populate(row, specs));
  return { state, admin, teacher, student, id };
}
