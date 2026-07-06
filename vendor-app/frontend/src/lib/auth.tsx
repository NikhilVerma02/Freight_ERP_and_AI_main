import React, { createContext, useCallback, useContext, useState } from "react";
import { api, ApiError, TOKEN_KEY } from "./api";
import type { User, VendorRole } from "./types";

export { ApiError };

const USER_KEY = "vendor_user";

interface LoginResponse {
  token: string;
  username: string;
  role: string;
  display_name: string;
  company_name?: string | null;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  hasRole: (...roles: VendorRole[]) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const login = useCallback(async (username: string, password: string): Promise<User> => {
    const res = await api.post<LoginResponse>("/api/auth/login", { username, password });
    const u: User = { id: res.username, username: res.username, display_name: res.display_name, company_name: res.company_name ?? undefined, email: "", role: res.role as VendorRole };
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(res.token);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles: VendorRole[]) => {
    return roles.some((r) => user?.role === r);
  }, [user]);

  return <Ctx.Provider value={{ user, token, login, logout, hasRole }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
