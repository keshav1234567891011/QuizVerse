import { answerField } from "../config/questions.js";
export default function QuestionInput({ question: q, answer = {}, onChange, disabled = false }) {
  const type = q.questionType || "singleChoice", field = answerField(q), value = answer?.[field];
  const change = v => onChange({ [field]: v });
  return <fieldset className="typed-answer" disabled={disabled}><legend className="sr-only">Your answer</legend>
    {["singleChoice", "multipleSelect"].includes(type) && q.options.map((option, n) => <label className="assignment-option" key={n}><input type={type === "singleChoice" ? "radio" : "checkbox"} name={`answer-${q._id || q.key}`} checked={type === "singleChoice" ? value === n : (value || []).includes(n)} onChange={e => change(type === "singleChoice" ? n : e.target.checked ? [...(value || []), n] : value.filter(v => v !== n))} /><span>{option}</span></label>)}
    {type === "trueFalse" && [true, false].map(v => <label className="assignment-option" key={String(v)}><input type="radio" name={`answer-${q._id || q.key}`} checked={value === v} onChange={() => change(v)} />{v ? "True" : "False"}</label>)}
    {type === "shortAnswer" && <label>Your answer<textarea rows={3} maxLength={2000} value={value || ""} onChange={e => change(e.target.value)} /></label>}
    {type === "numeric" && <label>Numeric answer<input type="text" inputMode="decimal" maxLength={2000} value={value ?? ""} onChange={e => change(e.target.value)} placeholder="For example 0, -2.5, or 1e3" /></label>}
    {type === "fillBlank" && Array.from({ length: q.blankCount }, (_, i) => <label key={i}>Blank {i + 1}<input maxLength={2000} value={value?.[i] || ""} onChange={e => change(Array.from({ length: q.blankCount }, (_, n) => n === i ? e.target.value : value?.[n] || ""))} /></label>)}
    <button type="button" className="btn btn-secondary" onClick={() => change(type === "multipleSelect" ? [] : type === "fillBlank" ? Array(q.blankCount).fill("") : null)}>Clear answer</button>
  </fieldset>;
}
