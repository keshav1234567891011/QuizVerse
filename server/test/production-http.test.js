import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { errorMiddleware } from "../src/middleware/errorMiddleware.js";
import { adminFixture } from "../test-support/adminFixture.js";
let server, base;
const origin = "https://quiz.example.test", secret = crypto.randomBytes(32).toString("hex");
const previousMode = process.env.NODE_ENV, previousSecret = process.env.JWT_SECRET, previousReferenceSecret = process.env.ADMIN_REFERENCE_SECRET;
const config = { production: true, mode: "test", origins: [origin] };
before(async () => {
 process.env.NODE_ENV = "production"; process.env.JWT_SECRET = secret; process.env.ADMIN_REFERENCE_SECRET = crypto.randomBytes(32).toString("hex");
 const app = createApp({ config, initialize: async () => {}, consume: async () => ({ allowed: true }) });
 server = app.listen(0, "127.0.0.1"); await once(server, "listening"); base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
 await new Promise(resolve => server.close(resolve));
 if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
 if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
 if (previousReferenceSecret === undefined) delete process.env.ADMIN_REFERENCE_SECRET; else process.env.ADMIN_REFERENCE_SECRET = previousReferenceSecret;
});
const post = (body, headers = {}) => ({ method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
test("production CORS uses exact origins, credentialed preflight and never wildcard", async () => {
 const allowed = await fetch(base + "/api/health", { headers: { Origin: origin } }); assert.equal(allowed.status, 200);
 assert.equal(allowed.headers.get("access-control-allow-origin"), origin); assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
 const bad = await fetch(base + "/api/health", { headers: { Origin: "https://evil.example.test" } }); assert.equal(bad.headers.get("access-control-allow-origin"), null);
 const preflight = await fetch(base + "/api/auth/login", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } }); assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
 assert.equal((await fetch(base + "/api/health", { method: "HEAD" })).status, 200);
});
test("production mutations reject missing/foreign origins and non-JSON bodies before auth/database work", async () => {
 for (const path of ["login", "register", "logout"]) {
  const missing = await fetch(base + "/api/auth/" + path, { method: "POST" }); assert.equal(missing.status, 403);
  const bad = await fetch(base + "/api/auth/" + path, post({}, { Origin: "https://evil.example.test" })); assert.equal(bad.status, 403);
 }
 const form = await fetch(base + "/api/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, body: "email=test" }); assert.equal(form.status, 415);
 assert.equal((await fetch(base + "/api/auth/logout", { method: "POST", headers: { Origin: origin } })).status, 200);
});
test("unknown routes, malformed JSON and oversized bodies return safe JSON errors", async () => {
 const missing = await fetch(base + "/api/unknown"); assert.equal(missing.status, 404); assert.deepEqual(await missing.json(), { success: false, message: "API route not found." });
 const malformed = await fetch(base + "/api/auth/login", { ...post({}), body: '{"password":"sensitive",' }); assert.equal(malformed.status, 400); assert.deepEqual(await malformed.json(), { success: false, message: "Invalid JSON body." });
 const large = await fetch(base + "/api/auth/login", post({ password: "sensitive".repeat(15000) })); assert.equal(large.status, 413); assert.ok(!(await large.text()).includes("sensitive"));
});
test("production suspension blocks login/existing cookies while logout works and legacy active restores", async t => {
 const f = adminFixture(t); f.student.password = await bcrypt.hash("test-fixture-password", 4);
 const cookie = "token=" + jwt.sign({ userId: f.student._id }, secret, { algorithm: "HS256", expiresIn: "5m" });
 const profile = () => fetch(base + "/api/auth/me", { headers: { Cookie: cookie } });
 assert.equal((await profile()).status, 200);
 let login = await fetch(base + "/api/auth/login", post({ email: f.student.email, password: "test-fixture-password" })); assert.equal(login.status, 200);
 const set = login.headers.get("set-cookie"); for (const value of [/HttpOnly/i, /Secure/i, /SameSite=Lax/i, /Path=\//i, /Max-Age=604800/i]) assert.match(set, value); assert.ok(!/Domain=/i.test(set));
 f.student.accountStatus = "suspended"; login = await fetch(base + "/api/auth/login", post({ email: f.student.email, password: "test-fixture-password" })); assert.equal(login.status, 403); assert.equal((await profile()).status, 403);
 const logout = await fetch(base + "/api/auth/logout", { method: "POST", headers: { Origin: origin, Cookie: cookie } }); assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie"), /token=;/);
 f.student.accountStatus = "active"; assert.equal((await profile()).status, 200);
});
test("central 500 handling never serializes stack/credentials or grading keys", t => {
 t.mock.method(console, "error", () => {});
 let status, result; const res = { status(value) { status = value; return this; }, json(value) { result = value; } };
 errorMiddleware(Object.assign(new Error("mongodb secret password"), { quizSnapshot: { correctOption: 1 } }), {}, res, () => {});
 assert.equal(status, 500); assert.deepEqual(result, { success: false, message: "Could not complete the request." });
});
test("failed request initialization returns safe 503 and retries on later requests", async t => {
 t.mock.method(console, "error", () => {});
 let calls = 0;
 const app = createApp({ config, initialize: async () => { if (++calls === 1) throw new Error("mongodb credentials"); } });
 const instance = app.listen(0, "127.0.0.1"); await once(instance, "listening"); t.after(() => new Promise(resolve => instance.close(resolve)));
 const url = "http://127.0.0.1:" + instance.address().port + "/api/health";
 const failed = await fetch(url); assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes("credentials")); assert.equal((await fetch(url)).status, 200);
});

test("opaque legacy admin quiz/attempt references work through authorized APIs without ID/key leaks", async t => {
 const f = adminFixture(t); delete f.state.quizzes[0].publicId; delete f.state.attempts[0].publicId;
 const cookie = actor => "token=" + jwt.sign({ userId: actor._id }, secret, { expiresIn: "5m" });
 const request = (path, actor = f.admin) => fetch(base + "/api/admin/" + path, { headers: { Cookie: cookie(actor) } });
 const quizzes = await (await request("quizzes")).json(), attempts = await (await request("attempts")).json();
 const quizRef = quizzes.quizzes.items[0].reference, attemptRef = attempts.attempts.items[0].reference;
 assert.match(quizRef, /^v1\.quiz\./); assert.match(attemptRef, /^v1\.attempt\./);
 const quizDetail = await request("quizzes/" + quizRef), attemptDetail = await request("attempts/" + attemptRef); assert.equal(quizDetail.status, 200); assert.equal(attemptDetail.status, 200);
 const output = JSON.stringify([quizzes, attempts, await quizDetail.json(), await attemptDetail.json()]);
 for (const forbidden of [f.state.quizzes[0]._id, f.state.attempts[0]._id, "legacy-", "correctOption", "quizSnapshot", "password"]) assert.ok(!output.includes(forbidden), forbidden);
 assert.equal((await request("attempts/" + quizRef)).status, 400);
 for (const actor of [f.teacher, f.student]) assert.equal((await request("quizzes/" + quizRef, actor)).status, 403);
 assert.equal((await request("quizzes/legacy-" + f.state.quizzes[0]._id)).status, 400);
});
test("database outages do not prevent authorized-origin logout or leak errors from protect", async t => {
 t.mock.method(console, "error", () => {});
 const app = createApp({ config, initialize: async () => { throw new Error("fake database outage"); } });
 const instance = app.listen(0, "127.0.0.1"); await once(instance, "listening"); t.after(() => new Promise(resolve => instance.close(resolve)));
 const response = await fetch("http://127.0.0.1:" + instance.address().port + "/api/auth/logout", { method: "POST", headers: { Origin: origin } }); assert.equal(response.status, 200);
 const User = (await import("../src/models/User.js")).default;
 t.mock.method(User, "findById", async () => { throw new Error("database password secret"); });
 const cookie = "token=" + jwt.sign({ userId: "507f1f77bcf86cd799439011" }, secret, { expiresIn: "5m" });
 const failed = await fetch(base + "/api/auth/me", { headers: { Cookie: cookie } }); assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes("password"));
 const bad = "token=" + jwt.sign({ userId: "507f1f77bcf86cd799439011" }, secret, { algorithm: "HS384" });
 assert.equal((await fetch(base + "/api/auth/me", { headers: { Cookie: bad } })).status, 401);
});
