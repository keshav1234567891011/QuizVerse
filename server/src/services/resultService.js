import { normalizeAnswer, answered } from "./questionService.js";
export function reviewQuestions(questions, answers) {
  return questions.map((q, index) => {
    const saved = answers.find(a => String(a.questionId) === String(q._id)), a = normalizeAnswer(q, saved || {}), type = q.questionType || "singleChoice";
    let submittedAnswer = "Unanswered";
    if (answered(a)) {
      if (type === "singleChoice") submittedAnswer = q.options[a.selectedOption];
      if (type === "multipleSelect") submittedAnswer = a.selectedOptions.map(n => q.options[n]).join("; ");
      if (type === "trueFalse") submittedAnswer = a.booleanAnswer ? "True" : "False";
      if (type === "shortAnswer") submittedAnswer = a.textAnswer;
      if (type === "numeric") submittedAnswer = String(a.numericAnswer);
      if (type === "fillBlank") submittedAnswer = a.blankAnswers.map((v, i) => `${i + 1}: ${v || "Unanswered"}`).join("; ");
    }
    return { key: String(index), questionType: type, questionText: q.questionText, submittedAnswer, state: !answered(a) ? "unanswered" : saved?.isCorrect ? "correct" : "incorrect", earnedMarks: saved?.marksAwarded || 0, availableMarks: q.marks };
  });
}
export function safeReview(attempt) {
  if (attempt.status !== "submitted") return [];
  return (attempt.review || []).map(r => ({ key: r.key, questionType: r.questionType, questionText: r.questionText, submittedAnswer: r.submittedAnswer, state: r.state, earnedMarks: r.earnedMarks, availableMarks: r.availableMarks }));
}
