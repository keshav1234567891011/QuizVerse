import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth.js";
import { NotificationsContext } from "./notifications.js";
import { communicationsApi } from "../config/communications.js";

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  return user ? <SessionNotifications key={user.publicId} children={children} /> :
    <NotificationsContext.Provider value={{ unreadCount: 0, error: "", refresh: async () => {} }}>{children}</NotificationsContext.Provider>;
}
function SessionNotifications({ children }) {
  const [unreadCount, setCount] = useState(null), [error, setError] = useState("");
  const request = useRef(null), alive = useRef(false);
  const refresh = useCallback(async () => {
    if (request.current || document.hidden || !alive.current) return;
    const controller = new AbortController(); request.current = controller;
    try {
      await communicationsApi("notifications/sync", { method: "POST", signal: controller.signal });
      const data = await communicationsApi("notifications/unread-count", { signal: controller.signal });
      if (!controller.signal.aborted) { setCount(data.unreadCount); setError(""); }
    } catch (e) { if (!controller.signal.aborted) setError(e.message); }
    finally { if (request.current === controller) request.current = null; }
  }, []);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) refresh(); });
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { cancelled = true; alive.current = false; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); request.current?.abort(); request.current = null; };
  }, [refresh]);
  return <NotificationsContext.Provider value={{ unreadCount, error, refresh }}>{children}</NotificationsContext.Provider>;
}
