import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { request, setToken, setUnauthorizedHandler } from "@/api/client";
import type { LoginOut, User } from "@/api/types";
import { storage } from "./utils";

const KEY = "cit-auth";

interface AuthState {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  logout: (reason?: string) => void;
  /** Why the last session ended (expired token, demo reset), shown on the login page. */
  notice: string | null;
}

const AuthContext = createContext<AuthState | null>(null);

function restore(): { token: string; user: User } | null {
  try {
    const raw = storage()?.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState(() => {
    const saved = restore();
    if (saved) setToken(saved.token);
    return saved;
  });
  const [notice, setNotice] = useState<string | null>(null);

  const logout = useCallback(
    (reason?: string) => {
      setToken(null);
      try {
        storage()?.removeItem(KEY);
      } catch {
        /* storage blocked: nothing to clear */
      }
      setState(null);
      setNotice(reason ?? null);
      qc.clear();
    },
    [qc],
  );

  const login = useCallback(async (email: string, password: string) => {
    const out = await request<LoginOut>("/auth/login", { body: { email, password } });
    setToken(out.token);
    try {
      storage()?.setItem(KEY, JSON.stringify({ token: out.token, user: out.user }));
    } catch {
      /* private mode: the session lives in memory only */
    }
    setNotice(null);
    setState({ token: out.token, user: out.user });
    return out.user;
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout("Your session ended. Log in again to carry on."));
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const value = useMemo(() => ({ user: state?.user ?? null, login, logout, notice }), [state, login, logout, notice]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** The signed-in user. Only call inside the authenticated shell. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("useUser without a user");
  return user;
}
