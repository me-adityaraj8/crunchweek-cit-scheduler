import { ArrowRight, Building2, GraduationCap, Loader2, MoonStar, MoreHorizontal, ShieldCheck, SunMedium, UsersRound, X, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { useDemoAccounts, useHealth, useSignupOptions } from "@/api/hooks";
import type { SignupIn } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { LoopText } from "@/components/ui/loop-text";
import { Select } from "@/components/ui/select";
import { byRole, type AccountOption } from "@/lib/accounts";
import { useAuth } from "@/lib/auth";
import { ROLE } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || "demo1234";

type Mode = "login" | "signup";
type SignupRole = SignupIn["role"] & string;
type Tone = "clear" | "caution" | "stop" | "wait";

/** Live status for the service tiles, from GET /api/health. */
function useStatuses() {
  const { data: health, isError } = useHealth();
  const solver: [string, Tone] = isError ? ["OFFLINE", "stop"] : health ? (health.ok ? ["READY", "clear"] : ["CHECK", "stop"]) : ["…", "wait"];
  const llm = health?.llm ?? "";
  const assistant: [string, Tone] = isError
    ? ["OFFLINE", "stop"]
    : !health
      ? ["…", "wait"]
      : llm.startsWith("error")
        ? ["FALLBACK", "caution"]
        : llm.startsWith("not configured")
          ? ["KEYWORDS", "caution"]
          : ["READY", "clear"];
  return { solver, assistant };
}

const TONE: Record<Tone, string> = {
  clear: "bg-clear-vivid",
  caution: "bg-caution-soft",
  stop: "bg-stop-vivid",
  wait: "bg-sheet-2",
};

/** What the app does: four equal tiles, each with its live status in words. */
function ServiceTiles() {
  const { solver, assistant } = useStatuses();
  const tiles: [string, [string, Tone]][] = [
    ["Timetable", solver],
    ["Exams", solver],
    ["Spectra week", solver],
    ["Assistant", assistant],
  ];
  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-3" aria-label="Services">
      {tiles.map(([name, [status, tone]]) => (
        <li key={name} className="flex flex-col gap-2 rounded-[4px] border-2 border-rule-strong bg-sheet p-3 shadow-lift">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.06em]">{name}</span>
          <span className={cn("w-fit rounded-[3px] border-2 border-[#111] px-[7px] py-0.5 text-[11px] font-extrabold tracking-[0.04em] text-[#111]", TONE[tone])}>{status}</span>
        </li>
      ))}
    </ul>
  );
}

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

/** Make your own account. Club representatives and faculty sign up here; an Admin gives the roles that approve. */
function SignupForm({ onDone }: { onDone: () => void }) {
  const { signup } = useAuth();
  const [role, setRole] = useState<SignupRole>("club");
  const [facultyId, setFacultyId] = useState<string>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useSignupOptions(role === "faculty");
  const faculty = options.data?.faculty ?? [];

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (role === "faculty" && !facultyId) {
      setError("Pick which faculty member you are.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await signup({ name, email: email.trim(), password, role, faculty_id: role === "faculty" ? facultyId : null });
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
            { value: "club", label: "Club representative" },
            { value: "faculty", label: "Faculty member" },
          ]}
          className="grid w-full grid-cols-2"
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
            placeholder={options.isLoading ? "Loading the faculty list" : options.isError ? "Couldn't load the faculty list" : "Choose your name"}
            disabled={!faculty.length}
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
      <p className="text-[12.5px] text-ink-3">Coordinator and Admin accounts approve requests, so an Admin gives those roles.</p>
    </form>
  );
}

interface DemoRole {
  id: "admin" | "coordinator" | "faculty" | "club";
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
function DemoCards({ onDone }: { onDone: () => void }) {
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
        roles.admin && { id: "admin", title: "Dean's Office", chip: "ADMIN", count: "1 account", listLabel: "", description: "Generate timetables, approve changes, decide Spectra week.", icon: ShieldCheck, fill: "bg-signal", options: [{ value: roles.admin.email, label: "Dean's Office" }] },
        roles.coordinator.length > 0 && { id: "coordinator", title: "Coordinator", chip: "COORD", count: `${roles.coordinator.length} departments`, listLabel: `DEPARTMENT · ${roles.coordinator.length}`, description: "Book rooms for department events and approve your labs.", icon: Building2, fill: "bg-k-event-tint", options: roles.coordinator },
        roles.faculty.length > 0 && { id: "faculty", title: "Faculty", chip: "FACULTY", count: `${roles.faculty.length} faculty`, listLabel: `FACULTY MEMBER · ${roles.faculty.length}`, description: "Your timetable, time you can't teach, and change requests.", icon: GraduationCap, fill: "bg-k-lecture-tint", options: roles.faculty },
        roles.club.length > 0 && { id: "club", title: "Club", chip: "CLUB", count: `${roles.club.length} clubs`, listLabel: `CLUB · ${roles.club.length}`, description: "Request venues by typing or speaking, in English or Hinglish.", icon: UsersRound, fill: "bg-k-lab-tint", options: roles.club },
      ].filter(Boolean) as DemoRole[])
    : [];
  const active = cards.find((c) => c.id === open) ?? null;
  const email = active ? (pick[active.id] ?? active.options[0]?.value ?? "") : "";
  const who = active?.options.find((o) => o.value === email)?.label ?? active?.title;

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

