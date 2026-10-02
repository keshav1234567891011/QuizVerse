export const types = ["singleChoice", "multipleSelect", "trueFalse", "shortAnswer", "numeric", "fillBlank"];
export const labels = { singleChoice: "Single choice", multipleSelect: "Multiple select", trueFalse: "True / false", shortAnswer: "Short answer", numeric: "Numeric", fillBlank: "Fill in the blanks" };
export const answerField = q => ({ singleChoice: "selectedOption", multipleSelect: "selectedOptions", trueFalse: "booleanAnswer", shortAnswer: "textAnswer", numeric: "numericAnswer", fillBlank: "blankAnswers" })[q.questionType || "singleChoice"];
export const hasAnswer = a => !!a && (a.selectedOption != null || a.booleanAnswer != null || (a.numericAnswer != null && String(a.numericAnswer).trim() !== "") || !!a.textAnswer?.trim() || !!a.selectedOptions?.length || !!a.blankAnswers?.some(v => v.trim()));
export function newQuestion(type = "singleChoice", existing = {}) {
  const base = { clientKey: existing.clientKey || crypto.randomUUID(), ...(existing._id ? { _id: existing._id } : {}), questionType: type, questionText: existing.questionText || "", marks: existing.marks ?? 1, timeLimit: existing.timeLimit ?? 30 };
  if (type === "singleChoice") return { ...base, options: ["", ""], correctOption: null };
  if (type === "multipleSelect") return { ...base, options: ["", ""], correctOptions: [] };
  if (type === "trueFalse") return { ...base, correctBoolean: true };
  if (type === "shortAnswer") return { ...base, acceptedAnswers: [""], caseSensitive: false };
  if (type === "numeric") return { ...base, correctNumber: "", numericTolerance: 0 };
  return { ...base, blanks: [{ acceptedAnswers: [""], caseSensitive: false }] };
}
export function questionError(q) {
  const type = q.questionType || "singleChoice";
  if (!q.questionText.trim()) return "Enter a question prompt.";
  if (!Number.isFinite(q.marks) || q.marks < 1 || !Number.isFinite(q.timeLimit) || q.timeLimit < 5) return "Use at least 1 mark and 5 seconds.";
  if (["singleChoice", "multipleSelect"].includes(type)) {
    if (q.options.length < 2 || q.options.length > 50 || q.options.some(v => !v.trim())) return "Enter 2–50 nonempty options.";
    if (type === "singleChoice" && (!Number.isInteger(q.correctOption) || q.correctOption < 0 || q.correctOption >= q.options.length)) return "Select the correct option.";
    if (type === "multipleSelect" && (!q.correctOptions.length || new Set(q.correctOptions).size !== q.correctOptions.length || q.correctOptions.some(n => !Number.isInteger(n) || n < 0 || n >= q.options.length))) return "Select valid correct options.";
  }
  if (type === "trueFalse" && typeof q.correctBoolean !== "boolean") return "Select true or false.";
  if (type === "numeric" && (q.correctNumber === "" || !Number.isFinite(Number(q.correctNumber)) || q.numericTolerance === "" || !Number.isFinite(Number(q.numericTolerance)) || Number(q.numericTolerance) < 0)) return "Enter a finite number and nonnegative tolerance.";
  const lists = type === "shortAnswer" ? [q] : type === "fillBlank" ? q.blanks : [];
  if (lists.some(b => !b.acceptedAnswers.length || b.acceptedAnswers.some(v => !v.trim()) || new Set(b.acceptedAnswers.map(v => b.caseSensitive ? v.trim() : v.trim().toLowerCase())).size !== b.acceptedAnswers.length)) return "Enter unique, nonempty accepted answers.";
  if (type === "fillBlank") {
    const markers = [...q.questionText.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
    if (!q.blanks.length || markers.length !== q.blanks.length || q.blanks.some((_, i) => markers.filter(n => n === String(i + 1)).length !== 1) || /\{\{|\}\}/.test(q.questionText.replace(/\{\{\d+\}\}/g, ""))) return "Use each marker {{1}}, {{2}}, … exactly once, matching the blank editors.";
  }
  return "";
}
export function questionPayload(q) {
  const { clientKey, ...payload } = q;
  void clientKey;
  if (payload.questionType === "numeric") { payload.correctNumber = Number(payload.correctNumber); payload.numericTolerance = Number(payload.numericTolerance); }
  return payload;
}
