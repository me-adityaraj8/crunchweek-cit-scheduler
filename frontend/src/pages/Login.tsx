import { ArrowDown, ArrowRight, Building2, Check, Copy, GraduationCap, Loader2, MoreHorizontal, ShieldCheck, UsersRound, X, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { useDemoAccounts, useSignupOptions } from "@/api/hooks";
import type { SignupIn } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { LandingHeader, LandingSections, StatusDot, useLandingMotion, useStatuses, type DemoId } from "@/components/landing/Landing";
import { LoopText } from "@/components/ui/loop-text";
import { Select } from "@/components/ui/select";
import { byRole, type AccountOption } from "@/lib/accounts";
import { useAuth } from "@/lib/auth";
import { ROLE } from "@/lib/format";
import { cn } from "@/lib/utils";

const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || "demo1234";

type Mode = "login" | "signup";
type SignupRole = SignupIn["role"] & string;

function Problem({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-[13px] font-medium text-stop">
      {text}
    </p>
  );
}

/** Log in with your own account (or a demo account's address and the README password). */
function LoginForm({ onDone }: { onDone: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Email" htmlFor="login-email">
        <Input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password" htmlFor="login-password">
        <PasswordInput id="login-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Problem text={error} />
      <Button type="submit" variant="primary" size="lg" className="mt-1" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} Log in
      </Button>
    </form>
  );
}

/** Make your own account: a club representative, a faculty member or a department's coordinator.
 * Only Admin accounts are given out by an Admin. */
function SignupForm({ onDone }: { onDone: () => void }) {
  const { signup } = useAuth();
  const [role, setRole] = useState<SignupRole>("club");
  const [facultyId, setFacultyId] = useState<string>();
  const [department, setDepartment] = useState<string>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useSignupOptions(role !== "club");
  const faculty = options.data?.faculty ?? [];
  const departments = options.data?.departments ?? [];
  const listHint = options.isLoading ? "Loading the list" : options.isError ? "Couldn't load the list" : undefined;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (role === "faculty" && !facultyId) {
      setError("Pick which faculty member you are.");
      return;
    }
    if (role === "coordinator" && !department) {
      setError("Pick the department you coordinate.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await signup({ name, email: email.trim(), password, role, faculty_id: role === "faculty" ? facultyId : null, department: role === "coordinator" ? department : null });
      toast.success("Account created", { description: `You're logged in as ${ROLE[user.role].toLowerCase()}.` });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="I am a">
        <Segmented<SignupRole>
          aria-label="Account type"
          value={role}
          onChange={(r) => {
            setRole(r);
            setError(null);
          }}
          items={[
            { value: "club", label: "Club" },
            { value: "faculty", label: "Faculty" },
            { value: "coordinator", label: "Coordinator" },
          ]}
          className="grid w-full grid-cols-3"
        />
      </Field>
      {role === "faculty" && (
        <Field label="Which faculty member are you?" htmlFor="signup-faculty" hint="Links the account to your timetable. One account per faculty member.">
          <Select
            id="signup-faculty"
            value={facultyId}
            onValueChange={(id) => {
              setFacultyId(id);
              if (!name.trim()) setName(faculty.find((f) => f.id === id)?.name ?? "");
            }}
            options={faculty.map((f) => ({ value: f.id, label: f.name, hint: f.id, group: f.department }))}
            placeholder={listHint ?? "Choose your name"}
            disabled={!faculty.length}
          />
        </Field>
      )}
      {role === "coordinator" && (
        <Field label="Which department do you coordinate?" htmlFor="signup-department" hint="You'll book rooms for its events and approve bookings of its labs. One account per department.">
          <Select
            id="signup-department"
            value={department}
            onValueChange={setDepartment}
            options={departments.map((d) => ({ value: d, label: d }))}
            placeholder={listHint ?? "Choose a department"}
            disabled={!departments.length}
          />
        </Field>
      )}
      <Field label={role === "club" ? "Name or club name" : "Your name"} htmlFor="signup-name" hint={role === "club" ? "Shown on your venue requests." : undefined}>
        <Input id="signup-name" autoComplete={role === "club" ? "organization" : "name"} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
      </Field>
      <Field label="Email" htmlFor="signup-email">
        <Input id="signup-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password" htmlFor="signup-password" hint="At least 8 characters.">
        <PasswordInput id="signup-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      </Field>
      <Problem text={error} />
      <Button type="submit" variant="primary" size="lg" className="mt-1" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} Create account
      </Button>
      <p className="text-[12.5px] text-ink-3">Admin accounts are given by an Admin.</p>
    </form>
  );
}

