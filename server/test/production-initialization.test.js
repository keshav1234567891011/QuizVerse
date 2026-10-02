import test from "node:test";
import assert from "node:assert/strict";
import { createConnector } from "../src/config/db.js";
import { createInitializer } from "../src/config/initialize.js";
import { prepareIndexes } from "../src/scripts/prepareIndexes.js";
test("connection promise is shared, reused, retried, and production cannot auto-create indexes", async () => {
 let calls = 0, settings;
 const driver = { connection: { readyState: 0 }, connect: async (uri, options) => { calls++; settings = options; if (calls === 1) throw new Error("fake outage"); driver.connection.readyState = 1; return driver; } };
 const connect = createConnector(driver, { MONGO_URI: "mongodb://isolated.invalid/test", NODE_ENV: "production" });
 const first = connect(); assert.equal(first, connect()); await assert.rejects(first);
 const second = connect({ autoIndex: true, autoCreate: true }); assert.equal(second, connect()); await second; await connect(); assert.equal(calls, 2);
 assert.equal(settings.autoIndex, false); assert.equal(settings.autoCreate, false); assert.equal(settings.maxPoolSize, 5); assert.equal(settings.bufferCommands, false);
 driver.connection.readyState = 0; await connect(); assert.equal(calls, 3);
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
