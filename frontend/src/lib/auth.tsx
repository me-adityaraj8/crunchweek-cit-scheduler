import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { request, setToken, setUnauthorizedHandler } from "@/api/client";
import type { LoginOut, SignupIn, User } from "@/api/types";
import { storage } from "./utils";

const KEY = "cit-auth";

interface Session {
  token: string;
  user: User;
}

interface AuthState {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  /** Make your own account; logs straight in. */
  signup: (input: SignupIn) => Promise<User>;
  logout: (reason?: string) => void;
  /** Why the last session ended (expired token, demo reset), shown on the login page. */
  notice: string | null;
}

const AuthContext = createContext<AuthState | null>(null);

function restore(): Session | null {
  try {
    const raw = storage()?.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(s: Session) {
  try {
    storage()?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: the session lives in memory only */
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

  const begin = useCallback((out: LoginOut) => {
    setToken(out.token);
    save(out);
    setNotice(null);
    setState({ token: out.token, user: out.user });
    return out.user;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => begin(await request<LoginOut>("/auth/login", { body: { email, password } })),
    [begin],
  );

  const signup = useCallback(async (input: SignupIn) => begin(await request<LoginOut>("/auth/signup", { body: input })), [begin]);

  useEffect(() => {
    setUnauthorizedHandler(() => logout("Your session ended. Log in again to carry on."));
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // The saved user can be out of date (an Admin changed the role since), so ask the API once per page load.
  useEffect(() => {
    const token = restore()?.token;
    if (!token) return;
    request<User>("/me")
      .then((user) =>
        setState((prev) => {
          if (prev?.token !== token) return prev; // logged out, or in as someone else, meanwhile
          save({ token, user });
          return { token, user };
        }),
      )
      .catch(() => {
        /* a 401 logs out through the handler above; offline keeps the saved user */
      });
  }, []);

  const value = useMemo(() => ({ user: state?.user ?? null, login, signup, logout, notice }), [state, login, signup, logout, notice]);
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
