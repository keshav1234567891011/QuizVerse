import assert from "node:assert/strict";
import test from "node:test";
import { migrateRoles } from "../src/scripts/migrateRoles.js";
import { backfillPublicIds, missingPublicId } from "../src/scripts/backfillPublicIds.js";

test("role migration preserves creators, normalizes admin email, and uses one transaction", async () => {
  const session = {}, writes = [];
  const rows = [
    { _id: "creator", email: "creator@example.test", role: "user" },
    { _id: "learner", email: "learner@example.test", role: "user" },
    { _id: "owner", email: "owner@example.test", role: "teacher" },
    { _id: "admin", email: "admin@example.test", role: "admin" },
  ];
  const users = {
    findOne: ({ email }) => ({ session: actual => { assert.equal(actual, session); return rows.find(row => row.email === email); } }),
    updateMany: async (filter, update, options) => {
      assert.equal(options.session, session); assert.equal(options.runValidators, true);
      writes.push(filter);
      const selected = rows.filter(row => row.role === filter.role && (!filter._id || filter._id.$in.includes(row._id)));
      selected.forEach(row => Object.assign(row, update.$set));
      return { modifiedCount: selected.length };
    },
    updateOne: async (filter, update, options) => {
      assert.equal(options.session, session);
      Object.assign(rows.find(row => row._id === filter._id), update.$set);
    },
  };
  const dependencies = {
    users,
    quizzes: { distinct: field => ({ session: actual => { assert.equal(field, "creator"); assert.equal(actual, session); return ["creator"]; } }) },
    connection: { transaction: callback => callback(session) },
  };
  assert.deepEqual(await migrateRoles(" OWNER@example.test ", dependencies), { teachers: 1, students: 1, adminEmail: "owner@example.test" });
  assert.deepEqual(rows.map(row => row.role), ["teacher", "student", "admin", "admin"]);
  assert.deepEqual(await migrateRoles("owner@example.test", dependencies), { teachers: 0, students: 0, adminEmail: "owner@example.test" });
  const before = writes.length;
  await assert.rejects(migrateRoles("missing@example.test", dependencies), /Admin account not found/);
  assert.equal(writes.length, before);
  await assert.rejects(migrateRoles("", dependencies), /Provide the email/);
});

test("public ID backfill preserves existing IDs, is rerunnable, and retries collisions", async () => {
  const rows = [{ _id: "missing" }, { _id: "empty", publicId: "" }, { _id: "null", publicId: null }, { _id: "existing", publicId: "QV-1234ABCD" }];
  const needsId = row => !row.publicId;
  let collision = true;
  const collection = {
    find: filter => {
      assert.deepEqual(filter, missingPublicId);
      return { project: () => rows.filter(needsId).map(row => ({ _id: row._id })) };
    },
    findOne: async ({ publicId }) => rows.find(row => row.publicId === publicId),
    updateOne: async (filter, update) => {
      assert.deepEqual(filter.$or, missingPublicId.$or);
      if (collision) { collision = false; throw Object.assign(new Error("collision"), { code: 11000 }); }
      const row = rows.find(row => row._id === filter._id && needsId(row));
      if (!row) return { modifiedCount: 0 };
      row.publicId = update.$set.publicId;
      return { modifiedCount: 1 };
    },
    countDocuments: async () => rows.filter(needsId).length,
  };
  assert.equal(await backfillPublicIds(collection), 3);
  for (const row of rows) assert.match(row.publicId, /^QV-[A-F0-9]{8}$/);
  assert.equal(rows[3].publicId, "QV-1234ABCD");
  assert.equal(new Set(rows.map(row => row.publicId)).size, 4);
  assert.equal(await backfillPublicIds(collection), 0);
});
