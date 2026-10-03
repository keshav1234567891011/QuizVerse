import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import test, { before, after } from "node:test";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
const app = createApp();
import { communicationsFixture } from "../test-support/communicationsFixture.js";
let server, base;
const secret = crypto.randomBytes(32).toString("hex"), previous = process.env.JWT_SECRET;
before(async () => { process.env.JWT_SECRET = secret; server = app.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}/api`; });
after(async () => { await new Promise(resolve => server.close(resolve)); if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; });
const request = (user, path, method = "GET", body) => fetch(`${base}/${path}`, { method,
  headers: { "Content-Type": "application/json", Cookie: `token=${jwt.sign({ userId: user._id }, secret, { expiresIn: "5m" })}` },
  ...(body ? { body: JSON.stringify(body) } : {}) });
test("announcement to notification to student chat is authenticated and isolated through actual HTTP routes", async t => {
  const f = communicationsFixture(t), input = { message: "Classroom announcement", type: "announcement", clientMessageId: crypto.randomUUID() };
  assert.equal((await request(f.teacher, "groups/GRP-AAAAAAAA/messages", "POST", input)).status, 201);
  const list = await request(f.student, "notifications"); assert.equal(list.status, 200);
  const n = (await list.json()).notifications[0]; assert.equal(n.type, "classroom-announcement");
  assert.equal((await (await request(f.student, "notifications/unread-count")).json()).unreadCount, 1);
  assert.equal((await request(f.outsider, `notifications/${n.publicId}/read`, "PATCH")).status, 404);
  assert.equal((await request(f.student, `notifications/${n.publicId}/read`, "PATCH")).status, 200);
  assert.equal((await (await request(f.student, "notifications/unread-count")).json()).unreadCount, 0);
  const chat = await request(f.student, "groups/GRP-AAAAAAAA/messages"); assert.equal(chat.status, 200); assert.equal((await chat.json()).messages.length, 1);
  assert.equal((await request(f.student, "groups/GRP-AAAAAAAA/messages", "POST", { ...input, type: "normal", clientMessageId: crypto.randomUUID() })).status, 201);
  assert.equal((await request(f.student, "groups/GRP-AAAAAAAA/messages", "POST", { ...input, clientMessageId: crypto.randomUUID() })).status, 403);
  assert.equal((await request(f.outsider, "groups/GRP-AAAAAAAA/messages")).status, 403);
  assert.equal((await request(f.outsider, "groups/GRP-AAAAAAAA/messages", "POST", input)).status, 403);
  assert.equal((await request(f.student, "notifications/read-all", "PATCH")).status, 200);
  assert.equal((await request(f.student, "notifications/sync", "POST")).status, 200);
});
