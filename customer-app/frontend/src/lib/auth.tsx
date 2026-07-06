import React, { createContext, useCallback, useContext, useState } from "react";
import { ApiError, TOKEN_KEY } from "./api";
import type { User } from "./types";

export { ApiError };

const USER_KEY = "customer_user";

interface LoginResponse {
  token: string;
  username: string;
  role: string;
  display_name: string;
}

async function postLogin(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch("http://localhost:8001/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail ?? msg; } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

async function postSignup(payload: object): Promise<LoginResponse> {
  const res = await fetch("http://localhost:8001/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail ?? msg; } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<User>;
  signup: (payload: object) => Promise<User>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const _applySession = useCallback((res: LoginResponse): User => {
    const u: User = { id: res.username, username: res.username, display_name: res.display_name, email: "", role: res.role as User["role"] };
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(res.token);
    setUser(u);
    return u;
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<User> => {
    const res = await postLogin(username, password);
    return _applySession(res);
  }, [_applySession]);

  const signup = useCallback(async (payload: object): Promise<User> => {
    const res = await postSignup(payload);
    return _applySession(res);
  }, [_applySession]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, token, login, signup, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
