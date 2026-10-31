import { LogOut, Menu as MenuIcon, MoonStar, Search, SunMedium } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useDashboard } from "@/api/hooks";
import { SplitFlap } from "@/components/board/SplitFlap";
import { Drawer } from "@/components/ui/dialog";
import { Tip } from "@/components/ui/overlay";
import { useAuth, useUser } from "@/lib/auth";
import { ROLE } from "@/lib/format";
import { LINES, PHONE, type Stop } from "@/lib/roles";
import { useMediaQuery } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";
import { clock } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CommandPalette, usePaletteHotkey } from "./CommandPalette";

function useApprovalsCount() {
  const user = useUser();
  const { data } = useDashboard();
  if (user.role !== "admin" && user.role !== "coordinator") return 0;
  return data?.pending.length ?? 0;
}

function isActive(stop: Stop, pathname: string) {
  return stop.to === "/" ? pathname === "/" : pathname === stop.to || pathname.startsWith(stop.to + "/");
}

/** The brand: a yellow wayfinding plate. */
function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-[9px] bg-signal text-signal-ink shadow-[inset_0_-2px_0_oklch(0_0_0/0.14)]">
        <span className="text-[15px] font-black tracking-[-0.02em] [font-stretch:75%]">CIT</span>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[14.5px] font-bold text-on-anthracite [font-stretch:88%]">Campus Scheduler</div>
          <div className="text-[12px] text-on-anthracite-2">Chilika Institute of Technology</div>
        </div>
      )}
    </div>
  );
}

/** Navigation drawn as a route line: one stop per page, yours marked in yellow. */
function RouteLine({ compact, onNavigate, scope = "rail" }: { compact?: boolean; onNavigate?: () => void; scope?: string }) {
  const user = useUser();
  const { pathname } = useLocation();
  const approvals = useApprovalsCount();
  const reduce = useReducedMotion();
  const stops = LINES[user.role];
  return (
    <nav aria-label="Main" className="relative">
      <span aria-hidden className={cn("absolute bottom-5 top-5 w-[2px] rounded-full bg-anthracite-3", compact ? "left-[27px]" : "left-[21px]")} />
      <ul className="relative flex flex-col gap-0.5">
        {stops.map((s) => {
          const active = isActive(s, pathname);
          const count = s.badge === "approvals" ? approvals : 0;
          const link = (
            <NavLink
              to={s.to}
              end={s.to === "/"}
              onClick={onNavigate}
              className={cn(
                "group relative flex h-10 items-center gap-3 rounded-[8px] pr-2 text-[13.5px] transition-colors",
                compact ? "justify-center pl-0" : "pl-[10px]",
                active ? "font-bold text-on-anthracite" : "font-medium text-on-anthracite-2 hover:bg-anthracite-2 hover:text-on-anthracite",
              )}
            >
              <span className={cn("relative grid size-6 shrink-0 place-items-center", compact && "size-8")}>
                {active && (
                  <motion.span
                    layoutId={`route-here-${scope}`}
                    className="absolute inset-0 rounded-full bg-signal shadow-[0_0_0_3px_var(--anthracite)]"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
                  />
                )}
                {!active && <span className="size-2.5 rounded-full border-2 border-on-anthracite-2 bg-anthracite group-hover:border-on-anthracite" />}
                {active && <s.icon className="relative z-10 size-3.5 text-signal-ink" strokeWidth={2.4} />}
              </span>
              {!compact && <span className="flex-1 truncate">{s.label}</span>}
              {count > 0 && (
                <span
                  className={cn(
                    "grid h-5 min-w-5 place-items-center rounded-full bg-signal px-1.5 text-[11px] font-bold text-signal-ink",
                    compact && "absolute right-1 top-0.5 h-4 min-w-4 px-1 text-[10px]",
                  )}
                >
                  {count}
                </span>
              )}
            </NavLink>
          );
          return <li key={s.to + s.label}>{compact ? <Tip label={s.label} side="right">{link}</Tip> : link}</li>;
        })}
      </ul>
    </nav>
  );
}

