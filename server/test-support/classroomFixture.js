import crypto from "node:crypto";
import Notification from "../src/models/Notification.js";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Group from "../src/models/Group.js";
import User from "../src/models/User.js";
import GroupInvitation from "../src/models/GroupInvitation.js";
import Assignment from "../src/models/Assignment.js";

// Service tests use a transactional store double. Actual MongoDB concurrency is
// covered separately by the opt-in integration test; this double cannot prove it.
export function classroomFixture(t) {
  const teacher = { _id: "teacher", role: "teacher", publicId: "QV-11111111" };
  const student = { _id: "student", role: "student", publicId: "QV-22222222" };
  const otherStudent = { _id: "other-student", role: "student", publicId: "QV-33333333" };
  const otherTeacher = { _id: "other-teacher", role: "teacher", publicId: "QV-44444444" };
  const admin = { _id: "admin", role: "admin", publicId: "QV-55555555" };
  let state = {
    group: { _id: "group", teacher: teacher._id, groupCode: "GRP-1234ABCD", students: [], status: "active", membershipRevision: 0 },
    users: [teacher, student, otherStudent, otherTeacher, admin],
    requests: [], notifications: [],
  };
  const session = {};
  let queue = Promise.resolve();
  const matches = (record, filter) => record && Object.entries(filter).every(([key, value]) => record[key] === value);
  const query = value => ({ session(actual) { assert.equal(actual, session); return Promise.resolve(value); } });
  const requestDocument = row => {
    if (!row) return null;
    Object.defineProperty(row, "save", { configurable: true, value: async options => {
      assert.equal(options.session, session);
      return row;
    } });
    return row;
  };

  t.mock.method(mongoose.connection, "transaction", callback => {
    const next = queue.then(async () => {
      const snapshot = structuredClone(state);
      try { return await callback(session); }
      catch (error) { state = snapshot; throw error; }
    });
    queue = next.catch(() => {});
    return next;
  });
  t.mock.method(Group, "findOneAndUpdate", async (filter, update, options) => {
    assert.equal(options.session, session);
    if (!matches(state.group, filter)) return null;
    state.group.membershipRevision += update.$inc.membershipRevision;
    return state.group;
  });
  t.mock.method(Group, "findById", id => query(state.group?._id === id ? state.group : null));
  t.mock.method(Group, "updateOne", async (filter, update, options) => {
    assert.equal(options.session, session);
    assert.ok(matches(state.group, filter));
    if (update.$addToSet && !state.group.students.includes(update.$addToSet.students)) state.group.students.push(update.$addToSet.students);
    if (update.$pull) state.group.students = state.group.students.filter(id => id !== update.$pull.students);
  });
  t.mock.method(Group, "deleteOne", async (filter, options) => {
    assert.equal(options.session, session);
    assert.ok(matches(state.group, filter));
    state.group = null;
  });
  t.mock.method(User, "findOne", filter => query(state.users.find(user => matches(user, filter))));
  t.mock.method(GroupInvitation, "exists", filter => query(state.requests.some(row => matches(row, filter))));
  t.mock.method(GroupInvitation, "create", async ([input], options) => {
    assert.equal(options.session, session);
    const row = { ...input, publicId: crypto.randomUUID(), status: "pending", respondedAt: null };
    state.requests.push(row);
    return [requestDocument(row)];
  });
  t.mock.method(GroupInvitation, "findOne", filter => query(requestDocument(state.requests.find(row => matches(row, filter)))));
  t.mock.method(GroupInvitation, "updateMany", async (filter, update, options) => {
    assert.equal(options.session, session);
    for (const row of state.requests.filter(row => matches(row, filter))) Object.assign(row, update.$set);
  });
  t.mock.method(Assignment, "updateMany", async (_filter, _update, options) => {
    assert.equal(options.session, session);
  });
  t.mock.method(Notification, "bulkWrite", async (operations, options) => {
    assert.equal(options.session, session);
    for (const { updateOne: op } of operations) {
      if (!state.notifications.some(row => String(row.recipient) === String(op.filter.recipient) && row.eventKey === op.filter.eventKey)) {
        state.notifications.push({ ...op.update.$setOnInsert, createdAt: new Date() });
      }
    }
  });
  return { teacher, student, otherStudent, otherTeacher, admin, get state() { return state; } };
}
