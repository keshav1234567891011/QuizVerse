import { createContext, useContext } from "react";
export const NotificationsContext = createContext({ unreadCount: 0, error: "", refresh: async () => {} });
export const useNotifications = () => useContext(NotificationsContext);
