import { ArrowRight, Loader2, Mic, MoonStar, SunMedium } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { useDemoAccounts, useHealth, useSignupOptions } from "@/api/hooks";
import type { SignupIn } from "@/api/types";
import { SplitFlap, type FlapTone } from "@/components/board/SplitFlap";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { byRole, type AccountOption } from "@/lib/accounts";
import { useAuth } from "@/lib/auth";
import { ROLE } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || "demo1234";

type Mode = "login" | "signup";
type SignupRole = SignupIn["role"] & string;

/** Live status for the service tiles, from GET /api/health. */
function useStatuses() {
  const { data: health, isError } = useHealth();
  const solver: [string, FlapTone] = isError ? ["OFFLINE", "stop"] : health ? (health.ok ? ["READY", "clear"] : ["CHECK", "stop"]) : ["", "wait"];
  const llm = health?.llm ?? "";
  const assistant: [string, FlapTone] = isError
    ? ["OFFLINE", "stop"]
    : !health
      ? ["", "wait"]
      : llm.startsWith("error")
        ? ["FALLBACK", "caution"]
        : llm.startsWith("not configured")
          ? ["KEYWORDS", "caution"]
          : ["READY", "clear"];
  return { solver, assistant };
}

/** One dark board tile in the bento grid: a service, what it does, and its live status. */
function ServiceTile({ name, what, status, delay, className, children }: { name: string; what: string; status: [string, FlapTone]; delay: number; className?: string; children?: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : delay / 1000, duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className={cn("flex flex-col justify-between gap-4 rounded-[6px] border-2 border-rule-strong p-4 text-ink shadow-mount", className)}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-black uppercase tracking-[0.06em] [font-stretch:110%]">{name}</span>
        <span className="text-[13px] leading-[18px] text-ink-2">{what}</span>
        {children}
      </div>
      <span className="w-fit rounded-[3px] border-2 border-rule-strong bg-anthracite px-1 py-0.5 text-[13px]">
        <SplitFlap value={status[0]} length={8} tone={status[1]} delay={delay} label={status[0] || "checking"} />
      </span>
    </motion.div>
  );
}

// a little week: 4 periods x 5 days; 1 = lecture, 2 = lab
const WEEK = [1, 0, 1, 2, 0, 0, 1, 1, 2, 1, 1, 2, 0, 0, 1, 0, 2, 1, 1, 0];

