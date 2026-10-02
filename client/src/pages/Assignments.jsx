import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/auth.js";
import { assignmentApi, dateLabel } from "../config/assignments.js";

export default function Assignments() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const canTeach = user.role !== "student";
  const group = params.get("group");
  useEffect(() => {
    const controller = new AbortController();
    assignmentApi("assignments", { signal: controller.signal }).then(data => setItems(data.assignments))
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, []);
  const visible = items?.filter(a => !group || a.group.groupCode === group);
  return <main><div className="page-toolbar"><div><span className="eyebrow">CLASSROOM LEARNING</span><h1>Assignments</h1><p>{canTeach ? "Deliver your quizzes and follow each classroom's progress." : "Your classroom activities, deadlines, and saved results."}</p>{group && <p>Classroom: {group} · <Link to="/assignments">Show all</Link></p>}</div>{canTeach && <Link className="btn btn-primary" to={`/assignments/create${group ? `?group=${encodeURIComponent(group)}` : ""}`}>Create assignment</Link>}</div>
    {error && <div className="feedback feedback-error" role="alert">{error}</div>}
    {!items && !error && <div className="state-box" role="status">Loading assignments…</div>}
    {visible?.length === 0 && <div className="state-box"><h2>No assignments here yet</h2><p>{canTeach ? "Choose a quiz and a classroom to create your first assignment." : "Published activities from your classrooms will appear here."}</p><Link className="btn btn-secondary" to="/groups">View classrooms</Link></div>}
    <section className="assignment-grid">{visible?.map(a => <article className="panel assignment-card" key={a.token}><div className="section-row"><span className={`status-badge status-${a.state}`}>{a.state}</span><span className="muted">{a.attemptLimit} attempt{a.attemptLimit === 1 ? "" : "s"}</span></div><h2>{a.title}</h2><p>{a.group.name} <span className="muted">{a.group.groupCode}</span></p><dl className="assignment-dates"><dt>Opens</dt><dd>{dateLabel(a.opensAt)}</dd><dt>Due</dt><dd>{dateLabel(a.dueAt)}</dd></dl><p>{a.assignedCount} assigned students</p><Link className="btn btn-secondary" to={`/a/${a.token}`}>{canTeach ? "Details & analytics" : "View assignment"}</Link></article>)}</section>
  </main>;
}
