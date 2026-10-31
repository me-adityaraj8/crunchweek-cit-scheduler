import { ArrowRight, Loader2, Mic, MoonStar, SunMedium } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { errorMessage } from "@/api/client";
import { useDemoAccounts, useHealth } from "@/api/hooks";
import { SplitFlap, type FlapTone } from "@/components/board/SplitFlap";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { byRole, type AccountOption } from "@/lib/accounts";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || "demo1234";

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
      transition={{ delay: reduce ? 0 : delay / 1000, duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn("flex flex-col justify-between gap-4 rounded-[16px] bg-anthracite p-4 text-on-anthracite shadow-float", className)}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold uppercase tracking-[0.04em] [font-stretch:80%]">{name}</span>
        <span className="text-[13px] leading-[18px] text-on-anthracite-2">{what}</span>
        {children}
      </div>
      <span className="text-[13px]">
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
      <ServiceTile name="Timetable" what="A clash-free week for 189 sessions, checked rule by rule against the official validator." status={solver} delay={250} className="col-span-2 sm:row-span-2">
        <span className="mt-3 grid grid-cols-5 gap-1" aria-hidden="true">
          {["M", "T", "W", "T", "F"].map((d, i) => (
            <span key={i} className="pb-0.5 text-center text-[10.5px] font-semibold text-on-anthracite-2">
              {d}
            </span>
          ))}
          {WEEK.map((cell, i) => (
            <span key={i} className={cn("h-4 rounded-[4px] border border-anthracite-3", cell === 1 && "border-transparent bg-signal/90", cell === 2 && "border-transparent bg-anthracite-3")} />
          ))}
        </span>
      </ServiceTile>
      <ServiceTile name="Midsem exams" what="Monday to Saturday, rooms at half capacity" status={solver} delay={380} className="col-span-2" />
      <ServiceTile name="Spectra week" what="Venue requests decided in priority order" status={solver} delay={510} />
      <ServiceTile name="Disruptions" what="Fewest sessions moved, Admin approves" status={solver} delay={640} />
      <ServiceTile name="Assistant" what="Book a venue by typing or speaking, in English or Hinglish." status={assistant} delay={770} className="col-span-2 sm:col-span-4">
        <span className="mt-2 inline-flex w-fit items-center gap-2 rounded-full border border-anthracite-3 bg-anthracite-2 px-3 py-1.5 text-[12.5px] text-on-anthracite">
          <Mic className="size-3.5 text-signal" aria-hidden="true" />
          “seminar hall kal shaam 6 baje, 100 log, mic chahiye”
        </span>
      </ServiceTile>
    </div>
  );
}

/** One role in the login bento: a single account (Admin) or a dropdown of accounts. */
function RoleTile({ chip, title, description, options, busy, onGo, delay }: { chip: string; title: string; description: string; options: AccountOption[]; busy: string | null; onGo: (email: string) => void; delay: number }) {
  const [email, setEmail] = useState(options[0]?.value ?? "");
  useEffect(() => {
    if (!options.some((o) => o.value === email)) setEmail(options[0]?.value ?? "");
  }, [options, email]);
  const single = options.length === 1;
  const pending = busy !== null && busy === email;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.2 }}
      className="flex flex-col gap-3 rounded-[14px] border border-rule-strong bg-sheet p-4 shadow-mount"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-5">{title}</h3>
          <p className="mt-0.5 text-[12.5px] leading-[17px] text-ink-2">{description}</p>
        </div>
        <span className="shrink-0 rounded-[6px] bg-anthracite px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-on-anthracite [font-stretch:78%]">{chip}</span>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        {!single && <Select aria-label={`Choose a ${title.toLowerCase()} account`} value={email} onValueChange={setEmail} options={options} />}
        <Button
          variant="primary"
          onClick={() => onGo(email)}
          disabled={!email || busy !== null}
          aria-label={`Log in as ${options.find((o) => o.value === email)?.label ?? title}`}
          className="w-full justify-between"
        >
          {single ? `Log in as ${options[0].label}` : "Log in"}
          {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        </Button>
      </div>
    </motion.div>
  );
}

export default function Login() {
  const { user, login, notice } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const { data: accounts, isLoading, isError, refetch } = useDemoAccounts();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (user) return <Navigate to={from} replace />;

  async function go(e: string, p: string) {
    setBusy(e);
    setError(null);
    try {
      await login(e, p);
      nav(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (email && password) go(email.trim(), password);
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
    <div className="platform-bg relative min-h-dvh">
      <button
        onClick={toggle}
        className="absolute right-4 top-4 grid size-9 place-items-center rounded-[8px] text-ink-2 hover:bg-ink/[0.06] hover:text-ink"
        aria-label="Switch theme"
      >
        {theme === "dark" ? <SunMedium className="size-[18px]" /> : <MoonStar className="size-[18px]" />}
      </button>
      <div className="mx-auto grid min-h-dvh w-full max-w-[1240px] grid-cols-1 items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-[10px] bg-signal text-[15px] font-black text-signal-ink shadow-[inset_0_-2px_0_oklch(0_0_0/0.14)] [font-stretch:75%]">V</span>
              <div className="leading-tight">
                <div className="text-[16px] font-bold [font-stretch:88%]">Velora</div>
                <div className="text-[12.5px] text-ink-2">Chilika Institute of Technology</div>
              </div>
            </div>
            <div className="max-w-[36ch]">
              <h1 className="text-[34px] font-extrabold leading-[38px] tracking-[-0.02em] [font-stretch:92%] sm:text-[44px] sm:leading-[46px]">Every room, every period, on time.</h1>
              <p className="mt-3 text-[15px] leading-[23px] text-ink-2">
                Timetables, midsem exams, Spectra-week bookings and disruptions. The solver decides, and every decision comes with its reason.
              </p>
            </div>
          </div>
          <ServiceBento />
        </div>

        <section className="sheet flex flex-col gap-5 rounded-[18px] p-5 sm:p-6" aria-labelledby="login-title">
          <div>
            <h2 id="login-title" className="text-[20px] font-bold">
              Log in
            </h2>
            <p className="mt-1 text-[13.5px] text-ink-2">Pick a role and an account. Each role sees its own pages.</p>
          </div>

          {notice && <p className="rounded-[8px] bg-signal-soft px-3 py-2 text-[13px]">{notice}</p>}

          {isError ? (
            <p className="rounded-[10px] border border-stop/40 bg-stop-soft p-3 text-[13px]">
              Can't reach the API, so the demo accounts didn't load.{" "}
              <button className="font-semibold underline" onClick={() => refetch()}>
                Try again
              </button>
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Demo accounts">
              {isLoading && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[168px] rounded-[14px]" />)}
              {tiles.map((t, i) => (
                <RoleTile key={t.title} {...t} busy={busy} onGo={(e) => go(e, DEMO_PASSWORD)} delay={0.05 * i} />
              ))}
            </div>
          )}

          <details className="group rounded-[12px] border border-rule">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-semibold text-ink-2 hover:text-ink">Use an email and password instead</summary>
            <form onSubmit={submit} className="flex flex-col gap-3 border-t border-rule p-3">
              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Field label="Password" htmlFor="password" hint="Demo accounts use the password in the README.">
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              <Button type="submit" variant="primary" disabled={!!busy}>
                Log in
              </Button>
            </form>
          </details>

          {error && (
            <p role="alert" className="text-[13px] font-medium text-stop">
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
