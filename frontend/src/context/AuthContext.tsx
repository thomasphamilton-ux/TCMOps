import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import api from "../api/client";

export type Role = "admin" | "manager" | "supervisor" | "foreman" | "employee";

export interface AuthUser {
  id: number;
  name: string;
  phone: string;
  role: Role;
  teamId: number | null;
  projectId: number | null;
}

export interface RegisterPayload {
  token: string;
  name: string;
  phone: string;
  pin: string;
  language?: string;
  image: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (phone: string, pin: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate the session on load/refresh instead of dropping back to the
  // login screen every time the tab reloads.
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setLoading(false));
  }, []);

  const login = async (phone: string, pin: string) => {
    const res = await api.post("/auth/login", { phone, pin });
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
  };

  const register = async (payload: RegisterPayload) => {
    const res = await api.post("/auth/register", payload);
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
