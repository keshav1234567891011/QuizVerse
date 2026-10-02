import { useEffect, useState } from "react";
import { API_URL } from "../config/api.js";
import { AuthContext } from "./auth.js";


export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
      });

      if (!response.ok) {
        setUser(null);
        return;
      }

      const data = await response.json();
      setUser(data.user);
    } catch (error) {
      console.error("Auth check failed:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };
  const logout = async () => {
    const response = await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST", credentials: "include",
    });
    if (!response.ok) throw new Error("Logout failed");
    setUser(null);
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/auth/me`, { credentials: "include", signal: controller.signal })
      .then(async response => response.ok ? (await response.json()).user : null)
      .then(setUser)
      .catch(error => { if (error.name !== "AbortError") setUser(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        checkAuth,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