interface DemoRole {
  id: DemoId;
  title: string;
  chip: string;
  count: string;
  listLabel: string;
  description: string;
  icon: LucideIcon;
  fill: string;
  options: AccountOption[];
}

/** One click into any role, no sign-up (for judges and anyone trying the app). Four small cards; the
 * one you pick grows in place to show its accounts and the log-in button (after Skiper UI's
 * "minimal card expand"). A click outside or Esc folds it back. */
function DemoCards({ onDone, request }: { onDone: () => void; request: { id: DemoId; n: number } | null }) {
  const { login } = useAuth();
  const { data: accounts, isLoading, isError, refetch } = useDemoAccounts();
  const [open, setOpen] = useState<DemoRole["id"] | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const last = useRef<DemoRole["id"] | null>(null);

  const roles = accounts ? byRole(accounts) : null;
  const cards: DemoRole[] = roles
    ? ([
        roles.admin && { id: "admin", title: "Dean's Office", chip: "ADMIN", count: "1 account", listLabel: "", description: "Generate timetables, approve changes, decide Spectra week.", icon: ShieldCheck, fill: "bg-signal on-light", options: [{ value: roles.admin.email, label: "Dean's Office" }] },
        roles.coordinator.length > 0 && { id: "coordinator", title: "Coordinator", chip: "COORD", count: `${roles.coordinator.length} departments`, listLabel: `DEPARTMENT · ${roles.coordinator.length}`, description: "Book rooms for department events and approve your labs.", icon: Building2, fill: "bg-k-event-tint", options: roles.coordinator },
        roles.faculty.length > 0 && { id: "faculty", title: "Faculty", chip: "FACULTY", count: `${roles.faculty.length} faculty`, listLabel: `FACULTY MEMBER · ${roles.faculty.length}`, description: "Your timetable, time you can't teach, and change requests.", icon: GraduationCap, fill: "bg-k-lecture-tint", options: roles.faculty },
        roles.club.length > 0 && { id: "club", title: "Club", chip: "CLUB", count: `${roles.club.length} clubs`, listLabel: `CLUB · ${roles.club.length}`, description: "Request venues by typing or speaking, in English or Hinglish.", icon: UsersRound, fill: "bg-k-lab-tint", options: roles.club },
      ].filter(Boolean) as DemoRole[])
    : [];
  const active = cards.find((c) => c.id === open) ?? null;
  const email = active ? (pick[active.id] ?? active.options[0]?.value ?? "") : "";
  const who = active?.options.find((o) => o.value === email)?.label ?? active?.title;

  // "Try as …" further down the page opens that role's card
  useEffect(() => {
    if (!request) return;
    last.current = request.id;
    setOpen(request.id);
    setError(null);
  }, [request]);

  // fold back on Esc or a click outside (the account list opens in a portal, so it counts as inside)
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Element;
      if (panel.current?.contains(t) || t.closest?.("[data-radix-popper-content-wrapper]")) return;
      setOpen(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-radix-popper-content-wrapper]")) setOpen(null);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // focus moves into the open card, and back to the card you opened when it folds
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    else if (last.current) document.querySelector<HTMLElement>(`[data-demo="${last.current}"]`)?.focus();
  }, [open]);

  async function go() {
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      await login(email, DEMO_PASSWORD);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (isError)
    return (
      <p className="rounded-[4px] border-2 border-rule-strong bg-stop-input p-3 text-[13px]">
        Can&apos;t reach the API, so the demo accounts didn&apos;t load.{" "}
        <button className="font-semibold underline" onClick={() => refetch()}>
          Try again
        </button>
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative grid min-h-[264px] grid-cols-2 gap-3" aria-label="Demo accounts">
        {isLoading && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[126px] rounded-[4px]" />)}
        {cards.map((c) =>
          c.id === open ? (
            <div key={c.id} className="h-[126px]" aria-hidden />
          ) : (
            <motion.button
              key={c.id}
              layoutId={`demo-${c.id}`}
              data-demo={c.id}
              onClick={() => {
                last.current = c.id;
                setOpen(c.id);
                setError(null);
              }}
              aria-expanded={false}
              aria-label={`${c.title} demo, ${c.count}`}
              className={cn("press flex h-[126px] flex-col justify-between rounded-[6px] border-2 border-rule-strong p-3.5 text-left text-ink shadow-float", c.fill)}
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
            >
              <span className="flex w-full items-start justify-between">
                <motion.span layoutId={`demo-icon-${c.id}`}>
                  <c.icon className="size-6" strokeWidth={2.2} />
                </motion.span>
                <span className="grid size-7 place-items-center rounded-full border-2 border-rule-strong bg-sheet/70">
                  <MoreHorizontal className="size-4" />
                </span>
              </span>
              <span>
                <motion.span layoutId={`demo-title-${c.id}`} className="block text-[17px] font-extrabold leading-tight">
                  {c.title}
                </motion.span>
                <span className="block text-[12.5px] font-semibold text-ink-2">{c.count}</span>
              </span>
            </motion.button>
          ),
        )}
        <AnimatePresence>
          {active && (
            <motion.div
              ref={panel}
              key={active.id}
              layoutId={`demo-${active.id}`}
              role="dialog"
              aria-label={`${active.title} demo accounts`}
              className={cn("absolute inset-0 z-10 flex flex-col gap-3 overflow-hidden rounded-[6px] border-2 border-rule-strong p-4 text-ink shadow-panel", active.fill)}
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <motion.span layoutId={`demo-icon-${active.id}`}>
                    <active.icon className="size-7" strokeWidth={2.2} />
                  </motion.span>
                  <motion.span layoutId={`demo-title-${active.id}`} className="text-[20px] font-extrabold leading-tight">
                    {active.title}
                  </motion.span>
                  <span className="rounded-[3px] bg-[#111] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-white">{active.chip}</span>
                </div>
                <button onClick={() => setOpen(null)} className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-rule-strong bg-sheet/70 hover:bg-sheet" aria-label="Close">
                  <X className="size-4" />
                </button>
              </div>
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.08 }} className="flex min-h-0 flex-1 flex-col gap-3">
                <p className="text-[14px] leading-[1.4] text-ink-2">{active.description}</p>
                {active.options.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-extrabold tracking-[0.06em]">{active.listLabel}</span>
                    <Select
                      aria-label={`Choose a ${active.title.toLowerCase()} account`}
                      value={email}
                      onValueChange={(v) => setPick((p) => ({ ...p, [active.id]: v }))}
                      options={active.options}
                    />
                  </div>
                )}
                <button
                  data-autofocus
                  onClick={go}
                  disabled={busy || !email}
                  className="press mt-auto flex min-h-14 w-full items-center justify-between gap-3 rounded-[4px] border-2 border-rule-strong bg-[#111] px-5 text-left text-[16px] font-extrabold text-white shadow-float disabled:opacity-60"
                >
                  <span className="truncate">Log in as {who}</span>
                  {busy ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <ArrowRight className="size-5 shrink-0" />}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Problem text={error} />
    </div>
  );
}

