// Shared by standalone and assignment attempts; all grading inputs are server-owned.
export function gradeAnswers(questions, answers) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!Array.isArray(answers)) fail("Answers must be an array.");
  const questionMap = new Map(questions.map(question => [String(question._id), question]));
  const selected = new Map();
  for (const answer of answers) {
    if (!answer || typeof answer !== "object") fail("Invalid answer.");
    const id = String(answer.questionId || "");
    if (!questionMap.has(id)) fail("An answer references a question outside this quiz.");
    if (selected.has(id)) fail("The same question was answered more than once.");
    const option = answer.selectedOption == null ? null : Number(answer.selectedOption);
    if (option !== null && (!Number.isInteger(option) || option < 0 || option >= questionMap.get(id).options.length)) fail("Invalid selected option.");
    selected.set(id, option);
  }
  let score = 0, correctAnswers = 0, totalMarks = 0;
  const graded = questions.map(question => {
    const selectedOption = selected.get(String(question._id)) ?? null;
    const isCorrect = selectedOption !== null && selectedOption === question.correctOption;
    const marksAwarded = isCorrect ? question.marks : 0;
    totalMarks += question.marks;
    score += marksAwarded;
    if (isCorrect) correctAnswers++;
    return { questionId: question._id, selectedOption, isCorrect, marksAwarded };
  });
  return { answers: graded, score, correctAnswers, totalMarks, totalQuestions: questions.length,
    percentage: totalMarks ? Number((score / totalMarks * 100).toFixed(2)) : 0 };
}
