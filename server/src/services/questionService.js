import mongoose from "mongoose";
export const questionTypes = ["singleChoice", "multipleSelect", "trueFalse", "shortAnswer", "numeric", "fillBlank"];
const bad = message => { throw Object.assign(new Error(message), { status: 400 }); };
const text = (v, label) => { if (typeof v !== "string" || !v.trim() || v.length > 10000) bad(`${label} must contain text (at most 10,000 characters).`); return v.trim(); };
const finite = (v, label, min) => { if (typeof v !== "number" || !Number.isFinite(v) || (min !== undefined && v < min)) bad(`Invalid ${label}.`); return v; };
const sensitive = v => { if (v !== undefined && typeof v !== "boolean") bad("Case sensitivity must be boolean."); return v ?? false; };
function accepted(values, sensitivity) {
  if (!Array.isArray(values) || !values.length || values.length > 50) bad("Provide 1–50 accepted answers.");
  const result = values.map(v => text(v, "Accepted answer"));
  if (result.some(v => v.length > 2000)) bad("Accepted answers must be at most 2,000 characters.");
  if (new Set(result.map(v => sensitivity ? v : v.toLowerCase())).size !== result.length) bad("Accepted answers must be unique.");
  return result;
}
export function normalizeQuestion(q) {
  if (!q || typeof q !== "object" || Array.isArray(q)) bad("Invalid question.");
  const questionType = q.questionType ?? "singleChoice";
  if (!questionTypes.includes(questionType)) bad("Unsupported question type.");
  const out = { questionType, questionText: text(q.questionText, "Question prompt"), marks: finite(q.marks ?? 1, "marks", 1), timeLimit: finite(q.timeLimit ?? 30, "time limit", 5) };
  if (q._id != null) out._id = q._id;
  if (["singleChoice", "multipleSelect"].includes(questionType)) {
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 50) bad("Provide 2–50 options.");
    out.options = q.options.map(v => text(v, "Option"));
    const valid = n => Number.isInteger(n) && n >= 0 && n < out.options.length;
    if (questionType === "singleChoice") { if (!valid(q.correctOption)) bad("Select one valid correct option."); out.correctOption = q.correctOption; }
    else {
      if (!Array.isArray(q.correctOptions) || !q.correctOptions.length || !q.correctOptions.every(valid) || new Set(q.correctOptions).size !== q.correctOptions.length) bad("Select unique valid correct options.");
      out.correctOptions = [...q.correctOptions].sort((a, b) => a - b);
    }
  } else if (questionType === "trueFalse") {
    if (typeof q.correctBoolean !== "boolean") bad("Choose a true/false answer."); out.correctBoolean = q.correctBoolean;
  } else if (questionType === "shortAnswer") {
    out.caseSensitive = sensitive(q.caseSensitive); out.acceptedAnswers = accepted(q.acceptedAnswers, out.caseSensitive);
  } else if (questionType === "numeric") {
    out.correctNumber = finite(q.correctNumber, "numeric answer"); out.numericTolerance = finite(q.numericTolerance ?? 0, "numeric tolerance", 0);
  } else {
    const markers = [...out.questionText.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
    const rest = out.questionText.replace(/\{\{\d+\}\}/g, "");
    if (!Array.isArray(q.blanks) || !q.blanks.length || q.blanks.length > 20 || markers.length !== q.blanks.length || q.blanks.some((_, i) => markers.filter(n => n === String(i + 1)).length !== 1) || rest.includes("{{") || rest.includes("}}")) bad("Use each numbered blank {{1}}, {{2}}, … exactly once, with matching answer lists.");
    out.blanks = q.blanks.map(b => { if (!b || typeof b !== "object") bad("Invalid blank configuration."); const caseSensitive = sensitive(b.caseSensitive); return { acceptedAnswers: accepted(b.acceptedAnswers, caseSensitive), caseSensitive }; });
  }
  return out;
}
export function normalizeQuestions(questions, existing = []) {
  if (!Array.isArray(questions)) bad("Questions must be an array.");
  const allowed = new Set(existing.map(q => String(q._id))), seen = new Set();
  return questions.map((q, i) => {
    try {
      if (q?._id != null) { const id = String(q._id); if (!mongoose.Types.ObjectId.isValid(id) || !allowed.has(id) || seen.has(id)) bad("Duplicate or foreign question ID."); seen.add(id); }
      return normalizeQuestion(q);
    } catch (e) { e.message = `Question ${i + 1}: ${e.message}`; throw e; }
  });
}
export function validateQuizContent(q) {
  if (!Array.isArray(q.questions) || (q.status === "published" && !q.questions.length)) bad("A published quiz needs questions.");
  q.questions.forEach(normalizeQuestion);
  if (q.timerMode === "whole-quiz") finite(q.totalTimeLimit, "whole-quiz time", 1);
}
export function quizSnapshot(q) {
  validateQuizContent(q);
  return { title: q.title, description: q.description, category: q.category, difficulty: q.difficulty, timerMode: q.timerMode, totalTimeLimit: q.totalTimeLimit, questions: q.questions.map(normalizeQuestion) };
}
export function playableQuestion(q) {
  const type = q.questionType || "singleChoice";
  return { questionType: type, questionText: q.questionText, marks: q.marks, timeLimit: q.timeLimit,
    ...(["singleChoice", "multipleSelect"].includes(type) ? { options: [...q.options] } : {}), ...(type === "fillBlank" ? { blankCount: q.blanks.length } : {}) };
}
export function parseNumeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.length > 2000 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) bad("Enter a finite decimal number.");
  const number = Number(value.trim()); if (!Number.isFinite(number)) bad("Enter a finite decimal number."); return number;
}
export function normalizeAnswer(q, input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) bad("Invalid answer.");
  const type = q.questionType || "singleChoice", fields = ["selectedOption", "selectedOptions", "booleanAnswer", "textAnswer", "numericAnswer", "blankAnswers"];
  const field = { singleChoice: "selectedOption", multipleSelect: "selectedOptions", trueFalse: "booleanAnswer", shortAnswer: "textAnswer", numeric: "numericAnswer", fillBlank: "blankAnswers" }[type];
  if (!field) bad("Unsupported question type.");
  if (fields.some(f => f !== field && input[f] != null)) bad("Answer fields do not match this question type.");
  const value = input[field]; if (value == null) return { [field]: null };
  const valid = n => Number.isInteger(n) && n >= 0 && n < q.options.length;
  if (type === "singleChoice") { if (!valid(value)) bad("Invalid selected option."); }
  else if (type === "multipleSelect") { if (!Array.isArray(value) || value.length > q.options.length || !value.every(valid) || new Set(value).size !== value.length) bad("Invalid selected options."); return { selectedOptions: [...value].sort((a, b) => a - b) }; }
  else if (type === "trueFalse") { if (typeof value !== "boolean") bad("Answer must be true or false."); }
  else if (type === "shortAnswer") { if (typeof value !== "string" || value.length > 2000) bad("Answer must be text (at most 2,000 characters)."); return { textAnswer: value.trim() }; }
  else if (type === "numeric") return { numericAnswer: value === "" || (typeof value === "string" && !value.trim()) ? null : parseNumeric(value) };
  else if (type === "fillBlank") { if (!Array.isArray(value) || value.length !== q.blanks.length || value.some(v => typeof v !== "string" || v.length > 2000)) bad("Provide one text answer per blank."); return { blankAnswers: value.map(v => v.trim()) }; }
  return { [field]: value };
}
export function answered(a) { return a.selectedOption != null || a.booleanAnswer != null || a.numericAnswer != null || !!a.textAnswer?.trim() || !!a.selectedOptions?.length || !!a.blankAnswers?.some(v => v.trim()); }
