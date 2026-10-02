import { normalizeAnswer, answered } from "./questionService.js";
const matches = (v, values, sensitive) => values.some(a => sensitive ? v.trim() === a.trim() : v.trim().toLowerCase() === a.trim().toLowerCase());
export function gradeAnswers(questions, answers) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!Array.isArray(answers)) fail("Answers must be an array.");
  const map = new Map(questions.map(q => [String(q._id), q])), selected = new Map();
  for (const a of answers) {
    if (!a || typeof a !== "object") fail("Invalid answer.");
    const id = String(a.questionId || "");
    if (!map.has(id)) fail("An answer references a question outside this quiz.");
    if (selected.has(id)) fail("The same question was answered more than once.");
    selected.set(id, normalizeAnswer(map.get(id), a));
  }
  let score = 0, totalMarks = 0, correctAnswers = 0;
  const graded = questions.map(q => {
    const a = selected.get(String(q._id)) || normalizeAnswer(q), type = q.questionType || "singleChoice";
    let isCorrect = false;
    if (answered(a)) {
      if (type === "singleChoice") isCorrect = a.selectedOption === q.correctOption;
      if (type === "multipleSelect") isCorrect = a.selectedOptions.length === q.correctOptions.length && a.selectedOptions.every(n => q.correctOptions.includes(n));
      if (type === "trueFalse") isCorrect = a.booleanAnswer === q.correctBoolean;
      if (type === "shortAnswer") isCorrect = matches(a.textAnswer, q.acceptedAnswers, q.caseSensitive);
      if (type === "numeric") isCorrect = Math.abs(a.numericAnswer - q.correctNumber) <= (q.numericTolerance ?? 0);
      if (type === "fillBlank") isCorrect = a.blankAnswers.every((v, i) => matches(v, q.blanks[i].acceptedAnswers, q.blanks[i].caseSensitive));
    }
    const marksAwarded = isCorrect ? q.marks : 0;
    totalMarks += q.marks; score += marksAwarded; if (isCorrect) correctAnswers++;
    return { questionId: q._id, ...a, isCorrect, marksAwarded };
  });
  return { answers: graded, score, totalMarks, correctAnswers, totalQuestions: questions.length, percentage: totalMarks ? Number((score / totalMarks * 100).toFixed(2)) : 0 };
}
