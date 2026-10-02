import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "../config/api.js";
import { useAuth } from "../context/auth.js";

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}/api/groups${path}`, { credentials: "include", ...options,
    headers: { "Content-Type": "application/json", ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "The request could not be completed.");
  return data;
}
export default function Groups() {
  const { user } = useAuth();
  const student = user.role === "student";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const busyRef = useRef(false);
  const [form, setForm] = useState({ name: "", description: "", teacherPublicId: "" });
  const [code, setCode] = useState("");
  const [inviteIds, setInviteIds] = useState({});
  const [filter, setFilter] = useState("pending");
  const load = useCallback(async (signal) => {
    const [groups, requests] = await Promise.all([api("", {signal}), api("/requests", {signal})]);
    setData({ groups: groups.groups, requests: requests.requests });
    setStale(false);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api("", {signal:controller.signal}), api("/requests", {signal:controller.signal})])
      .then(([groups, requests]) => setData({ groups: groups.groups, requests: requests.requests }))
      .catch(e=>{if(e.name!=="AbortError")setError(e.message);});
    return ()=>controller.abort();
  }, [load]);
  async function action(path, method, body, success, reset) {
    if (busyRef.current || stale) return;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      setMessage(success); reset?.();
      try { await load(); } catch { setStale(true); setError("Your change was saved, but the latest classroom list could not be loaded. Refresh before making another change."); }
    } catch (e) { setError(e.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function retry() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try { await load(); } catch(e) {setError(e.message);}
    finally { busyRef.current = false; setBusy(false); }
  }
  const requests = data?.requests.filter(r=>filter === "all" || r.status === filter) || [];
  const pending = data?.requests.filter(r=>r.status === "pending").length || 0;
  return <main className="classrooms-page">
    <section className="page-intro"><span className="eyebrow">BETTER TOGETHER</span><h1>Your classrooms<span className="accent-dot">.</span></h1><p>{student ? "Find your people. Accept an invitation or ask to join your next class." : "A welcoming space for your students, with you in control of who joins."}</p></section>
    <div className="identity-strip"><div><span>Your QuizVerse ID</span><strong>{user.publicId || "ID not assigned yet"}</strong></div><p>Share your public ID to connect. Classroom membership always requires approval.</p></div>
    {error && <div className="feedback feedback-error" role="alert"><span>{error}</span><button className="btn btn-secondary" disabled={busy} onClick={retry}>Refresh</button></div>}
    {message && <div className="feedback feedback-success" role="status">{message}</div>}
    <section className="panel classroom-entry"><div><span className="eyebrow">{student ? "HAVE A CLASS CODE?" : "MAKE ROOM FOR GREAT IDEAS"}</span><h2>{student ? "Request to join a classroom" : "Create a classroom"}</h2><p>{student ? "Your teacher will review your request before you become a member." : "Create your class, then invite students with their QuizVerse IDs."}</p></div>
      {student ? <form onSubmit={e=>{e.preventDefault();action("/join-requests","POST",{groupCode:code},"Join request sent. Your teacher will review it.",()=>setCode(""));}}><div className="form-group"><label htmlFor="group-code">Group code</label><input id="group-code" placeholder="GRP-XXXXXXXX" value={code} onChange={e=>setCode(e.target.value)} required autoComplete="off" title="Group code: GRP- followed by eight hexadecimal characters" pattern="[Gg][Rr][Pp]-[a-fA-F0-9]{8}" maxLength={12} autoCapitalize="characters" /></div><button className="btn btn-primary" disabled={busy || stale}>{busy ? "Please wait..." : "Send join request"}</button></form>
      : <form className="classroom-create-form" onSubmit={e=>{e.preventDefault();action("","POST",form,"Classroom created. You're ready to invite students.",()=>setForm({name:"",description:"",teacherPublicId:""}));}}><div className="form-group"><label htmlFor="class-name">Classroom name</label><input id="class-name" placeholder="e.g. Biology · Year 10" required minLength={2} maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></div><div className="form-group"><label htmlFor="class-description">Description <span className="muted">(optional)</span></label><input id="class-description" placeholder="What will you learn together?" maxLength={500} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} /></div>{user.role === "admin" && <div className="form-group"><label htmlFor="teacher-id">Teacher QuizVerse ID <span className="muted">(optional)</span></label><input id="teacher-id" placeholder="QV-XXXXXXXX" pattern="[Qq][Vv]-[a-fA-F0-9]{8}" maxLength={11} value={form.teacherPublicId} onChange={e=>setForm({...form,teacherPublicId:e.target.value})} /><small>Leave empty to manage this classroom yourself.</small></div>}<button className="btn btn-primary" disabled={busy || stale}>{busy ? "Please wait..." : "+ Create classroom"}</button></form>}
    </section>
    {!data && !error && <div className="loading-grid" role="status"><div className="skeleton-card" aria-hidden="true" /><div className="skeleton-card" aria-hidden="true" /><p>Loading your classrooms and invitations...</p></div>}
    {data && <>
      <section id="requests" className="panel requests-panel"><div className="section-row"><div><span className="eyebrow">STAY CONNECTED</span><h2>Invitations & join requests <span className="count-badge">{pending}</span></h2></div><div><label className="sr-only" htmlFor="request-filter">Filter request status</label><select id="request-filter" className="filter-select" value={filter} onChange={e=>setFilter(e.target.value)}>{["pending","accepted","declined","cancelled","all"].map(value=><option key={value} value={value}>{value === "all" ? "All activity" : value[0].toUpperCase()+value.slice(1)}</option>)}</select></div></div>
        {requests.length === 0 ? <div className="empty-inline"><span aria-hidden="true">✦</span><h3>{filter === "pending" ? "You're all caught up" : "No activity here yet"}</h3><p>{student ? "Your classroom invitations and join requests will appear here." : "Invite a student or share your group code to get started."}</p></div> : <div className="request-list">{requests.map(request=><article className="request-row" key={request.publicId}><div className="request-avatar" aria-hidden="true">{request.kind === "invitation" ? "\u2709" : "+"}</div><div className="request-copy"><div className="request-meta"><span>{request.kind === "invitation" ? "Invitation" : "Join request"}</span><span className={`request-status status-${request.status}`}>{request.status}</span></div><h3>{request.group?.name || "Deleted classroom"}</h3><p>{student ? (request.kind === "invitation" ? `Invited by ${request.invitedBy?.name || "your teacher"}` : "Your request to join") : `${request.student?.name || "Former student"} · ${request.student?.publicId || "ID unavailable"}`}{request.group && ` · ${request.group.groupCode}`}</p><small>{new Date(request.createdAt).toLocaleDateString()}{request.status === "pending" && !request.canRespond ? (student ? " · Awaiting teacher review" : " · Awaiting student response") : ""}</small></div>{request.canRespond && <div className="action-row"><button className="btn btn-primary" disabled={busy || stale} onClick={()=>action(`/requests/${request.publicId}/respond`,"POST",{decision:"accepted"},"Accepted. Classroom membership has been updated.")}>Accept</button><button className="btn btn-secondary" disabled={busy || stale} onClick={()=>action(`/requests/${request.publicId}/respond`,"POST",{decision:"declined"},"Declined. No membership was added.")}>Decline</button></div>}</article>)}</div>}
      </section>
      <section aria-labelledby="classroom-list-title"><div className="section-row"><h2 id="classroom-list-title">{user.role === "admin" ? "All classrooms" : "My classrooms"}</h2><span className="muted">{data.groups.length} {data.groups.length === 1 ? "classroom" : "classrooms"}</span></div>
      {data.groups.length === 0 ? <div className="panel empty-inline"><span aria-hidden="true">✦</span><h3>Your community starts here</h3><p>{student ? "Accept a classroom invitation or send a join request using your teacher's group code." : "Create your first classroom above and invite students to join."}</p></div> : <div className="classroom-grid">{data.groups.map(group=><article className="classroom-card" key={group.groupCode}><div className="classroom-card-banner"><span className="classroom-monogram" aria-hidden="true">{group.name[0].toUpperCase()}</span><span className="pill">{group.memberCount} {group.memberCount === 1 ? "member" : "members"}</span></div><div className="classroom-card-body"><h3>{group.name}</h3><p>{group.description || "A space to learn and grow together."}</p><div className="teacher-line"><span className="avatar" aria-hidden="true">{group.teacher?.name?.[0] || "?"}</span><div><strong>{group.teacher?.name || "Teacher unavailable"}</strong><span>Teacher · {group.teacher?.publicId || "ID unavailable"}</span></div></div><div className="class-code"><span>Group code</span><strong>{group.groupCode}</strong></div>
        {group.canManage && group.status === "active" && <form className="invite-form" onSubmit={e=>{e.preventDefault();action(`/${group.groupCode}/invitations`,"POST",{publicId:inviteIds[group.groupCode]},"Invitation sent. The student must accept before joining.",()=>setInviteIds({...inviteIds,[group.groupCode]:""}));}}><label htmlFor={`invite-${group.groupCode}`}>Invite a student by QuizVerse ID</label><div className="input-action"><input id={`invite-${group.groupCode}`} placeholder="QV-XXXXXXXX" required autoComplete="off" title="QuizVerse ID: QV- followed by eight hexadecimal characters" pattern="[Qq][Vv]-[a-fA-F0-9]{8}" maxLength={11} value={inviteIds[group.groupCode] || ""} onChange={e=>setInviteIds({...inviteIds,[group.groupCode]:e.target.value})} /><button className="btn btn-primary" disabled={busy || stale}>Invite</button></div><small>They choose whether to join.</small></form>}
        <div className="assignment-actions"><Link className="btn btn-secondary" to={`/assignments?group=${group.groupCode}`}>Assignments</Link>{group.canManage && <Link className="btn btn-secondary" to={`/assignments/create?group=${group.groupCode}`}>Assign quiz</Link>}</div><details className="member-details"><summary>Classroom members ({group.memberCount})</summary>{group.students.length === 0 ? <p>No members yet. Accepted requests will appear here.</p> : group.students.map((member,index)=><div className="member-row" key={member?.publicId || index}><div><strong>{member?.name || "Former student"}</strong><span>{member?.publicId || "ID unavailable"}</span></div>{group.canManage && member?.publicId && <button className="btn btn-secondary" disabled={busy || stale} aria-label={`Remove ${member.name}`} onClick={()=>{if(window.confirm(`Remove ${member.name} from ${group.name}?`))action(`/${group.groupCode}/students/${member.publicId}`,"DELETE",null,"Student removed from the classroom.");}}>Remove</button>}</div>)}</details>
        {group.canManage && <button className="text-button danger-link" disabled={busy || stale} onClick={()=>{if(window.confirm(`Delete ${group.name}? Pending invitations and requests will be cancelled.`))action(`/${group.groupCode}`,"DELETE",null,"Classroom deleted. Pending requests were cancelled.");}}>Delete classroom</button>}
      </div></article>)}</div>}</section>
    </>}
  </main>;
}
