import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, adminDate, recordReference } from "../config/admin.js";
import AdminListControls from "./AdminListControls.jsx";
import AdminConfirmDialog from "./AdminConfirmDialog.jsx";
import AssignmentAnalytics from "./AssignmentAnalytics.jsx";
import QuestionReview from "./QuestionReview.jsx";

function RowSummary({ resource, row }) {
  if (resource === "users") return <><h3>{row.name}</h3><p>{row.email} · {row.publicId || "QV ID not assigned"}</p><p>{row.role} · {row.accountStatus}</p></>;
  if (resource === "quizzes") return <><h3>{row.title}</h3><p>{row.category} · {row.difficulty} · {row.questionCount} questions</p><p>{row.status} · {row.visibility} · {row.moderationState}</p><p>Creator: {row.creator?.name || "Unavailable"} {row.creator?.publicId}</p></>;
  if (resource === "groups") return <><h3>{row.name}</h3><p>{row.groupCode} · {row.status} · {row.memberCount} members</p><p>Teacher: {row.teacher?.name || "Unavailable"} {row.teacher?.publicId}</p></>;
  if (resource === "assignments") return <><h3>{row.title}</h3><p>{row.group?.name || "Former classroom"} · {row.group?.groupCode} · {row.state}</p><p>{row.assignedCount} assigned · Due {adminDate(row.dueAt)}</p></>;
  return <><h3>{row.quiz?.title || row.assignment?.title || "Former quiz"}</h3><p>{row.student?.name || "Unavailable student"} {row.student?.publicId} · {row.status}</p><p>{row.assignment ? row.assignment.group?.name : "Standalone"} · {row.status === "submitted" ? `${row.percentage}% (${row.score}/${row.totalMarks})` : "In progress"} · {adminDate(row.startedAt)}</p></>;
}
function RecordDetails({ resource, data, onGroupPage }) {
  const counts = data.details?.counts;
  if (resource === "users") return <><p>Created {adminDate(data.details.user.createdAt)}</p><dl className="admin-counts">{Object.entries(counts).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl></>;
  if (resource === "quizzes") return <><p>{data.details.quiz.description || "No description"}</p><p>{counts.assignments} assignments · {counts.attempts} attempts</p></>;
  if (resource === "groups") {
    const page = data.details.assignments;
    return <><h4>Related assignments ({page.total})</h4>{page.items.length ? page.items.map(a => <p key={a.token}><Link to={`/a/${a.token}`}>{a.title}</Link> · {a.state} · {a.assignedCount} assigned</p>) : <p>No related assignments.</p>}<div className="action-row"><button className="btn btn-secondary" disabled={page.page <= 1} onClick={() => onGroupPage(page.page - 1)}>Previous assignments</button><button className="btn btn-secondary" disabled={page.page >= page.pages} onClick={() => onGroupPage(page.page + 1)}>Next assignments</button></div></>;
  }
  if (resource === "assignments") return <><p>Teacher: {data.assignment.teacher?.name || "Unavailable"} {data.assignment.teacher?.publicId}</p><p>Opens {adminDate(data.assignment.opensAt)} · Due {adminDate(data.assignment.dueAt)} · Limit {data.assignment.attemptLimit}</p><p>Classroom: {data.assignment.classroomExists ? data.assignment.classroomStatus : "Deleted; historical reports retained"}</p><Link className="btn btn-secondary" to={`/a/${data.assignment.token}`}>Open assignment</Link><AssignmentAnalytics report={data.analytics} /></>;
  return data.attempt.status === "submitted" ? <><p>Submitted {adminDate(data.attempt.submittedAt)} · {data.attempt.timeTakenSeconds ?? "Unavailable"} seconds</p><QuestionReview review={data.attempt.review} /></> : <p>This attempt has not been submitted. No question review is available.</p>;
}
export default function AdminResourceList({ resource, title, filters }) {
  const [search, setSearchValue] = useState(""), [values, setValues] = useState({}), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null), [detail, setDetail] = useState(null), [detailError, setDetailError] = useState(""), [detailPage, setDetailPage] = useState(1);
  const [action, setAction] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    const query = new URLSearchParams({ search, page, limit: 20, ...values });
    adminApi(`${resource}?${query}`, { signal: controller.signal }).then(result => { if (current) { setData(result[resource]); setError(""); } }).catch(e => { if (current && e.name !== "AbortError") setError(e.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [resource, search, values, page, revision]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController(); let current = true;
    const ref = encodeURIComponent(recordReference(resource, selected));
    const load = async () => {
      const result = await adminApi(`${resource}/${ref}${resource === "groups" ? `?page=${detailPage}` : ""}`, { signal: controller.signal });
      if (resource === "assignments") result.analytics = (await adminApi(`assignments/${ref}/analytics`, { signal: controller.signal })).analytics;
      if (current) setDetail(result);
    };
    load().catch(e => { if (current && e.name !== "AbortError") setDetailError(e.message); });
    return () => { current = false; controller.abort(); };
  }, [resource, selected, detailPage]);
  function reset() { setLoading(true); setData(null); setError(""); setSelected(null); setDetail(null); setDetailError(""); }
  function filter(name, value) { reset(); setValues(previous => ({ ...previous, [name]: value })); setPage(1); }
  function inspect(row) { setSelected(row); setDetail(null); setDetailError(""); setDetailPage(1); }
  function ask(row, label, suffix, body, description) { setAction({ label, description, path: `${resource}/${encodeURIComponent(recordReference(resource, row))}/${suffix}`, body }); }
  function actions(row) {
    if (resource === "users" && row.role !== "admin" && row.publicId) return <><button className="btn btn-secondary" disabled={busy} onClick={() => ask(row, `Change ${row.name} to ${row.role === "student" ? "teacher" : "student"}`, "role", { role: row.role === "student" ? "teacher" : "student" }, "History and memberships are preserved. Active teaching resources may prevent demotion.")}>Change role</button><button className="btn btn-secondary" disabled={busy} onClick={() => ask(row, `${row.accountStatus === "suspended" ? "Unsuspend" : "Suspend"} ${row.name}`, "status", { accountStatus: row.accountStatus === "suspended" ? "active" : "suspended" }, "Suspension blocks login and authenticated requests. Unsuspension restores normal access.")}>{row.accountStatus === "suspended" ? "Unsuspend" : "Suspend"}</button></>;
    if (resource === "quizzes") return <>{(row.moderationState === "restricted" ? ["restore"] : [row.status === "published" ? "unpublish" : "publish", "restrict"]).map(command => <button className="btn btn-secondary" key={command} disabled={busy} onClick={() => ask(row, `${command} “${row.title}”`, "moderation", { action: command }, "Existing frozen attempts, assignments, and results remain intact. Restoring a quiz leaves it unpublished.")}>{command}</button>)}</>;
    if (resource === "groups") return <button className="btn btn-secondary" disabled={busy} onClick={() => ask(row, `${row.status === "active" ? "Archive" : "Restore"} ${row.name}`, "status", { status: row.status === "active" ? "archived" : "active" }, "Archiving pauses new classroom activity and attempts. History stays available; restoring resumes availability under existing rules.")}>{row.status === "active" ? "Archive" : "Restore"}</button>;
    return null;
  }
  async function confirm() {
    setBusy(true); setError(""); setMessage("");
    try { await adminApi(action.path, { method: "PATCH", body: action.body }); setMessage("Change saved."); setAction(null); reset(); setRevision(n => n + 1); }
    catch (e) { setError(e.message); setAction(null); } finally { setBusy(false); }
  }
  return <section><h2>{title}</h2><AdminListControls search={search} setSearch={value => { reset(); setSearchValue(value); setPage(1); setRevision(n => n + 1); }} values={values} setFilter={filter} filters={filters} page={page} pages={data?.pages} total={data?.total} loading={loading} setPage={value => { reset(); setPage(value); }} />
    {message && <p className="feedback feedback-success" role="status">{message}</p>}{error && <div className="feedback feedback-error" role="alert">{error}<button className="btn btn-secondary" onClick={() => { reset(); setRevision(n => n + 1); }}>Retry</button></div>}
    {loading && <p role="status">Loading {title.toLowerCase()}…</p>}{!loading && !error && !data?.items.length && <div className="state-box"><h3>No matching records</h3><p>Try another search or change the filters.</p></div>}
    {data?.searchTruncated && <p className="feedback">This broad search matched more than 100 people. Narrow the name search or enter a QV ID for complete relationship results.</p>}
    <div className="admin-records">{!loading && data?.items.map(row => {
      const ref = recordReference(resource, row);
      return <article className="panel" key={ref || row.email}><RowSummary resource={resource} row={row} /><div className="action-row"><button className="btn btn-secondary" disabled={!ref || busy} onClick={() => inspect(row)}>Inspect</button>{actions(row)}</div></article>;
    })}</div>
    {selected && <section className="panel admin-detail" aria-label="Selected record details"><div className="section-row"><h3>Record details</h3><button className="btn btn-secondary" onClick={() => { setSelected(null); setDetail(null); }}>Close details</button></div>{detailError ? <p className="feedback feedback-error" role="alert">{detailError}</p> : detail ? <RecordDetails resource={resource} data={detail} onGroupPage={value => { setDetail(null); setDetailPage(value); }} /> : <p role="status">Loading details…</p>}</section>}
    <AdminConfirmDialog action={action} busy={busy} onConfirm={confirm} onCancel={() => setAction(null)} />
  </section>;
}
