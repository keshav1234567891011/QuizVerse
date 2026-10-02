import { labels } from "../config/questions.js";
export default function QuestionReview({ review }) {
  if (!review?.length) return <p className="muted">Question-level review is unavailable for this historical attempt. Your saved score is unchanged.</p>;
  return <section className="result-review" aria-label="Question review"><h2>Your answers</h2>{review.map((r, i) => <article className="panel" key={r.key}><span className="eyebrow">Question {i + 1} · {labels[r.questionType] || "Single choice"}</span><h3>{r.questionText}</h3><p className="submitted-answer">Your answer: {r.submittedAnswer}</p><div className="section-row"><strong>{r.state === "correct" ? "Correct" : r.state === "unanswered" ? "Unanswered" : "Incorrect"}</strong><span>{r.earnedMarks} / {r.availableMarks} marks</span></div></article>)}</section>;
}
