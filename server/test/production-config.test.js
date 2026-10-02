import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { readEnvironment } from "../src/config/env.js";
import { cookieOptions, loginCookieOptions } from "../src/config/cookies.js";
import { resolveApiBase } from "../../client/src/config/apiBase.js";
import { logError } from "../src/utils/logger.js";
const env = () => ({ NODE_ENV: "production", CLIENT_URL: "https://quiz.example.test", MONGO_URI: "mongodb://isolated.invalid/test", JWT_SECRET: crypto.randomBytes(32).toString("hex"), ADMIN_REFERENCE_SECRET: crypto.randomBytes(32).toString("hex") });
test("production configuration requires explicit secure origins and valid secrets without revealing values", () => {
 const good = env(); assert.equal(readEnvironment(good).production, true);
 for (const [name, values] of Object.entries({ NODE_ENV: ["invalid"], PORT: ["bad", "0"], CLIENT_URL: ["", "*", "http://example.test", "https://localhost", "https://example.test/path", "https://user:password@example.test", "https://example.test/"], MONGO_URI: ["", "bad"], JWT_SECRET: ["", "short"], ADMIN_REFERENCE_SECRET: ["", "z".repeat(64), "a".repeat(63)] })) {
  for (const value of values) assert.throws(() => readEnvironment({ ...good, [name]: value }), error => error.message === "Invalid configuration: " + name + ".");
 }
 assert.deepEqual(readEnvironment({}, { requireSecrets: false }).origins, ["http://localhost:5173"]);
});
test("Node 24 metadata and lockfile roots agree without dependency upgrades", () => {
 for (const prefix of ["../../", "../../client/", "../"]) {
  const pkg = JSON.parse(readFileSync(new URL(prefix + "package.json", import.meta.url)));
  const lock = JSON.parse(readFileSync(new URL(prefix + "package-lock.json", import.meta.url)));
  assert.equal(pkg.engines.node, "24.x"); assert.equal(lock.packages[""].engines.node, "24.x");
 }
 assert.equal(readFileSync(new URL("../../.nvmrc", import.meta.url), "utf8").trim(), "24");
});
test("production cookies share host-only secure options and seven-day expiry", t => {
 const previous = process.env.NODE_ENV; process.env.NODE_ENV = "production";
 t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; });
 assert.deepEqual(cookieOptions(), { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
 assert.deepEqual(loginCookieOptions(), { ...cookieOptions(), maxAge: 604800000 });
});
test("API base accepts same-origin production and rejects dangerous production fallback", () => {
 for (const v of [undefined, "", "/api", "/api/"]) assert.equal(resolveApiBase(v, true), "");
 assert.equal(resolveApiBase(undefined, false), "http://localhost:5000");
 assert.equal(resolveApiBase("https://api.example.test/", true), "https://api.example.test");
 for (const v of ["http://localhost:5000", "https://localhost", "http://api.example.test", "https://user:pass@example.test", "https://example.test/api", "//example.test"]) assert.throws(() => resolveApiBase(v, true));
});
test("SPA fallback excludes API and does not embed an unknown backend hostname", () => {
 const config = JSON.parse(readFileSync(new URL("../../client/vercel.json", import.meta.url)));
 const fallback = config.rewrites.at(-1), expression = new RegExp("^" + fallback.source + "$" );
 for (const path of ["/login", "/register", "/dashboard", "/quizzes/create", "/groups/GRP-AAAAAAAA/chat", "/assignments", "/a/token", "/notifications", "/admin/users"]) assert.ok(expression.test(path), path);
 for (const path of ["/api", "/api/health", "/api/auth/login"]) assert.equal(expression.test(path), false);
 assert.equal(fallback.destination, "/index.html"); assert.ok(!JSON.stringify(config).includes("https://"));
});
test("production error logging excludes sensitive error payloads and arbitrary messages", () => {
 const rows = [], error = Object.assign(new Error("password cookie JWT MongoDB grading secret"), { name: "attacker-secret", code: 11000, password: "private", headers: { cookie: "private" }, quizSnapshot: { correctOption: 0 } });
 logError("test-error", error, value => rows.push(JSON.parse(value)));
 assert.deepEqual(rows, [{ event: "test-error", errorType: "Error", code: 11000 }]);
});