/** The demo password with a one-click copy: the icon turns into a tick for a moment. */
function CopyPassword() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(DEMO_PASSWORD).then(() => setCopied(true), () => {})}
      className="inline-flex items-center gap-1.5 rounded-[3px] border-2 border-rule px-1.5 py-0.5 font-mono text-[12px] font-semibold text-ink-2 transition-colors hover:border-rule-strong hover:text-ink"
      aria-label={`Copy the demo password, ${DEMO_PASSWORD}`}
    >
      {DEMO_PASSWORD}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={copied ? "y" : "n"} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} className="grid">
          {copied ? <Check className="size-3.5 text-clear" /> : <Copy className="size-3.5" />}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

/** Headline figures, straight from the loaded dataset's demo accounts. */
function Figures() {
  const { data } = useDemoAccounts();
  const roles = data ? byRole(data) : null;
  const figs: [string, number | undefined][] = [
    ["faculty", roles?.faculty.length],
    ["departments", roles?.coordinator.length],
    ["clubs", roles?.club.length],
  ];
  return (
    <dl className="grid max-w-[460px] grid-cols-3 divide-x-2 divide-rule border-y-2 border-rule py-3">
      {figs.map(([label, n]) => (
        <div key={label} className="px-4 first:pl-0">
          <dt className="eyebrow">{label}</dt>
          <dd className="mt-1 text-[28px] font-black leading-none tracking-[-0.03em] tabular-nums">{n ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function Login() {
  const { user, notice } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const [mode, setMode] = useState<Mode>("login");
  const [request, setRequest] = useState<{ id: DemoId; n: number } | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const { solver } = useStatuses();
  useLandingMotion(page);

  if (user) return <Navigate to={from} replace />;
  const done = () => {
    window.scrollTo(0, 0);
    nav(from, { replace: true });
  };
  const toCard = () => {
    const card = document.getElementById("login");
    card?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    card?.focus({ preventScroll: true });
  };
  const tryRole = (id: DemoId) => {
    setMode("login");
    setRequest({ id, n: Date.now() });
    toCard();
  };

  return (
    <div ref={page} className="lx-page min-h-dvh bg-platform text-ink">
      <a href="#login" className="sr-only z-50 bg-sheet p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to log in
      </a>
      <LandingHeader onLogin={toCard} />

      <main id="top">
        <section className="lx-hero relative overflow-hidden" aria-labelledby="hero-title">
          <div aria-hidden className="lx-grid absolute inset-0 -z-10" />
          <div aria-hidden className="lx-glow absolute -right-40 -top-40 -z-10 size-[680px] rounded-full" />
          <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14 lg:pb-28 lg:pt-16">
            <div className="flex min-w-0 flex-col gap-7">
              <span data-hero className="inline-flex w-fit items-center gap-3 rounded-full border-2 border-rule-strong bg-sheet px-3.5 py-1.5">
                <StatusDot tone={solver[1]} label={`Solver ${solver[0]}`} />
                <span className="h-3.5 w-0.5 bg-rule" />
                <span className="text-[12.5px] font-semibold text-ink-2">Spectra week &apos;27 · CIT</span>
              </span>
              <h1 id="hero-title" data-hero className="lx-h text-[42px] font-black uppercase leading-[0.94] tracking-[-0.045em] sm:text-[62px] xl:text-[74px]">
                Campus time,
                <br />
                solved and
                <br />
                <span className="lx-plate mt-2">
                  <LoopText words={["explained.", "clash-free.", "on time.", "approved."]} label="explained." />
                </span>
              </h1>
              <p data-hero className="max-w-[540px] text-[17px] leading-relaxed text-ink-2">
                Timetables, midsem exams, Spectra-week bookings and disruptions for CIT. The solver decides, and every decision comes with its reason.
              </p>
              <div data-hero className="flex flex-wrap items-center gap-3">
                <span data-magnetic className="inline-block">
                  <Button variant="primary" size="xl" onClick={toCard} className="group">
                    Try a demo role <ArrowRight className="transition-transform duration-200 group-hover:translate-x-1" />
                  </Button>
                </span>
                <Button variant="outline" size="xl" asChild className="group">
                  <a href="#product">
                    See how it works <ArrowDown className="transition-transform duration-200 group-hover:translate-y-0.5" />
                  </a>
                </Button>
              </div>
              <div data-hero>
                <Figures />
              </div>
            </div>

            <section
              id="login"
              tabIndex={-1}
              data-hero-card
              className="lx-card min-w-0 scroll-mt-24 overflow-hidden rounded-[6px] border-2 border-rule-strong bg-sheet shadow-hero focus:outline-none"
              aria-label={mode === "login" ? "Log in" : "Create an account"}
            >
              <div className="grid grid-cols-2 border-b-2 border-rule-strong bg-sheet-2" role="group" aria-label="Log in or create an account">
                {(["login", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "lx-tab relative isolate h-[58px] px-4 text-left text-[15px] sm:px-5 font-black uppercase tracking-[-0.01em] transition-colors duration-200 focus-visible:outline-offset-[-6px] sm:text-[20px]",
                      m === "signup" && "border-l-2 border-rule-strong",
                      mode === m ? "text-signal-ink" : "text-ink-3",
                    )}
                  >
                    {mode === m && <motion.span layoutId="auth-tab" className="absolute inset-0 -z-[1] bg-signal" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                    {m === "login" ? "Log in" : "Create account"}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-5 p-5 sm:p-[22px]">
                {notice && <p className="rounded-[4px] border-2 border-rule-strong bg-signal-soft px-3 py-2 text-[13px]">{notice}</p>}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="flex flex-col gap-5"
                  >
                    {mode === "login" ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                          <h2 className="text-[14px] font-extrabold uppercase tracking-[0.06em] text-ink">Demo for judges</h2>
                          <span className="flex items-center gap-2 text-[13px] text-ink-3">
                            Pick a role · password <CopyPassword />
                          </span>
                        </div>
                        <DemoCards onDone={done} request={request} />
                        <details className="group rounded-[4px] border-2 border-rule-strong text-ink">
                          <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-3 text-[14px] font-bold text-ink transition-colors hover:bg-signal-soft">
                            Use an email and password instead
                            <ArrowDown className="size-4 transition-transform duration-200 group-open:rotate-180" />
                          </summary>
                          <div className="border-t-2 border-rule-strong p-3.5">
                            <LoginForm onDone={done} />
                          </div>
                        </details>
                      </>
                    ) : (
                      <SignupForm onDone={done} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </section>
          </div>
        </section>

        <LandingSections onTry={tryRole} />
      </main>
    </div>
  );
}

