import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import User from "../src/models/User.js";
import { bootstrapAdmin } from "../src/scripts/bootstrapAdmin.js";

const environment = () => ({ MONGO_URI: "mongodb://fixture.invalid/quizverse_prod", ADMIN_EMAIL: " KeshavBansal634@gmail.com ", ADMIN_PASSWORD: "fake-test-password" });
function fixture({ existing = null, otherAdmin = false, failure = false } = {}) {
  const calls = { connects: 0, disconnects: 0, creates: [], hashes: [], output: [] };
  const driver = { connect: async (uri, options) => { calls.connects++; assert.equal(options.dbName, "quizverse_prod"); assert.equal(options.autoIndex, false); assert.equal(options.autoCreate, false); if (failure) throw new Error("private URI/password error"); }, disconnect: async () => { calls.disconnects++; } };
  const Model = {
    findOne: filter => { assert.deepEqual(filter, { email: "keshavbansal634@gmail.com" }); return { select: fields => { assert.equal(fields, "email role publicId"); return { lean: async () => existing }; } }; },
    exists: async filter => { assert.deepEqual(filter, { role: "admin", email: { $ne: "keshavbansal634@gmail.com" } }); return otherAdmin; },
    create: async input => { calls.creates.push(input); const user = new User(input); await user.validate(); return user; },
  };
  const options = { driver, Model, hash: async (password, cost) => { calls.hashes.push(cost); return bcrypt.hash(password, cost); }, output: value => calls.output.push(value) };
  return { calls, options };
}
test("bootstrap creates exactly one active admin with normalized email, generated QV ID and registration bcrypt cost", async () => {
 const f = fixture(), env = environment(); assert.equal(await bootstrapAdmin({ ...f.options, env }), 0);
 assert.equal(f.calls.creates.length, 1); const user = f.calls.creates[0];
 assert.equal(user.email, "keshavbansal634@gmail.com"); assert.equal(user.name, "Keshav Bansal"); assert.equal(user.role, "admin"); assert.equal(user.accountStatus, "active");
 assert.equal(user.publicId, undefined); assert.deepEqual(f.calls.hashes, [12]); assert.equal(await bcrypt.compare(env.ADMIN_PASSWORD, user.password), true);
 const result = JSON.parse(f.calls.output[0]); assert.match(result.publicId, /^QV-[A-F0-9]{8}$/); assert.equal(result.state, "created");
 for (const secret of [env.MONGO_URI, env.ADMIN_PASSWORD, user.password]) assert.equal(f.calls.output.join("").includes(secret), false);
 assert.equal(f.calls.disconnects, 1);
});
test("same existing admin is idempotent and never changes credentials or status", async () => {
 const f = fixture({ existing: { role: "admin", publicId: "QV-AAAAAAAA" } });
 assert.equal(await bootstrapAdmin({ ...f.options, env: environment() }), 0);
 assert.equal(JSON.parse(f.calls.output[0]).state, "already-exists"); assert.equal(f.calls.creates.length, 0); assert.equal(f.calls.hashes.length, 0); assert.equal(f.calls.disconnects, 1);
});
test("student/teacher email and a different existing admin stop without writes", async () => {
 for (const settings of [{ existing: { role: "student" } }, { existing: { role: "teacher" } }, { otherAdmin: true }, { existing: { role: "admin" }, otherAdmin: true }]) {
  const f = fixture(settings); assert.equal(await bootstrapAdmin({ ...f.options, env: environment() }), 1);
  assert.equal(f.calls.creates.length, 0); assert.equal(f.calls.hashes.length, 0); assert.equal(f.calls.disconnects, 1);
 }
});
test("invalid URI/database or credentials stop before connecting", async () => {
 for (const change of [{ MONGO_URI: "invalid" }, { MONGO_URI: "mongodb://fixture.invalid/development" }, { MONGO_URI: "mongodb://fixture.invalid" }, { ADMIN_EMAIL: "" }, { ADMIN_PASSWORD: "short" }, { ADMIN_PASSWORD: "x".repeat(73) }, { ADMIN_PASSWORD: "é".repeat(37) }]) {
  const f = fixture(); assert.equal(await bootstrapAdmin({ ...f.options, env: { ...environment(), ...change } }), 1);
  assert.equal(f.calls.connects, 0); assert.equal(f.calls.creates.length, 0); assert.equal(f.calls.disconnects, 1);
 }
});
test("password accepts six characters and exactly 72 UTF-8 bytes", async () => {
 for (const password of ["sixsix", "é".repeat(36)]) {
  const f = fixture({ existing: { role: "admin", publicId: "QV-AAAAAAAA" } });
  assert.equal(await bootstrapAdmin({ ...f.options, env: { ...environment(), ADMIN_PASSWORD: password } }), 0);
 }
});
test("connection/write/disconnect failures are nonzero and never expose private errors", async () => {
 for (const phase of ["connect", "create", "disconnect"]) {
  const f = fixture({ failure: phase === "connect" });
  if (phase === "create") f.options.Model.create = async () => { throw new Error("private URI/password error"); };
  if (phase === "disconnect") f.options.driver.disconnect = async () => { f.calls.disconnects++; throw new Error("private URI/password error"); };
  assert.equal(await bootstrapAdmin({ ...f.options, env: environment() }), 1);
  assert.equal(f.calls.output.join("").includes("private URI/password error"), false); assert.equal(f.calls.output.join("").includes(environment().MONGO_URI), false); assert.equal(f.calls.output.join("").includes(environment().ADMIN_PASSWORD), false);
  assert.equal(f.calls.disconnects, 1);
 }
});
