import { useEffect, useRef } from "react";
export default function AdminConfirmDialog({ action, busy, onConfirm, onCancel }) {
  const dialog = useRef(null);
  useEffect(() => { if (action) dialog.current.showModal(); else dialog.current.close(); }, [action]);
  return <dialog ref={dialog} className="admin-confirm" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }} aria-labelledby="admin-confirm-title"><h2 id="admin-confirm-title">{action?.label}</h2><p>{action?.description}</p><p>This action preserves historical results and can be reversed where applicable.</p><div className="action-row"><button className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={onConfirm}>{busy ? "Saving…" : "Confirm"}</button></div></dialog>;
}