/** What the app does, as a bento grid of station-board tiles. */
function ServiceBento() {
  const { solver, assistant } = useStatuses();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Services">
      <ServiceTile name="Timetable" what="A clash-free week for 189 sessions, checked rule by rule against the official validator." status={solver} delay={250} className="col-span-2 bg-sheet sm:row-span-2">
        <span className="mt-3 grid grid-cols-5 gap-1" aria-hidden="true">
          {["M", "T", "W", "T", "F"].map((d, i) => (
            <span key={i} className="pb-0.5 text-center text-[10.5px] font-bold text-ink-2">
              {d}
            </span>
          ))}
          {WEEK.map((cell, i) => (
            <span key={i} className={cn("h-4 rounded-[3px] border-2 border-rule-strong", cell === 0 && "border-dashed opacity-30", cell === 1 && "bg-k-lecture-tint", cell === 2 && "bg-k-lab-tint")} />
          ))}
        </span>
      </ServiceTile>
      <ServiceTile name="Midsem exams" what="Monday to Saturday, rooms at half capacity" status={solver} delay={380} className="col-span-2 bg-k-exam-tint" />
      <ServiceTile name="Spectra week" what="Venue requests decided in priority order" status={solver} delay={510} className="bg-k-event-tint" />
      <ServiceTile name="Disruptions" what="Fewest sessions moved, Admin approves" status={solver} delay={640} className="bg-k-tutorial-tint" />
      <ServiceTile name="Assistant" what="Book a venue by typing or speaking, in English or Hinglish." status={assistant} delay={770} className="col-span-2 bg-k-lab-tint sm:col-span-4">
        <span className="mt-2 inline-flex w-fit items-center gap-2 rounded-[3px] border-2 border-rule-strong bg-sheet px-3 py-1.5 text-[12.5px] font-medium text-ink">
          <Mic className="size-3.5" aria-hidden="true" />
          “seminar hall kal shaam 6 baje, 100 log, mic chahiye”
        </span>
      </ServiceTile>
    </div>
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

/** One role in the demo bento: a single account (Admin) or a dropdown of accounts. */
function RoleTile({ chip, title, description, options, busy, onGo, delay }: { chip: string; title: string; description: string; options: AccountOption[]; busy: string | null; onGo: (email: string) => void; delay: number }) {
  const reduce = useReducedMotion();
  const [email, setEmail] = useState(options[0]?.value ?? "");
  useEffect(() => {
    if (!options.some((o) => o.value === email)) setEmail(options[0]?.value ?? "");
  }, [options, email]);
  const single = options.length === 1;
  const pending = busy !== null && busy === email;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : delay, duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-col gap-3 rounded-[4px] border-2 border-rule-strong bg-sheet p-4 shadow-mount"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[16px] font-black leading-5">{title}</h3>
          <p className="mt-0.5 text-[12.5px] leading-[17px] text-ink-2">{description}</p>
        </div>
        <span className="shrink-0 rounded-[3px] bg-ink px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-sheet">{chip}</span>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        {!single && <Select aria-label={`Choose a ${title.toLowerCase()} account`} value={email} onValueChange={setEmail} options={options} />}
        <Button
          variant="outline"
          onClick={() => onGo(email)}
          disabled={!email || busy !== null}
          aria-label={`Log in as ${options.find((o) => o.value === email)?.label ?? title}`}
          className="w-full justify-between hover:bg-signal"
        >
          {single ? `Log in as ${options[0].label}` : "Log in"}
          {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        </Button>
      </div>
    </motion.div>
  );
}

/** One click into any role, no sign-up: for judges and anyone trying the app. */
function DemoTiles({ onDone }: { onDone: () => void }) {
  const { login } = useAuth();
  const { data: accounts, isLoading, isError, refetch } = useDemoAccounts();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(email: string) {
    setBusy(email);
    setError(null);
    try {
      await login(email, DEMO_PASSWORD);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  const roles = accounts ? byRole(accounts) : null;
  const tiles = roles
    ? [
        roles.admin && { chip: "Admin", title: "Dean's Office", description: "Generate timetables, approve changes, decide Spectra week", options: [{ value: roles.admin.email, label: "Dean's Office" }] },
        roles.coordinator.length > 0 && { chip: "Coord.", title: "Coordinator", description: "Book rooms for department events, approve your labs", options: roles.coordinator },
        roles.faculty.length > 0 && { chip: "Faculty", title: "Faculty", description: "Your timetable, leave, and change requests", options: roles.faculty },
        roles.club.length > 0 && { chip: "Club", title: "Club", description: "Request venues in plain English or Hinglish", options: roles.club },
      ].filter((t): t is { chip: string; title: string; description: string; options: AccountOption[] } => !!t)
    : [];

  return (
    <section className="flex flex-col gap-3" aria-labelledby="demo-title">
      <div>
        <h2 id="demo-title" className="text-[17px] font-black uppercase [font-stretch:110%]">
          Demo for judges
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-2">One click, no sign-up. Pick a role and an account; each role sees its own pages.</p>
      </div>
      {isError ? (
        <p className="rounded-[4px] border-2 border-rule-strong bg-stop-soft p-3 text-[13px]">
          Can't reach the API, so the demo accounts didn't load.{" "}
          <button className="font-semibold underline" onClick={() => refetch()}>
            Try again
          </button>
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Demo accounts">
          {isLoading && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[168px] rounded-[4px]" />)}
          {tiles.map((t, i) => (
            <RoleTile key={t.title} {...t} busy={busy} onGo={go} delay={0.05 * i} />
          ))}
        </div>
      )}
      <Problem text={error} />
    </section>
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
        className="press absolute right-4 top-4 grid size-10 place-items-center rounded-[4px] border-2 border-rule-strong bg-sheet text-ink shadow-mount"
        aria-label="Switch theme"
      >
        {theme === "dark" ? <SunMedium className="size-[18px]" /> : <MoonStar className="size-[18px]" />}
      </button>
      <div className="mx-auto grid min-h-dvh w-full max-w-[1240px] grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex min-w-0 flex-col gap-7">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-[4px] border-2 border-rule-strong bg-anthracite text-[24px] font-black text-signal [font-stretch:110%]">V</span>
            <div className="leading-tight">
              <div className="text-[20px] font-black tracking-[0.02em] [font-stretch:118%]">VELORA</div>
              <div className="text-[13px] font-medium text-ink-2">Chilika Institute of Technology</div>
            </div>
          </div>
          <div>
            <h1 className="text-[42px] font-black uppercase leading-[0.92] tracking-[-0.035em] [font-stretch:112%] sm:text-[60px] xl:text-[68px]">
              Every room.
              <br />
              Every period.
              <br />
              <span className="mt-2 inline-block -rotate-[1.5deg] rounded-[3px] border-[3px] border-rule-strong bg-signal px-3.5 pb-1.5 pt-0.5 text-signal-ink shadow-[6px_6px_0_var(--shade)]">On time.</span>
            </h1>
            <p className="mt-6 max-w-[52ch] text-[16px] leading-[24px] text-ink-2 sm:text-[17px] sm:leading-[26px]">
              Timetables, midsem exams, Spectra-week bookings and disruptions. The solver decides, and every decision comes with its reason.
            </p>
          </div>
          <ServiceBento />
        </div>

        <section className="sheet flex min-w-0 flex-col overflow-hidden shadow-[8px_8px_0_var(--shade)]" aria-label={mode === "login" ? "Log in" : "Create an account"}>
          <div className="grid grid-cols-2 border-b-2 border-rule-strong" role="group" aria-label="Log in or create an account">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "h-14 px-5 text-left text-[16px] font-black uppercase transition-colors duration-150 ease-out [font-stretch:110%] focus-visible:outline-offset-[-6px] sm:px-6 sm:text-[18px]",
                  m === "signup" && "border-l-2 border-rule-strong",
                  mode === m ? "bg-signal text-signal-ink" : "bg-sheet-2 text-ink-3 hover:bg-signal-soft hover:text-ink",
                )}
              >
                {m === "login" ? "Log in" : "Create account"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-5 p-5 sm:p-6">
            {notice && <p className="rounded-[4px] border-2 border-rule-strong bg-signal-soft px-3 py-2 text-[13px]">{notice}</p>}

            {mode === "login" ? <LoginForm onDone={done} /> : <SignupForm onDone={done} />}

            <div className="flex items-center gap-3 text-[12px] font-black uppercase tracking-[0.08em]" aria-hidden>
              <span className="h-[2px] flex-1 bg-rule-strong" />
              or
              <span className="h-[2px] flex-1 bg-rule-strong" />
            </div>

            <DemoTiles onDone={done} />
          </div>
        </section>
      </div>
    </div>
  );
}
