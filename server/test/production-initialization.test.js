import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import * as appModule from "../src/app.js";
import { createConnector } from "../src/config/db.js";
import { createInitializer } from "../src/config/initialize.js";
import { prepareIndexes } from "../src/scripts/prepareIndexes.js";
test("app exports only a testable factory and server entrypoint wires request initialization", async t => {
 assert.equal(Object.hasOwn(appModule, "default"), false);
 const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
 const serverSource = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
 assert.doesNotMatch(appSource, /\.listen\s*\(/);
 assert.match(serverSource, /const initialize = createInitializer\(\{ production: config\.production \}\)/);
 assert.match(serverSource, /app = createApp\(\{ config, initialize \}\)/);
 assert.match(serverSource, /export default app;/);
 let calls = 0, unavailable = true;
 const app = appModule.createApp({ config: { production: true, mode: "test", origins: ["https://quiz.example.test"] },
  initialize: async () => { calls++; if (unavailable) throw new Error("fake outage"); } });
 assert.equal(calls, 0);
 assert.notEqual(app, appModule.createApp({ config: { production: false, mode: "test", origins: [] } }));
 const server = app.listen(0, "127.0.0.1");
 t.after(() => new Promise(resolve => server.close(resolve)));
 await once(server, "listening");
 const url = `http://127.0.0.1:${server.address().port}/api/health`;
 assert.equal((await fetch(url)).status, 503); assert.equal(calls, 1);
 unavailable = false;
 assert.equal((await fetch(url)).status, 200); assert.equal(calls, 2);
});
test("connection promise is shared, reused, retried, and production cannot auto-create indexes", async () => {
 let calls = 0, settings;
 const driver = { connection: { readyState: 0 }, connect: async (uri, options) => { calls++; settings = options; if (calls === 1) throw new Error("fake outage"); driver.connection.readyState = 1; return driver; } };
 const connect = createConnector(driver, { MONGO_URI: "mongodb://isolated.invalid/test", NODE_ENV: "production" });
 const first = connect(); assert.equal(first, connect()); await assert.rejects(first);
 const second = connect({ autoIndex: true, autoCreate: true }); assert.equal(second, connect()); await second; await connect(); assert.equal(calls, 2);
 assert.equal(settings.autoIndex, false); assert.equal(settings.autoCreate, false); assert.equal(settings.maxPoolSize, 5); assert.equal(settings.bufferCommands, false);
 assert.equal(settings.minPoolSize, 0); assert.equal(settings.serverSelectionTimeoutMS, 10000); assert.equal(settings.connectTimeoutMS, 10000); assert.equal(settings.socketTimeoutMS, 30000);
 // Every non-ready state must reconnect rather than reuse a settled promise.
 for (const state of [2, 3, 0]) {
  driver.connection.readyState = state;
  const reconnect = connect(); assert.notEqual(reconnect, second); assert.equal(reconnect, connect());
  await reconnect;
  assert.equal(calls, 3 + [2, 3, 0].indexOf(state));
  assert.equal(driver.connection.readyState, 1);
 }
});
test("pending exists only while connecting; an already healthy connection needs no reconnect", async () => {
 let calls = 0, finish;
 const driver = { connection: { readyState: 1 }, connect: () => { calls++; return new Promise(resolve => { finish = resolve; }); } };
 const connect = createConnector(driver, { MONGO_URI: "mongodb://isolated.invalid/test", NODE_ENV: "production" });
 assert.equal(await connect(), driver); assert.equal(calls, 0);
 driver.connection.readyState = 0;
 const first = connect(); assert.equal(first, connect());
 await Promise.resolve(); assert.equal(calls, 1);
 driver.connection.readyState = 1;
 assert.equal(first, connect()); // Still share the unfinished attempt.
 finish(driver); assert.equal(await first, driver);
 const healthy = connect(); assert.notEqual(healthy, first);
 assert.equal(await healthy, driver); assert.equal(calls, 1);
 driver.connection.readyState = 3;
 const next = connect(); assert.notEqual(next, first); assert.equal(next, connect());
 await Promise.resolve(); assert.equal(calls, 2);
 driver.connection.readyState = 1; finish(driver); await next;
});
test("initialization retries errors, shares concurrent work and never runs production model init", async () => {
 let calls = 0, indexes = 0, ready = false;
 const initialize = createInitializer({ production: true, ready: () => ready, models: () => [{ init: async () => indexes++ }], connect: async () => { calls++; if (calls === 1) throw new Error("fake outage"); ready = true; } });
 const first = initialize(); assert.equal(first, initialize()); await assert.rejects(first);
 await Promise.all([initialize(), initialize()]); await initialize(); assert.equal(calls, 2); assert.equal(indexes, 0);
 ready = false; await initialize(); assert.equal(calls, 3);
 const local = createInitializer({ production: false, connect: async () => {}, models: () => [{ init: async () => indexes++ }], ready: () => true }); await local(); assert.equal(indexes, 1);
});
test("index preparation is additive and verifies required options without sync/drop", async () => {
 let creates = 0;
 const model = { createIndexes: async () => creates++, schema: { indexes: () => [[{ key: 1 }, { unique: true }], [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]] }, listIndexes: async () => [{ key: { key: 1 }, unique: true }, { key: { expiresAt: 1 }, expireAfterSeconds: 0 }] };
 await prepareIndexes([model]); assert.equal(creates, 1);
 model.listIndexes = async () => [{ key: { key: 1 } }]; await assert.rejects(prepareIndexes([model]));
});
