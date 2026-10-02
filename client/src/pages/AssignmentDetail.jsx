import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AssignmentAnalytics from "../components/AssignmentAnalytics.jsx";
import { assignmentApi, dateLabel, localDate } from "../config/assignments.js";

export default function AssignmentDetail() {
  const { token } = useParams();
  return <Detail key={token} token={token} />;
}
function Detail({ token }) {
  const [data, setData] = useState(null), [report, setReport] = useState(null);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), [form, setForm] = useState(null);
  const load = useCallback(async signal => {
    const response = await assignmentApi(`assignments/${token}`, { signal });
    const analytics = response.canManage ? await assignmentApi(`assignments/${token}/analytics`, { signal }) : null;
    return { ...response, report: analytics?.analytics || null };
  }, [token]);
  const receive = useCallback(response => {
    setData(response);
    setForm({ opensAt: localDate(response.assignment.opensAt), dueAt: localDate(response.assignment.dueAt), attemptLimit: response.assignment.attemptLimit });
    setReport(response.report);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(receive).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [load, receive]);
  async function update(action) {
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = action === "close" || action === "reopen" ? { action } : { action,
        opensAt: form.opensAt ? new Date(form.opensAt).toISOString() : null,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null, attemptLimit: Number(form.attemptLimit) };
      await assignmentApi(`assignments/${token}`, { method: "PATCH", body: JSON.stringify(payload) });
      receive(await load()); setMessage(action === "publish" ? "Assignment published. Content and roster are frozen." : "Assignment updated.");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/a/${token}`); setMessage("Assignment link copied."); }
    catch { setMessage("Select and copy the link below."); }
  }
  const a = data?.assignment;
  return <main><div className="page-toolbar"><div><span className="eyebrow">CLASSROOM ASSIGNMENT</span><h1>{a?.title || "Assignment"}</h1>{a && <p>{a.group.name} · {a.group.groupCode}</p>}</div><Link className="btn btn-secondary" to="/assignments">All assignments</Link></div>
    {error && <p className="feedback feedback-error" role="alert">{error}</p>}{message && <p className="feedback feedback-success" role="status">{message}</p>}
    {!a && !error && <div className="state-box" role="status">Loading assignment…</div>}
    {a && <><section className="panel"><div className="section-row"><span className={`status-badge status-${a.state}`}>{a.state}</span><span>{a.assignedCount} assigned students</span></div><dl className="assignment-dates"><dt>Opens</dt><dd>{dateLabel(a.opensAt)}</dd><dt>Due</dt><dd>{dateLabel(a.dueAt)}</dd><dt>Attempt limit</dt><dd>{a.attemptLimit}</dd></dl>
      {data.canManage ? <><div className="assignment-actions"><button type="button" className="btn btn-secondary" onClick={copy}>Copy share link</button><input aria-label="Assignment share link" readOnly value={`${window.location.origin}/a/${token}`} onFocus={e => e.target.select()} /></div><p className="muted">This link requires sign-in and classroom eligibility.</p></> : <><p>{data.attemptsUsed} of {a.attemptLimit} attempts used. Starting an attempt uses a slot; an unfinished attempt resumes automatically.</p>{a.state === "open" && (data.attemptsUsed < a.attemptLimit || data.attempts.some(x => x.status === "in-progress")) ? <Link className="btn btn-primary" to={`/a/${token}/play`}>{data.attempts.some(x => x.status === "in-progress") ? "Resume attempt" : "Start assignment"}</Link> : <p className="feedback">{a.state === "open" ? "Your attempt limit has been reached." : `This assignment is ${a.state}.`}</p>}</>}
    </section>
    {data.canManage && form && <section className="panel"><h2>Availability & settings</h2><form className="auth-form" onSubmit={e => { e.preventDefault(); update(); }}><div className="assignment-settings"><div className="form-group"><label htmlFor="detail-opens">Opens (local time)</label><input id="detail-opens" type="datetime-local" value={form.opensAt} onChange={e => setForm({ ...form, opensAt: e.target.value })} /></div><div className="form-group"><label htmlFor="detail-due">Due (local time)</label><input id="detail-due" type="datetime-local" value={form.dueAt} onChange={e => setForm({ ...form, dueAt: e.target.value })} /></div><div className="form-group"><label htmlFor="detail-limit">Attempt limit</label><input id="detail-limit" type="number" min="1" max="100" required value={form.attemptLimit} onChange={e => setForm({ ...form, attemptLimit: e.target.value })} /></div></div><div className="assignment-actions"><button className="btn btn-secondary" disabled={busy}>Save settings</button>{a.state === "draft" ? <button type="button" className="btn btn-primary" disabled={busy} onClick={() => update("publish")}>Publish assignment</button> : <button type="button" className="btn btn-primary" disabled={busy} onClick={() => update(a.state === "closed" ? "reopen" : "close")}>{a.state === "closed" ? "Reopen" : "Close assignment"}</button>}</div></form><p className="muted">After attempts start, you can extend the due time or raise the attempt limit. Quiz content and the published roster stay fixed.</p></section>}
    {report && <AssignmentAnalytics report={report} />}
    {!data.canManage && <section className="panel"><h2>Your assignment history</h2>{data.attempts.length ? <div className="attempt-list">{data.attempts.map(r => <article className="attempt-card" key={r.publicId}><div><h3>Attempt {r.attemptNumber}</h3><p>{r.status} · {dateLabel(r.startedAt)}</p></div>{r.status === "submitted" ? <><strong>{r.percentage}%</strong><Link className="btn btn-secondary" to={`/assignment-attempts/${r.publicId}/result`}>View result</Link></> : <span className="muted">Saved in progress</span>}</article>)}</div> : <p>You haven't started this assignment yet.</p>}</section>}</>}
  </main>;
}
