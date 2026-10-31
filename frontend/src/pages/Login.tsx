import { ArrowRight, Loader2, MoonStar, SunMedium } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { errorMessage } from "@/api/client";
import { useDemoAccounts, useHealth } from "@/api/hooks";
import { BoardText } from "@/components/board/Board";
import { SplitFlap, type FlapTone } from "@/components/board/SplitFlap";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useAuth } from "@/lib/auth";
import { ROLE } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || "demo1234";

/** What the app does, as a station board. The status column is live from GET /api/health. */
function ServiceBoard() {
  const { data: health, isError } = useHealth();
  const reduce = useReducedMotion();
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
  const rows: { service: string; what: string; status: [string, FlapTone] }[] = [
    { service: "Timetable", what: "A clash-free week, checked rule by rule", status: solver },
    { service: "Midsem exams", what: "Monday to Saturday, rooms at half capacity", status: solver },
    { service: "Spectra week", what: "Venue requests decided in priority order", status: solver },
    { service: "Disruptions", what: "Fewest sessions moved, Admin approves", status: solver },
    { service: "Assistant", what: "Book a venue in English or Hinglish", status: assistant },
  ];
  return (
    <div className="overflow-hidden rounded-[14px] bg-anthracite text-on-anthracite shadow-float">
      <div className="flex items-center justify-between gap-4 border-b border-anthracite-2 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[8px] bg-signal text-[13px] font-black text-signal-ink [font-stretch:75%]">V</span>
          <div>
            <div className="text-[15px] font-bold [font-stretch:88%]">Velora</div>
            <div className="text-[12px] text-on-anthracite-2">Services today</div>
          </div>
        </div>
        <span className="label-caps text-on-anthracite-2">Status</span>
      </div>
      <div role="table" aria-label="Services">
        {rows.map((r, i) => (
          <motion.div
            role="row"
            key={r.service}
            initial={reduce ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reduce ? 0 : 0.15 + i * 0.07, duration: 0.25 }}
            className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-anthracite-2 px-5 py-3 last:border-b-0 sm:grid-cols-[150px_1fr_auto]"
          >
            <BoardText className="text-[14px]">{r.service}</BoardText>
            <span role="cell" className="hidden text-[13px] text-on-anthracite-2 sm:block">
              {r.what}
            </span>
            <span role="cell" className="text-[14px]">
              <SplitFlap value={r.status[0]} length={8} tone={r.status[1]} delay={300 + i * 140} label={r.status[0] || "checking"} />
            </span>
          </motion.div>
        ))}
      </div>
    </div>
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

  return (
    <div className="platform-bg relative min-h-dvh">
      <button
        onClick={toggle}
        className="absolute right-4 top-4 grid size-9 place-items-center rounded-[8px] text-ink-2 hover:bg-ink/[0.06] hover:text-ink"
        aria-label="Switch theme"
      >
        {theme === "dark" ? <SunMedium className="size-[18px]" /> : <MoonStar className="size-[18px]" />}
      </button>
      <div className="mx-auto grid min-h-dvh w-full max-w-[1180px] grid-cols-1 items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div className="flex flex-col gap-6">
          <div className="max-w-[34ch]">
            <h1 className="text-[34px] font-extrabold leading-[38px] tracking-[-0.02em] [font-stretch:92%] sm:text-[44px] sm:leading-[46px]">
              Every room, every period, on time.
            </h1>
            <p className="mt-3 text-[15px] leading-[23px] text-ink-2">
              Timetables, midsem exams, Spectra-week bookings and disruptions for Chilika Institute of Technology. The solver decides, and every decision comes with its reason.
            </p>
          </div>
          <ServiceBoard />
        </div>

        <section className="sheet flex flex-col gap-5 p-5 sm:p-7" aria-labelledby="login-title">
          <div>
            <h2 id="login-title" className="text-[20px] font-bold">
              Log in
            </h2>
            <p className="mt-1 text-[13.5px] text-ink-2">Pick a demo account. Each role sees its own pages.</p>
          </div>

          {notice && <p className="rounded-[8px] bg-signal-soft px-3 py-2 text-[13px]">{notice}</p>}

          <ul className="flex flex-col gap-2" aria-label="Demo accounts">
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="skeleton h-[62px]" />
              ))}
            {isError && (
              <li className="rounded-[8px] border border-stop/40 bg-stop-soft p-3 text-[13px]">
                Can't reach the API, so the demo accounts didn't load.{" "}
                <button className="font-semibold underline" onClick={() => refetch()}>
                  Try again
                </button>
              </li>
            )}
            {accounts?.map((a, i) => (
              <motion.li key={a.email} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.2 }}>
                <button
                  onClick={() => go(a.email, DEMO_PASSWORD)}
                  disabled={!!busy}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-[10px] border border-rule-strong bg-sheet p-3 text-left shadow-mount transition-[border-color,background-color] hover:border-ink hover:bg-signal-soft disabled:opacity-60",
                    busy === a.email && "border-ink bg-signal-soft",
                  )}
                >
                  <span className="grid h-10 w-[74px] shrink-0 place-items-center rounded-[7px] bg-anthracite text-[11px] font-bold uppercase tracking-[0.04em] text-on-anthracite [font-stretch:78%]">
                    {a.role === "coordinator" ? "Coord." : ROLE[a.role].split(" ")[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{a.name}</span>
                    <span className="block truncate text-[12.5px] text-ink-2">{a.description}</span>
                  </span>
                  {busy === a.email ? (
                    <Loader2 className="size-4 animate-spin text-ink-2" />
                  ) : (
                    <ArrowRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                  )}
                </button>
              </motion.li>
            ))}
          </ul>

          <details className="group rounded-[10px] border border-rule">
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
