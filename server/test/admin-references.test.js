import assert from "node:assert/strict";
import test from "node:test";
import Quiz from "../src/models/Quiz.js";
import Attempt from "../src/models/Attempt.js";
import { resourceReference, referenceFilter } from "../src/services/adminReferenceService.js";
test("new quiz and standalone attempt UUIDs are stable and additive; legacy admin fallback needs no migration", async () => {
  const quiz = new Quiz({ title: "Sample", category: "Science", creator: "507f1f77bcf86cd799439011" });
  await quiz.validate(); const original = quiz.publicId; await quiz.validate(); assert.equal(quiz.publicId, original);
  assert.deepEqual(referenceFilter(original), { publicId: original });
  const attempt = new Attempt({ quiz: quiz._id, user: quiz.creator }); await attempt.validate(); const publicId = attempt.publicId; await attempt.validate(); assert.equal(attempt.publicId, publicId);
  const legacy = { _id: "507f1f77bcf86cd799439012" };
  const historicalQuiz = Quiz.hydrate({ ...legacy, title: "Legacy", category: "Science", creator: quiz.creator });
  await historicalQuiz.validate(); assert.equal(historicalQuiz.publicId, undefined);
  assert.deepEqual(referenceFilter(resourceReference(legacy)), { _id: legacy._id });
  for (const value of [legacy._id, "legacy-invalid", {}, "bad-uuid"]) assert.throws(() => referenceFilter(value), { status: 400 });
});
