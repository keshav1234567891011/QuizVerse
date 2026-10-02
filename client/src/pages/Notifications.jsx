import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { communicationsApi, notificationLink } from "../config/communications.js";
import { useNotifications } from "../context/notifications.js";

export default function Notifications() {
  const [unread, setUnread] = useState(false);
  return <main><div className="page-toolbar"><div><span className="eyebrow">STAY IN THE LOOP</span><h1>Notifications</h1><p>Your classroom invitations, assignments, and announcements.</p></div><label className="notification-filter"><input type="checkbox" checked={unread} onChange={e => setUnread(e.target.checked)} /> Unread only</label></div><Inbox key={String(unread)} unread={unread} /></main>;
}
function Inbox({ unread }) {
  const { unreadCount, error: countError, refresh } = useNotifications();
  const [data, setData] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const flight = useRef(null);
  const load = useCallback((before, signal) => communicationsApi(`notifications?unread=${unread}${before ? `&before=${before}` : ""}`, { signal }), [unread]);
  useEffect(() => {
    const controller = new AbortController();
    flight.current = controller;
    load(null, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (flight.current === controller) flight.current = null; });
    return () => { flight.current?.abort(); flight.current = null; };
  }, [load]);
  async function action(path) {
    if (flight.current) return;
    const controller = new AbortController(); flight.current = controller; setBusy(true); setError("");
    try {
      if (path) await communicationsApi(path, { method: "PATCH", signal: controller.signal });
      else await communicationsApi("notifications/sync", { method: "POST", signal: controller.signal });
      const next = await load(null, controller.signal);
      if (!controller.signal.aborted) { setData(next); await refresh(); }
    } catch (e) { if (!controller.signal.aborted) setError(e.message); } finally { if (flight.current === controller) flight.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  async function more() {
    if (flight.current || !data?.nextCursor) return;
    const controller = new AbortController(); flight.current = controller; setBusy(true); setError("");
    try { const next = await load(data.nextCursor, controller.signal); if (!controller.signal.aborted) setData(previous => ({ ...next, notifications: [...previous.notifications, ...next.notifications] })); }
    catch (e) { if (!controller.signal.aborted) setError(e.message); } finally { if (flight.current === controller) flight.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <><div className="section-row"><p>{unreadCount === null ? "Checking unread count…" : `${unreadCount} unread`}</p><div className="action-row"><button className="btn btn-secondary" disabled={busy} onClick={() => action()}>Refresh</button><button className="btn btn-primary" disabled={busy || unreadCount === 0} onClick={() => action("notifications/read-all")}>Mark all read</button></div></div>{(error || countError) && <p className="feedback feedback-error" role="alert">{error || countError}</p>}
    {!data && !error && <div className="state-box" role="status">Loading notifications…</div>}
    {data?.notifications.length === 0 && <div className="state-box"><h2>You're all caught up</h2><p>{unread ? "No unread notifications." : "Your next classroom update will appear here."}</p></div>}
    <div className="notification-list">{data?.notifications.map(n => <article className={`panel notification-card ${n.read ? "" : "notification-unread"}`} key={n.publicId}><div><span className="eyebrow">{n.read ? "READ" : "UNREAD"}</span><h2>{n.title}</h2><p>{n.message}</p><small>{n.actor?.name && `${n.actor.name} · `}{new Date(n.createdAt).toLocaleString()}</small></div><div className="assignment-actions"><Link className="btn btn-secondary" to={notificationLink(n)}>Open</Link>{!n.read && <button className="btn btn-secondary" disabled={busy} onClick={() => action(`notifications/${n.publicId}/read`)}>Mark read</button>}</div></article>)}</div>
    {data?.nextCursor && <button className="btn btn-secondary" disabled={busy} onClick={more}>{busy ? "Loading…" : "Load more"}</button>}
  </>;
}