function UserPlate({ compact }: { compact?: boolean }) {
  const user = useUser();
  const { logout } = useAuth();
  return (
    <div className={cn("flex items-center gap-3 rounded-[10px] bg-anthracite-2 p-2.5", compact && "flex-col p-2")}>
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-anthracite-3 text-[12px] font-bold text-on-anthracite">
        {user.name.replace(/^(Dr\.|Prof\.)\s+/, "").slice(0, 1)}
      </div>
      {!compact && (
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-semibold text-on-anthracite">{user.name}</div>
          <div className="truncate text-[11.5px] text-on-anthracite-2">
            {ROLE[user.role]}
            {user.department ? `, ${user.department}` : ""}
            {user.faculty_id ? `, ${user.faculty_id}` : ""}
          </div>
        </div>
      )}
      <Tip label="Log out" side={compact ? "right" : "top"}>
        <button onClick={() => logout()} className="grid size-8 place-items-center rounded-[7px] text-on-anthracite-2 hover:bg-anthracite-3 hover:text-on-anthracite" aria-label="Log out">
          <LogOut className="size-4" />
        </button>
      </Tip>
    </div>
  );
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function TopBar({ onSearch, onMenu }: { onSearch: () => void; onMenu: () => void }) {
  const { theme, toggle } = useTheme();
  const user = useUser();
  const { pathname } = useLocation();
  const stop = LINES[user.role].find((s) => isActive(s, pathname));
  const now = useNow(5000);
  return (
    <div className="sticky top-0 z-30 border-b border-rule bg-platform/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
        <button onClick={onMenu} className="grid size-9 place-items-center rounded-[8px] text-ink-2 hover:bg-ink/[0.06] md:hidden" aria-label="Open menu">
          <MenuIcon className="size-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2 text-[13.5px] md:hidden">
          <span className="grid size-7 place-items-center rounded-[6px] bg-signal text-[11px] font-black text-signal-ink [font-stretch:75%]">CIT</span>
          <span className="truncate font-semibold">{stop?.label}</span>
        </div>
        <button
          onClick={onSearch}
          className="ml-auto flex h-9 items-center gap-2.5 rounded-[8px] border border-rule-strong bg-sheet px-3 text-[13px] text-ink-3 shadow-mount transition-colors hover:text-ink md:ml-0 md:w-[min(420px,40vw)]"
        >
          <Search className="size-4" />
          <span className="hidden md:inline">Where to? Pages, groups, faculty, rooms</span>
          <kbd className="ml-auto hidden rounded-[4px] border border-rule px-1.5 text-[11px] md:inline">Ctrl K</kbd>
        </button>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <div className="flex items-center gap-2 rounded-[8px] bg-anthracite px-2 py-1.5" title="Local time">
            <SplitFlap value={clock(now)} className="text-[15px]" label={`Time ${clock(now)}`} stagger={30} />
          </div>
        </div>
        <Tip label={theme === "dark" ? "Light theme" : "Dark theme"}>
          <button onClick={toggle} className="grid size-9 place-items-center rounded-[8px] text-ink-2 hover:bg-ink/[0.06] hover:text-ink" aria-label="Switch theme">
            {theme === "dark" ? <SunMedium className="size-[18px]" /> : <MoonStar className="size-[18px]" />}
          </button>
        </Tip>
      </div>
    </div>
  );
}

function PhoneBar({ onMore }: { onMore: () => void }) {
  const user = useUser();
  const { pathname } = useLocation();
  const approvals = useApprovalsCount();
  const stops = PHONE[user.role].map((to) => LINES[user.role].find((s) => s.to === to)!).filter(Boolean);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-anthracite-2 bg-anthracite pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-5">
        {stops.map((s) => {
          const active = isActive(s, pathname);
          return (
            <li key={s.to}>
              <NavLink to={s.to} end={s.to === "/"} className="relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold [font-stretch:85%]">
                <span className={cn("relative grid size-8 place-items-center rounded-full", active ? "bg-signal text-signal-ink" : "text-on-anthracite-2")}>
                  <s.icon className="size-[18px]" />
                  {s.badge === "approvals" && approvals > 0 && (
                    <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-signal px-1 text-[10px] font-bold text-signal-ink ring-2 ring-anthracite">{approvals}</span>
                  )}
                </span>
                <span className={active ? "text-on-anthracite" : "text-on-anthracite-2"}>{s.label.replace("My timetable", "Timetable").replace("Book a venue", "Book")}</span>
              </NavLink>
            </li>
          );
        })}
        <li>
          <button onClick={onMore} className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-on-anthracite-2 [font-stretch:85%]">
            <span className="grid size-8 place-items-center">
              <MenuIcon className="size-[18px]" />
            </span>
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

export function AppShell() {
  const location = useLocation();
  const reduce = useReducedMotion();
  const [paletteOpen, setPaletteOpen] = usePaletteHotkey();
  const [moreOpen, setMoreOpen] = useState(false);
  const wide = useMediaQuery("(min-width: 1024px)");
  const tablet = useMediaQuery("(min-width: 768px)");

  useEffect(() => setMoreOpen(false), [location.pathname]);

  return (
    <div className="platform-bg min-h-dvh">
      {tablet && (
        <aside className="fixed inset-y-0 left-0 z-40 flex w-[76px] flex-col gap-6 bg-anthracite px-3 py-4 lg:w-[252px] lg:px-4">
          <Brand compact={!wide} />
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            <RouteLine compact={!wide} />
          </div>
          <UserPlate compact={!wide} />
        </aside>
      )}

      <div className="md:pl-[76px] lg:pl-[252px]">
        <TopBar onSearch={() => setPaletteOpen(true)} onMenu={() => setMoreOpen(true)} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={location.pathname}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 md:pb-12"
          >
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>

      {!tablet && <PhoneBar onMore={() => setMoreOpen(true)} />}
      <Drawer open={moreOpen} onOpenChange={setMoreOpen} title="Go to" className="bg-anthracite text-on-anthracite">
        <div className="flex flex-col gap-5 pb-4">
          <RouteLine scope="drawer" onNavigate={() => setMoreOpen(false)} />
          <UserPlate />
        </div>
      </Drawer>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
