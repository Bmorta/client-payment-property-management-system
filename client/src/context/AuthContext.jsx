import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../services/api.js";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = () => {
    localStorage.removeItem("cpm_access_token");
    setUser(null);
  };

  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem("cpm_access_token");

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get("/auth/me");
        setUser(response.data.data.user);
      } catch (_error) {
        clearSession();
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (identifier, password) => {
    const response = await api.post("/auth/login", { identifier, password });
    localStorage.setItem("cpm_access_token", response.data.data.token);
    setUser(response.data.data.user);
    return response.data;
  };

  const logout = async () => {
    try {
      if (user) {
        await api.post("/auth/logout");
      }
    } catch (_error) {
      // Session is still cleared even when the logging request cannot complete.
    } finally {
      clearSession();
    }
  };

  const value = useMemo(
    () => ({ user, loading, login, logout, clearSession }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
};