export default function Login() {
  const { user, notice } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const [mode, setMode] = useState<Mode>("login");

  if (user) return <Navigate to={from} replace />;
  const done = () => nav(from, { replace: true });

  return (
    <div className="platform-bg relative min-h-dvh">
      <button
        onClick={toggle}
        className="press absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-[4px] border-2 border-rule-strong bg-sheet text-ink shadow-float"
        aria-label="Switch theme"
      >
        {theme === "dark" ? <SunMedium className="size-[18px]" /> : <MoonStar className="size-[18px]" />}
      </button>
      {/* intro, card, tiles: on a phone the card comes straight after the headline */}
      <div className="mx-auto grid min-h-dvh w-full max-w-[1240px] grid-cols-1 content-center gap-x-10 gap-y-7 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-7 lg:col-start-1 lg:row-start-1">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-[4px] bg-anthracite text-[24px] font-black text-signal">V</span>
            <div className="leading-tight">
              <div className="text-[20px] font-black tracking-[0.01em]">VELORA</div>
              <div className="text-[13px] font-medium text-ink-2">Chilika Institute of Technology</div>
            </div>
          </div>
          <div>
            <h1 className="text-[44px] font-black uppercase leading-[0.92] tracking-[-0.045em] sm:text-[60px] xl:text-[72px]">
              Every room.
              <br />
              Every period.
              <br />
              <span className="mt-3 inline-block -rotate-[1.5deg] border-[3px] border-rule-strong bg-signal px-3.5 pb-1.5 pt-0.5 text-signal-ink shadow-panel">
                <LoopText words={["On time.", "Clash-free.", "Explained.", "Approved."]} label="On time." className="py-[0.05em] leading-[1.02]" />
              </span>
            </h1>
            <p className="mt-6 max-w-[520px] text-[17px] leading-[1.5] text-ink-2">
              Timetables, midsem exams, Spectra-week bookings and disruptions for CIT. The solver decides, and every decision comes with its reason.
            </p>
          </div>
        </div>

        <section
          className="min-w-0 self-center overflow-hidden rounded-[6px] border-2 border-rule-strong bg-sheet shadow-hero lg:col-start-2 lg:row-span-2 lg:row-start-1"
          aria-label={mode === "login" ? "Log in" : "Create an account"}
        >
          <div className="grid grid-cols-2 border-b-2 border-rule-strong" role="group" aria-label="Log in or create an account">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "h-[60px] px-5 text-left text-[18px] font-black uppercase tracking-[-0.01em] transition-colors duration-150 focus-visible:outline-offset-[-6px] sm:px-[22px] sm:text-[22px]",
                  m === "signup" && "border-l-2 border-rule-strong",
                  mode === m ? "bg-signal text-signal-ink" : "bg-sheet-2 text-ink-3 hover:bg-signal-soft hover:text-ink",
                )}
              >
                {m === "login" ? "Log in" : "Create account"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-5 p-5 sm:p-[22px]">
            {notice && <p className="rounded-[4px] border-2 border-rule-strong bg-signal-soft px-3 py-2 text-[13px]">{notice}</p>}
            {mode === "login" ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 className="text-[15px] font-extrabold uppercase tracking-[0.06em]">Demo for judges</h2>
                  <span className="text-[13px] text-ink-3">Pick a role · password {DEMO_PASSWORD}</span>
                </div>
                <DemoCards onDone={done} />
                <details className="rounded-[4px] border-2 border-rule-strong">
                  <summary className="cursor-pointer list-none px-3.5 py-3 text-[14px] font-bold hover:bg-signal-soft">Use an email and password instead</summary>
                  <div className="border-t-2 border-rule-strong p-3.5">
                    <LoginForm onDone={done} />
                  </div>
                </details>
              </>
            ) : (
              <SignupForm onDone={done} />
            )}
          </div>
        </section>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <ServiceTiles />
        </div>
      </div>
    </div>
  );
}
