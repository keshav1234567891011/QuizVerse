import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { consumeLimit } from "../src/services/rateLimitService.js";
import { authRateLimit } from "../src/middleware/rateLimitMiddleware.js";
import RateLimitBucket from "../src/models/RateLimitBucket.js";
test("shared atomic buckets enforce concurrent limits, window reset and hashed identities", async () => {
 const rows = new Map(), calls = [];
 const Model = { findOneAndUpdate: async (filter, update, options) => { calls.push({ filter, update, options }); const count = (rows.get(filter.key) || 0) + 1; rows.set(filter.key, count); return { count }; } };
 const options = { Model, secret: crypto.randomBytes(32).toString("hex"), limit: 3, windowMs: 60000, now: 1000 };
 const results = await Promise.all(Array.from({ length: 8 }, () => consumeLimit("login-account", "private@example.test", options)));
 assert.equal(results.filter(r => r.allowed).length, 3); assert.equal(results[7].retryAfter, 59);
 assert.ok(calls.every(c => c.update.$inc.count === 1 && c.options.upsert && c.options.new));
 assert.ok(calls.every(c => c.filter.key.length <= 100 && !c.filter.key.includes("private@example.test")));
 assert.equal((await consumeLimit("login-account", "private@example.test", { ...options, now: 60000 })).allowed, true);
 const indexes = RateLimitBucket.schema.indexes(); assert.ok(indexes.some(([fields, options]) => fields.key && options.unique)); assert.ok(indexes.some(([fields, options]) => fields.expiresAt && options.expireAfterSeconds === 0));
});
test("concurrent initial upsert collisions increment winner without resetting bucket", async () => {
 const calls = []; const Model = { findOneAndUpdate: async (filter, update, options) => { calls.push({ update, options }); if (calls.length === 1) throw Object.assign(new Error("duplicate"), { code: 11000 }); return { count: 2 }; } };
 const result = await consumeLimit("login-account", "fixture", { Model, secret: crypto.randomBytes(32).toString("hex"), limit: 1, windowMs: 60000, now: 0 });
 assert.equal(result.allowed, false); assert.deepEqual(calls[1], { update: { $inc: { count: 1 } }, options: { new: true } });
});
test("focused auth limiter returns 429/Retry-After and ignores spoofed forwarding headers", async () => {
 const calls = [], request = { method: "POST", path: "/login", body: { email: " USER@EXAMPLE.TEST " }, socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "spoofed" } };
 let status, body, retry;
 const response = { set(name, value) { assert.equal(name, "Retry-After"); retry = value; return this; }, status(value) { status = value; return this; }, json(value) { body = value; } };
 await authRateLimit({ production: true, consume: async (...args) => { calls.push(args); return { allowed: calls.length < 2, retryAfter: 120 }; } })(request, response, () => assert.fail("must deny"));
 assert.equal(status, 429); assert.equal(retry, "120"); assert.equal(body.success, false); assert.equal(calls[0][1], "127.0.0.1"); assert.equal(calls[1][1], "user@example.test");
});
test("limiter fails closed on DB outage and skips logout/development", async () => {
 let error, consumed = 0;
 const limiter = authRateLimit({ production: true, consume: async () => { consumed++; throw new Error("fake outage"); } });
 await limiter({ method: "POST", path: "/login", body: {}, socket: {} }, {}, e => error = e); assert.equal(error.status, 503);
 for (const path of ["/logout", "/me"]) await limiter({ method: "POST", path }, {}, e => assert.equal(e, undefined));
 await authRateLimit({ production: false })({ method: "POST", path: "/login" }, {}, e => assert.equal(e, undefined)); assert.equal(consumed, 1);
});

test("registration and case/trailing-slash auth aliases cannot bypass focused limits", async () => {
 const calls = [], limiter = authRateLimit({ production: true, consume: async (...args) => { calls.push(args); return { allowed: true }; } });
 for (const path of ["/LOGIN/", "/register/", "/REGISTER"]) await limiter({ method: "POST", path, body: { email: "fixture@example.test" }, socket: { remoteAddress: "peer" } }, {}, error => assert.equal(error, undefined));
 assert.deepEqual(calls.map(args => args[0]), ["login-peer", "login-account", "register-peer", "register-peer"]);
 assert.equal(calls[2][2].limit, 30);
});
