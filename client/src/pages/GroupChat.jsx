import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { communicationsApi } from "../config/communications.js";
import { useAuth } from "../context/auth.js";

export default function GroupChat() {
  const { code } = useParams(), { user } = useAuth();
  return <Chat key={`${user.publicId}:${code}`} code={code} />;
}
function Chat({ code }) {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [message, setMessage] = useState(""), [type, setType] = useState("normal"), [busy, setBusy] = useState(false);
  const current = useRef(null), flight = useRef(false), pending = useRef(null), alive = useRef(false), requests = useRef(new Set());
  const get = useCallback(async suffix => {
    const controller = new AbortController(); requests.current.add(controller);
    try { return await communicationsApi(`groups/${encodeURIComponent(code)}/messages${suffix || ""}`, { signal: controller.signal }); }
    finally { requests.current.delete(controller); }
  }, [code]);
  const receive = useCallback(value => { current.current = value; setData(value); }, []);
  const refresh = useCallback(async () => {
    if (flight.current || document.hidden || !alive.current) return;
    flight.current = true;
    try {
      const existing = current.current;
      const after = existing?.messages.at(-1)?.publicId;
      const next = await get(after ? `?after=${after}` : "");
      if (!alive.current) return;
      const combined = existing ? [...existing.messages, ...next.messages] : next.messages;
      const unique = [...new Map(combined.map(row => [row.publicId, row])).values()];
      receive({ ...next, messages: unique, nextCursor: existing && after ? existing.nextCursor : next.nextCursor });
      setError("");
      // Additional pages of newer messages are retrieved on the next poll.
    } catch (e) { if (alive.current && e.name !== "AbortError") { setError(e.message); if (/cannot access|no longer exists/.test(e.message)) receive(null); } }
    finally { flight.current = false; }
  }, [get, receive]);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) refresh(); });
    const timer = setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    const controllers = requests.current;
    return () => { cancelled = true; alive.current = false; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); for (const c of controllers) c.abort(); };
  }, [refresh]);
  async function older() {
    if (flight.current || !data?.nextCursor) return;
    flight.current = true; setBusy(true);
    try { const next = await get(`?before=${data.nextCursor}`); if (alive.current) receive({ ...current.current, messages: [...next.messages, ...current.current.messages], nextCursor: next.nextCursor }); }
    catch (e) { if (alive.current) setError(e.message); } finally { flight.current = false; if (alive.current) setBusy(false); }
  }
  async function send(e) {
    e.preventDefault(); if (flight.current) return;
    flight.current = true; setBusy(true); setError("");
    const payload = { message: message.trim(), type };
    if (!pending.current || pending.current.message !== payload.message || pending.current.type !== type) pending.current = { ...payload, clientMessageId: crypto.randomUUID() };
    const controller = new AbortController(); requests.current.add(controller);
    let sent = false;
    try {
      await communicationsApi(`groups/${encodeURIComponent(code)}/messages`, { method: "POST", body: JSON.stringify(pending.current), signal: controller.signal });
      sent = true;
      pending.current = null;
      if (alive.current) { setMessage(""); setType("normal"); }
    } catch (e) { if (alive.current && e.name !== "AbortError") setError(e.message); }
    finally { requests.current.delete(controller); flight.current = false; if (alive.current) { setBusy(false); if (sent) await refresh(); } }
  }
  return <main className="chat-shell"><div className="page-toolbar"><div><span className="eyebrow">YOUR CLASSROOM CONVERSATION</span><h1>{data?.group.name || "Classroom chat"}</h1><p>{code} · Updates every 15 seconds while visible</p></div><Link className="btn btn-secondary" to="/groups">Classrooms</Link></div>
    {error && <div className="feedback feedback-error" role="alert"><span>{error}</span><button className="btn btn-secondary" onClick={refresh}>Retry</button></div>}
    {!data && !error && <div className="state-box" role="status">Loading classroom messages…</div>}
    {data && <><section className="panel chat-history" aria-label="Message history">{data.nextCursor && <button className="btn btn-secondary" disabled={busy} onClick={older}>Load older messages</button>}{data.messages.length === 0 && <div className="empty-inline"><h2>Start the conversation</h2><p>Share a question or a useful classroom update.</p></div>}{data.messages.map(row => <article className={`chat-message ${row.type === "announcement" ? "chat-announcement" : ""}`} key={row.publicId}><div className="section-row"><strong>{row.sender.name} <span className="pill">{row.sender.role}</span></strong><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time></div>{row.type === "announcement" && <span className="eyebrow">ANNOUNCEMENT</span>}<p>{row.message}</p><small>{row.sender.publicId || "Former classroom member"}</small></article>)}</section>
      {data.group.status === "active" ? <form className="panel auth-form chat-composer" onSubmit={send}><div className="form-group"><label htmlFor="chat-message">Message</label><textarea id="chat-message" disabled={busy} required maxLength={2000} rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="Write to your classroom…" /></div>{data.canAnnounce && <label className="notification-filter"><input type="checkbox" disabled={busy} checked={type === "announcement"} onChange={e => setType(e.target.checked ? "announcement" : "normal")} /> Post as announcement</label>}<div className="section-row"><small>{message.length}/2,000 · 20 messages per minute</small><button className="btn btn-primary" disabled={busy || !message.trim()}>{busy ? "Sending…" : "Send message"}</button></div></form> : <p className="feedback">This classroom is archived. Message history is read-only.</p>}
    </>}
  </main>;
}
