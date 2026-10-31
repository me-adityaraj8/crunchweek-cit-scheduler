import { KeyRound, LogOut, Menu as MenuIcon, MoonStar, Search, SunMedium } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useDashboard } from "@/api/hooks";
import { PasswordDialog } from "@/components/account/PasswordDialog";
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

/** The brand: a yellow plate with the V block. */
function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-[6px] border-2 border-rule-strong bg-signal p-2 text-signal-ink shadow-mount", compact && "justify-center p-1.5")}>
      <div className="grid size-9 shrink-0 place-items-center rounded-[4px] bg-anthracite text-signal">
        <span className="text-[16px] font-black [font-stretch:110%]">V</span>
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <div className="text-[16px] font-black tracking-[0.01em] [font-stretch:118%]">VELORA</div>
          <div className="truncate text-[11px] font-semibold [font-stretch:88%]">Chilika Institute of Technology</div>
        </div>
      )}
    </div>
  );
}

/** The menu: one row per page; the current page is a raised yellow tab. */
function RouteLine({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const user = useUser();
  const { pathname } = useLocation();
  const approvals = useApprovalsCount();
  const stops = LINES[user.role];
  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-1">
        {stops.map((s) => {
          const active = isActive(s, pathname);
          const count = s.badge === "approvals" ? approvals : 0;
          const link = (
            <NavLink
              to={s.to}
              end={s.to === "/"}
              onClick={onNavigate}
              className={cn(
                "group relative flex h-11 items-center gap-3 rounded-[4px] border-2 pr-2 text-[14px] transition-colors duration-100",
                compact ? "justify-center px-0" : "pl-[10px]",
                active
                  ? "border-rule-strong bg-signal font-bold text-signal-ink shadow-mount"
                  : "border-transparent font-semibold text-ink-2 hover:bg-signal-soft hover:text-ink",
              )}
            >
              <s.icon className="size-[18px] shrink-0" strokeWidth={active ? 2.4 : 2} />
              {!compact && <span className="flex-1 truncate">{s.label}</span>}
              {count > 0 && (
                <span
                  className={cn(
                    "grid h-5 min-w-5 place-items-center rounded-[3px] border-2 border-rule-strong bg-sheet px-1 text-[11px] font-bold text-ink",
                    compact && "absolute right-0.5 top-0.5 h-4 min-w-4 text-[10px]",
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
  const [password, setPassword] = useState(false);
  return (
    <div className={cn("flex items-center gap-3 rounded-[6px] border-2 border-rule-strong bg-sheet p-2.5", compact && "flex-col p-2")}>
      <div className="grid size-8 shrink-0 place-items-center rounded-[4px] border-2 border-rule-strong bg-platform text-[12px] font-black text-ink">
        {user.name.replace(/^(Dr\.|Prof\.)\s+/, "").slice(0, 1)}
      </div>
      {!compact && (
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-bold text-ink">{user.name}</div>
          <div className="truncate text-[11.5px] text-ink-3">
            {user.demo ? "Demo " : ""}
            {user.demo ? ROLE[user.role].toLowerCase() : ROLE[user.role]}
            {user.department ? `, ${user.department}` : ""}
            {user.faculty_id ? `, ${user.faculty_id}` : ""}
          </div>
        </div>
      )}
      {!user.demo && (
        <>
          <Tip label="Change password" side={compact ? "right" : "top"}>
            <button
              onClick={() => setPassword(true)}
              className="grid size-8 place-items-center rounded-[4px] text-ink-2 hover:bg-signal-soft hover:text-ink"
              aria-label="Change password"
            >
              <KeyRound className="size-4" />
            </button>
          </Tip>
          <PasswordDialog open={password} onOpenChange={setPassword} />
        </>
      )}
      <Tip label="Log out" side={compact ? "right" : "top"}>
        <button onClick={() => logout()} className="grid size-8 place-items-center rounded-[4px] text-ink-2 hover:bg-signal-soft hover:text-ink" aria-label="Log out">
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
    <div className="sticky top-0 z-30 border-b-2 border-rule-strong bg-platform">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
        <button onClick={onMenu} className="press grid size-9 place-items-center rounded-[4px] border-2 border-rule-strong bg-sheet text-ink shadow-mount md:hidden" aria-label="Open menu">
          <MenuIcon className="size-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2 text-[13.5px] md:hidden">
          <span className="grid size-7 place-items-center rounded-[4px] border-2 border-rule-strong bg-signal text-[12px] font-black text-signal-ink">V</span>
          <span className="truncate font-semibold">{stop?.label}</span>
        </div>
        <button
          onClick={onSearch}
          className="press ml-auto flex h-10 items-center gap-2.5 rounded-[4px] border-2 border-rule-strong bg-sheet px-3 text-[13.5px] font-medium text-ink-2 shadow-mount hover:text-ink md:ml-0 md:w-[min(440px,42vw)]"
        >
          <Search className="size-4" />
          <span className="hidden md:inline">Where to? Pages, groups, faculty, rooms</span>
          <kbd className="ml-auto hidden rounded-[3px] border-2 border-rule-strong px-1.5 text-[10.5px] font-bold md:inline">CTRL K</kbd>
        </button>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <div className="flex items-center gap-2 rounded-[4px] border-2 border-rule-strong bg-anthracite px-2 py-1 shadow-mount" title="Local time">
            <SplitFlap value={clock(now)} className="text-[15px]" label={`Time ${clock(now)}`} stagger={30} />
          </div>
        </div>
        <Tip label={theme === "dark" ? "Light theme" : "Dark theme"}>
          <button onClick={toggle} className="press grid size-9 place-items-center rounded-[4px] border-2 border-rule-strong bg-sheet text-ink shadow-mount" aria-label="Switch theme">
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
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-rule-strong bg-sheet pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-5">
        {stops.map((s) => {
          const active = isActive(s, pathname);
          return (
            <li key={s.to}>
              <NavLink to={s.to} end={s.to === "/"} className="relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold [font-stretch:85%]">
                <span className={cn("relative grid size-8 place-items-center rounded-[4px] border-2", active ? "border-rule-strong bg-signal text-signal-ink shadow-mount" : "border-transparent text-ink-2")}>
                  <s.icon className="size-[18px]" />
                  {s.badge === "approvals" && approvals > 0 && (
                    <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-signal px-1 text-[10px] font-bold text-signal-ink ring-2 ring-sheet">{approvals}</span>
                  )}
                </span>
                <span className={active ? "font-bold text-ink" : "text-ink-2"}>{s.label.replace("My timetable", "Timetable").replace("Book a venue", "Book")}</span>
              </NavLink>
            </li>
          );
        })}
        <li>
          <button onClick={onMore} className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-ink-2 [font-stretch:85%]">
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
        <aside className="fixed inset-y-0 left-0 z-40 flex w-[76px] flex-col gap-5 border-r-2 border-rule-strong bg-sheet px-3 py-4 lg:w-[252px] lg:px-4">
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
      <Drawer open={moreOpen} onOpenChange={setMoreOpen} title="Go to" className="bg-sheet text-ink">
        <div className="flex flex-col gap-5 pb-4">
          <RouteLine onNavigate={() => setMoreOpen(false)} />
          <UserPlate />
        </div>
      </Drawer>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
