import crypto from "node:crypto";
import Notification from "../src/models/Notification.js";
import GroupMessage from "../src/models/GroupMessage.js";
import Assignment from "../src/models/Assignment.js";
import Group from "../src/models/Group.js";
import User from "../src/models/User.js";
import { assignmentFixture } from "./assignmentFixture.js";

export function communicationsFixture(t) {
  const f = assignmentFixture(t); f.state.messages = [];
  const values = (row, path) => {
    if (!path.length) return Array.isArray(row) ? row : [row];
    if (Array.isArray(row)) return row.flatMap(x => values(x, path));
    return values(row?.[path[0]], path.slice(1));
  };
  const compare = (a, b) => a instanceof Date || b instanceof Date ? new Date(a).getTime() - new Date(b).getTime() : String(a).localeCompare(String(b));
  const matches = (row, filter) => row && Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some(branch => matches(row, branch));
    const actual = values(row, key.split("."));
    if (value === null) return actual.some(a => a == null);
    if (value && typeof value === "object" && !(value instanceof Date)) return actual.some(a => Object.entries(value).every(([op, b]) => {
      if (op === "$in") return b.some(x => String(x) === String(a));
      const difference = compare(a, b);
      return op === "$gt" ? difference > 0 : op === "$gte" ? difference >= 0 : op === "$lt" ? difference < 0 : op === "$lte" ? difference <= 0 : op === "$ne" ? difference !== 0 : false;
    }));
    return actual.some(a => compare(a, value) === 0);
  });
  const query = initial => {
    let result = initial;
    return { session() { return this; }, select() { return this; },
      sort(order) { if (Array.isArray(result)) result = [...result].sort((a, b) => {
        for (const [key, direction] of Object.entries(order)) { const difference = compare(a[key], b[key]); if (difference) return direction * difference; } return 0;
      }); return this; },
      limit(n) { if (Array.isArray(result)) result = result.slice(0, n); return this; },
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
  };
  for (const [Model, key] of [[Notification, "notifications"], [GroupMessage, "messages"], [Assignment, "assignments"], [Group, "groups"], [User, "users"]]) {
    t.mock.method(Model, "find", filter => query(f.state[key].filter(row => matches(row, filter))));
    t.mock.method(Model, "findOne", filter => query(f.state[key].find(row => matches(row, filter)) || null));
    t.mock.method(Model, "countDocuments", filter => query(f.state[key].filter(row => matches(row, filter)).length));
  }
  t.mock.method(Notification, "findOneAndUpdate", async (filter, update) => {
    const row = f.state.notifications.find(row => matches(row, filter));
    if (row) Object.assign(row, update.$set); return row || null;
  });
  t.mock.method(Notification, "updateMany", async (filter, update) => {
    for (const row of f.state.notifications.filter(row => matches(row, filter))) Object.assign(row, update.$set);
  });
  t.mock.method(GroupMessage, "create", async ([input]) => {
    const row = { ...input, _id: crypto.randomBytes(12).toString("hex"), publicId: crypto.randomUUID(), createdAt: new Date() };
    f.state.messages.push(row); return [row];
  });
  return f;
}
