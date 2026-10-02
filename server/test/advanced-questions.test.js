import assert from "node:assert/strict";
import test from "node:test";
import Quiz from "../src/models/Quiz.js";
import Attempt from "../src/models/Attempt.js";
import Assignment from "../src/models/Assignment.js";
import { mixedQuestions, mixedResponses } from "../test-support/assignmentFixture.js";
import { normalizeQuestion, normalizeQuestions, normalizeAnswer, playableQuestion, parseNumeric } from "../src/services/questionService.js";
import { gradeAnswers } from "../src/services/scoringService.js";
import { reviewQuestions, safeReview } from "../src/services/resultService.js";
import { newQuestion, hasAnswer, questionPayload, questionError } from "../../client/src/config/questions.js";
const grade = (q, a) => gradeAnswers([q], [{ questionId: q._id, ...a }]);
test("all six question types grade on the server, retaining marks and filtering student review", () => {
  const q = mixedQuestions(), result = gradeAnswers(q, mixedResponses().map((a, i) => ({ questionId: q[i]._id, ...a, marksAwarded: 999, isCorrect: false })));
  assert.equal(result.score, 12); assert.equal(result.percentage, 100); assert.equal(result.correctAnswers, 6);
  const review = reviewQuestions(q, result.answers); assert.equal(review[2].submittedAnswer, "False"); assert.equal(review[4].submittedAnswer, "0");
  const safe = JSON.stringify({ playable: q.map(playableQuestion), review });
  for (const name of ["correctOption", "correctOptions", "correctBoolean", "acceptedAnswers", "correctNumber", "numericTolerance", "caseSensitive", '"blanks"', '"_id"']) assert.ok(!safe.includes(name), name);
  assert.deepEqual(safeReview({ status: "in-progress", review }), []);
});
test("multiple select is exact set, independent of order, without partial credit", () => {
  const q = mixedQuestions()[1];
  assert.equal(grade(q, { selectedOptions: [2, 0] }).score, 2);
  for (const v of [[], [0], [0, 1, 2], [1]]) assert.equal(grade(q, { selectedOptions: v }).score, 0);
  for (const v of [[0, 0], [-1], [3], ["0"], {}]) assert.throws(() => grade(q, { selectedOptions: v }), { status: 400 });
});
test("boolean false and numeric zero are answered while empty text remains unanswered", () => {
  const q = mixedQuestions(); assert.equal(grade(q[2], { booleanAnswer: false }).score, 2);
  assert.equal(grade(q[4], { numericAnswer: 0 }).score, 2);
  assert.equal(grade(q[4], { numericAnswer: " " }).score, 0);
  assert.equal(reviewQuestions([q[3]], grade(q[3], { textAnswer: "  " }).answers)[0].state, "unanswered");
  for (const v of ["false", 0, {}]) assert.throws(() => grade(q[2], { booleanAnswer: v }), { status: 400 });
});
test("short answer trims only outer whitespace and respects configured case", () => {
  const q = mixedQuestions()[3];
  assert.equal(grade(q, { textAnswer: " JAVASCRIPT " }).score, 2);
  assert.equal(grade({ ...q, caseSensitive: true }, { textAnswer: "javascript" }).score, 0);
  assert.equal(grade({ ...q, acceptedAnswers: ["two words"] }, { textAnswer: "two  words" }).score, 0);
  for (const v of [4, {}, "a".repeat(2001)]) assert.throws(() => grade(q, { textAnswer: v }), { status: 400 });
});
test("numeric grading includes absolute tolerance boundaries and rejects coercion traps", () => {
  const q = mixedQuestions()[4];
  for (const v of [-0.25, 0.25, 0, "2.5e-1"]) assert.equal(grade(q, { numericAnswer: v }).score, 2);
  for (const v of [-0.25001, 0.25001]) assert.equal(grade(q, { numericAnswer: v }).score, 0);
  assert.equal(grade({ ...q, numericTolerance: 0 }, { numericAnswer: 0.00001 }).score, 0);
  for (const v of ["0x10", "Infinity", "NaN", "1e999", true, [], {}, "2.5 apples", Infinity]) assert.throws(() => parseNumeric(v), { status: 400 });
});
test("fill blank requires every blank; validates markers and per-blank normalization", () => {
  const q = mixedQuestions()[5];
  assert.equal(grade(q, { blankAnswers: ["ONE", "TWO"] }).score, 2);
  for (const v of [["one", "two"], ["one", ""], ["", ""]]) assert.equal(grade(q, { blankAnswers: v }).score, 0);
  for (const v of [[], ["one"], ["one", 2], {}]) assert.throws(() => grade(q, { blankAnswers: v }), { status: 400 });
  for (const prompt of ["{{1}} {{1}}", "{{2}} {{3}}", "{{01}} {{2}}", "{{a}} {{2}}", "{{1}}", "{{1}} {{2}} {{3}}"])
    assert.throws(() => normalizeQuestion({ ...q, questionText: prompt }), { status: 400 });
});
test("malformed configurations are rejected and type changes remove obsolete keys", () => {
  const q = mixedQuestions();
  const bad = [{ ...q[0], correctOption: undefined }, { ...q[0], correctOption: 0.5 }, { ...q[0], options: ["A"] },
    { ...q[1], correctOptions: [] }, { ...q[1], correctOptions: [0, 0] }, { ...q[1], correctOptions: [4] },
    { ...q[2], correctBoolean: "false" }, { ...q[3], acceptedAnswers: [""] }, { ...q[3], acceptedAnswers: ["JS", "js"] },
    { ...q[4], correctNumber: NaN }, { ...q[4], correctNumber: "0" }, { ...q[4], numericTolerance: -1 },
    { ...q[4], numericTolerance: Infinity }, { ...q[5], blanks: [] }, { ...q[0], questionType: "matching" }, { ...q[0], marks: Infinity }];
  for (const value of bad) assert.throws(() => normalizeQuestion(value), { status: 400 });
  const changed = normalizeQuestion({ ...q[0], questionType: "shortAnswer", acceptedAnswers: ["A"] });
  assert.ok(!("correctOption" in changed)); assert.ok(!("options" in changed));
});
test("legacy questions remain single choice and stable IDs survive edits/reordering", () => {
  const q = mixedQuestions().slice(0, 2); delete q[0].questionType;
  assert.equal(grade(q[0], { selectedOption: 0 }).score, 2);
  assert.equal(normalizeQuestion(q[0]).questionType, "singleChoice");
  assert.deepEqual(normalizeQuestions([...q].reverse(), q).map(x => x._id), q.map(x => x._id).reverse());
  for (const values of [[q[0], q[0]], [mixedQuestions()[0]], [{ ...q[0], _id: "invalid" }]]) assert.throws(() => normalizeQuestions(values, q), { status: 400 });
  assert.throws(() => normalizeQuestions(q), { status: 400 });
  assert.equal(grade({ ...q[0], options: ["A", "A"] }, { selectedOption: 0 }).score, 2);
});
test("builder type changes retain identity but clear keys; player answer counts include false and zero", () => {
  const q = { ...mixedQuestions()[0], clientKey: "local-editor-key" };
  const changed = newQuestion("numeric", q); assert.equal(changed._id, q._id); assert.equal(changed.clientKey, q.clientKey);
  assert.ok(!("correctOption" in changed)); assert.ok(!("options" in changed));
  const payload = questionPayload({ ...changed, correctNumber: "0", numericTolerance: "0" });
  assert.equal(payload.correctNumber, 0); assert.ok(!("clientKey" in payload)); assert.equal(questionError(payload), "");
  assert.equal(hasAnswer({ booleanAnswer: false }), true); assert.equal(hasAnswer({ numericAnswer: 0 }), true);
  assert.equal(hasAnswer({ textAnswer: " " }), false); assert.equal(hasAnswer({ selectedOptions: [] }), false);
});
test("answer identity and type validation reject foreign/duplicate IDs and malformed payloads", () => {
  const q = mixedQuestions()[0];
  assert.throws(() => gradeAnswers([q], [{ questionId: "foreign", selectedOption: 0 }]), { status: 400 });
  assert.throws(() => gradeAnswers([q], [{ questionId: q._id }, { questionId: q._id }]), { status: 400 });
  assert.throws(() => normalizeAnswer(q, { booleanAnswer: true }), { status: 400 });
  assert.throws(() => normalizeAnswer(q, { selectedOption: "0" }), { status: 400 });
});
test("Mongoose models validate mixed content, retain IDs, and hide frozen grading by default", async () => {
  const ids = { quiz: "507f1f77bcf86cd799439012", user: "507f1f77bcf86cd799439011" };
  const quiz = new Quiz({ title: "Advanced quiz", category: "Science", creator: ids.user, questions: mixedQuestions() });
  await quiz.validate(); assert.equal(quiz.questions[2].correctBoolean, false);
  const id = String(quiz.questions[0]._id); quiz.questions[0].questionType = "shortAnswer"; quiz.questions[0].acceptedAnswers = ["A"];
  await quiz.validate(); assert.equal(String(quiz.questions[0]._id), id); assert.equal(quiz.questions[0].correctOption, undefined); assert.equal(quiz.questions[0].options, undefined);
  const attempt = new Attempt({ ...ids, answers: [{ questionId: quiz.questions[2]._id, booleanAnswer: false }, { questionId: quiz.questions[4]._id, numericAnswer: 0 }] });
  await attempt.validate(); assert.equal(attempt.answers[0].booleanAnswer, false); assert.equal(attempt.answers[1].numericAnswer, 0);
  assert.equal(Attempt.schema.path("quizSnapshot").options.select, false); assert.equal(Assignment.schema.path("quizSnapshot").options.select, false);
});
