import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { assignmentApi } from "../config/assignments.js";

export default function CreateAssignment() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [choices, setChoices] = useState(null);
  const [form, setForm] = useState({ quizId: "", groupCode: params.get("group") || "", opensAt: "", dueAt: "", attemptLimit: 1 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([assignmentApi("quizzes/mine", { signal: controller.signal }), assignmentApi("groups", { signal: controller.signal })])
      .then(([q, g]) => setChoices({ quizzes: q.quizzes, groups: g.groups.filter(g => g.status === "active") }))
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, []);
  const change = e => setForm(previous => ({ ...previous, [e.target.name]: e.target.value }));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const data = await assignmentApi("assignments", { method: "POST", body: JSON.stringify({ ...form,
        opensAt: form.opensAt ? new Date(form.opensAt).toISOString() : null,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null, attemptLimit: Number(form.attemptLimit) }) });
      navigate(`/a/${data.assignment.token}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <main className="assignment-form-shell"><div className="page-toolbar"><div><span className="eyebrow">PLAN THE NEXT CHALLENGE</span><h1>Create assignment</h1><p>One quiz. One classroom. A clear picture of every student's progress.</p></div><Link className="btn btn-secondary" to="/assignments">Back</Link></div>
    {error && <p className="feedback feedback-error" role="alert">{error}</p>}
    {!choices && !error && <p className="state-box" role="status">Loading your quizzes and classrooms…</p>}
    {choices && <form className="panel auth-form" onSubmit={submit}>
      <div className="form-group"><label htmlFor="assignment-quiz">Quiz</label><select id="assignment-quiz" name="quizId" value={form.quizId} onChange={change} required><option value="">Choose your quiz</option>{choices.quizzes.map(q => <option value={q._id} key={q._id}>{q.title} ({q.status})</option>)}</select><p className="muted">Draft quizzes can be selected; publish the quiz before publishing its assignment.</p></div>
      <div className="form-group"><label htmlFor="assignment-group">Classroom</label><select id="assignment-group" name="groupCode" value={form.groupCode} onChange={change} required><option value="">Choose a classroom</option>{choices.groups.map(g => <option value={g.groupCode} key={g.groupCode}>{g.name} · {g.groupCode}</option>)}</select></div>
      <div className="assignment-settings"><div className="form-group"><label htmlFor="assignment-opens">Opening time (your local time)</label><input id="assignment-opens" name="opensAt" type="datetime-local" value={form.opensAt} onChange={change} /></div><div className="form-group"><label htmlFor="assignment-due">Due time (your local time)</label><input id="assignment-due" name="dueAt" type="datetime-local" value={form.dueAt} onChange={change} /></div><div className="form-group"><label htmlFor="assignment-limit">Attempt limit</label><input id="assignment-limit" name="attemptLimit" type="number" min="1" max="100" step="1" required value={form.attemptLimit} onChange={change} /></div></div>
      <p className="feedback">Publication freezes the quiz questions, answer key, and assigned student roster. Later quiz edits and new classroom members do not change this assignment.</p>
      <button className="btn btn-primary" disabled={busy || !choices.quizzes.length || !choices.groups.length}>{busy ? "Creating…" : "Create draft assignment"}</button>
      {(!choices.quizzes.length || !choices.groups.length) && <p>Create a quiz and an active classroom first.</p>}
    </form>}
  </main>;
}
