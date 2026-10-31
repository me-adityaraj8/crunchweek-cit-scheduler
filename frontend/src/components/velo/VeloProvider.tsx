import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { errorMessage } from "@/api/client";
import { useAskVelo } from "@/api/hooks";
import type { VeloFocus, VeloOut } from "@/api/types";
import { useUser } from "@/lib/auth";
import { useMediaQuery } from "@/lib/hooks";

/** Where a confirmable action on a card stands. Kept in the thread so a result survives navigation. */
export interface ActionState {
  status: "confirming" | "running" | "done" | "failed";
  /** which option on the card it is for (a card can offer several) */
  key?: string;
  result?: unknown;
  error?: string;
}

export type Msg =
  | { id: string; from: "you"; text: string }
  | { id: string; from: "velo"; out: VeloOut; action?: ActionState }
  | { id: string; from: "error"; text: string; retry: string };

interface Thread {
  messages: Msg[];
  draftText: string | null;
  lastIntent: VeloOut["intent"] | null;
}

interface Velo extends Thread {
  open: boolean;
  expanded: boolean;
  pending: boolean;
  unread: boolean;
  focus: VeloFocus | null;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  setExpanded: (v: boolean) => void;
  send: (text: string, focus?: VeloFocus | null) => void;
  reset: () => void;
  setAction: (id: string, a: ActionState | undefined) => void;
  setFocus: (f: VeloFocus | null) => void;
}

const Ctx = createContext<Velo | null>(null);
const EMPTY: Thread = { messages: [], draftText: null, lastIntent: null };
const KEEP = 60;

function load(key: string): Thread {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return EMPTY;
    const t = JSON.parse(raw) as Thread;
    // an action that was running when the page went away did not report back; let the person retry
    const messages = t.messages.map((m) =>
      m.from === "velo" && m.action?.status === "running" ? { ...m, action: { ...m.action, status: "failed" as const, error: "Interrupted before it finished. Check the page, then try again." } } : m,
    );
    return { ...t, messages };
  } catch {
    return EMPTY;
  }
}

let seq = 0;
const nid = () => `${Date.now().toString(36)}-${(++seq).toString(36)}`;

export function VeloProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const key = `velo:v1:${user.id}`;
  const location = useLocation();
  const nav = useNavigate();
  const wide = useMediaQuery("(min-width: 768px)");
  const ask = useAskVelo();
  const [thread, setThread] = useState<Thread>(() => load(key));
  const [open, setOpenState] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [unread, setUnread] = useState(false);
  // what a page has open, tagged with the page, so it never leaks onto another page
  const [held, setHeld] = useState<{ focus: VeloFocus | null; path: string }>({ focus: null, path: "" });
  const focus = held.path === location.pathname ? held.focus : null;
  const setFocus = useCallback((f: VeloFocus | null) => setHeld({ focus: f, path: window.location.pathname }), []);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ...thread, messages: thread.messages.slice(-KEEP) }));
    } catch {
      /* private mode or full storage: the thread still lives for this page */
    }
  }, [key, thread]);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    if (v) setUnread(false);
  }, []);
  const toggle = useCallback(() => setOpen(!openRef.current), [setOpen]);

  // Ctrl/Cmd J from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const send = useCallback(
    (text: string, override?: VeloFocus | null) => {
      const t = text.trim();
      if (!t || ask.isPending) return;
      setThread((th) => ({ ...th, messages: [...th.messages, { id: nid(), from: "you", text: t }] }));
      ask.mutate(
        { text: t, page: location.pathname, focus: override === undefined ? focus : override, draft_text: thread.draftText, last_intent: thread.lastIntent },
        {
          onSuccess: (out) => {
            setThread((th) => ({ messages: [...th.messages, { id: nid(), from: "velo", out }], draftText: out.draft_text ?? null, lastIntent: out.intent }));
            if (!openRef.current) setUnread(true);
            if (out.navigate) {
              window.setTimeout(() => {
                nav(out.navigate!);
                if (!wide) setOpen(false);
              }, 350);
            }
          },
          onError: (e) => setThread((th) => ({ ...th, messages: [...th.messages, { id: nid(), from: "error", text: errorMessage(e), retry: t }] })),
        },
      );
    },
    [ask, focus, location.pathname, nav, setOpen, thread.draftText, thread.lastIntent, wide],
  );

  const value = useMemo<Velo>(
    () => ({
      ...thread,
      open,
      expanded,
      pending: ask.isPending,
      unread,
      focus,
      setOpen,
      toggle,
      setExpanded,
      send,
      reset: () => setThread(EMPTY),
      setAction: (id, a) => setThread((th) => ({ ...th, messages: th.messages.map((m) => (m.id === id && m.from === "velo" ? { ...m, action: a } : m)) })),
      setFocus,
    }),
    [thread, open, expanded, ask.isPending, unread, focus, setOpen, toggle, send, setFocus],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVelo(): Velo {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVelo needs <VeloProvider>");
  return v;
}

/**
 * A page tells Velo what it has open (a session, a request, a proposal). With `keep`, closing it keeps it
 * as Velo's context until something else is opened or the page changes: a modal drawer blocks the panel
 * while it is open, so "why is it here?" is asked right after closing it.
 */
export function useVeloFocus(f: VeloFocus | null, keep = false) {
  const v = useContext(Ctx);
  const set = v?.setFocus;
  const kind = f?.kind;
  const id = f?.id;
  useEffect(() => {
    if (!set) return;
    if (kind && id) set({ kind, id });
    else if (!keep) set(null);
    return () => {
      if (!keep) set(null);
    };
  }, [set, kind, id, keep]);
}
