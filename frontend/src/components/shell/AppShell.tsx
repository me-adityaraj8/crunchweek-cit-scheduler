import { KeyRound, LogOut, Menu as MenuIcon, Search, UserRound } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useDashboard } from "@/api/hooks";
import { PasswordDialog } from "@/components/account/PasswordDialog";
import { Drawer } from "@/components/ui/dialog";
import { Logo } from "@/components/ui/logo";
import { Tip } from "@/components/ui/overlay";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth, useUser } from "@/lib/auth";
import { ROLE } from "@/lib/format";
import { LINES, PHONE, phoneLabel, type Stop } from "@/lib/roles";
import { useMediaQuery } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { CommandPalette, usePaletteHotkey } from "./CommandPalette";
import { VeloLauncher, VeloPanel, VeloPhoneButton } from "@/components/velo/Velo";
import { VeloProvider } from "@/components/velo/VeloProvider";

function useApprovalsCount() {
  const user = useUser();
  const { data } = useDashboard();
  if (user.role !== "admin" && user.role !== "coordinator") return 0;
  return data?.pending.length ?? 0;
}

function isActive(stop: Stop, pathname: string) {
  return stop.to === "/" ? pathname === "/" : pathname === stop.to || pathname.startsWith(stop.to + "/");
}

/** The Velora mark on every brand plate. */
function Mark({ size = 40 }: { size?: number }) {
  return <Logo size={size} title="" />;
}

/** The brand: an accent plate with the V block. */
function Brand() {
  return (
    <Link to="/" className="lift flex items-center gap-3 rounded-sheet border-2 border-rule-strong bg-signal p-3.5 text-signal-ink shadow-float">
      <Mark />
      <span className="min-w-0 leading-tight">
        <span className="block text-[19px] font-black tracking-[0.01em]">VELORA</span>
        <span className="block truncate text-[12px] font-medium">Chilika Institute of Technology</span>
      </span>
    </Link>
  );
}

/** The menu card: the role on top, one row per page, the current page a raised accent tab.
 * `row` lays the pages out side by side, for tablets where the menu sits above the content. */
function RouteLine({ row, onNavigate }: { row?: boolean; onNavigate?: () => void }) {
  const user = useUser();
  const { pathname } = useLocation();
  const approvals = useApprovalsCount();
  return (
    <nav aria-label="Main" className={cn("rounded-sheet border-2 border-rule-strong bg-sheet p-2.5 shadow-float", row && "p-2")}>
      {!row && <div className="label-caps px-2 pb-2 pt-1.5 text-ink-3">{ROLE[user.role]}</div>}
      <ul className={cn("flex gap-1", row ? "flex-row flex-wrap" : "flex-col")}>
        {LINES[user.role].map((s) => {
          const active = isActive(s, pathname);
          const count = s.badge === "approvals" ? approvals : 0;
          return (
            <li key={s.to + s.label} className={cn(s.divider && !row && "mt-2 border-t-2 border-rule-strong pt-2")}>
              <NavLink
                to={s.to}
                end={s.to === "/"}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-[4px] border-2 text-[15px] transition-colors duration-100",
                  row ? "px-3" : "px-2.5",
                  active
                    ? "border-rule-strong bg-signal font-bold text-signal-ink shadow-mount"
                    : "border-transparent font-semibold text-ink hover:bg-signal-soft",
                )}
              >
                <s.icon className="size-[18px] shrink-0" strokeWidth={active ? 2.2 : 2} />
                <span className={cn(!row && "flex-1 truncate")}>{s.label}</span>
                {count > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-[3px] border-2 border-rule-strong bg-sheet px-1 text-[11px] font-bold text-ink">{count}</span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function UserPlate() {
  const user = useUser();
  const { logout } = useAuth();
  const [password, setPassword] = useState(false);
  const square = "grid size-9 shrink-0 place-items-center rounded-[4px] border-2 border-rule-strong bg-sheet text-ink transition-colors hover:bg-signal-soft";
  return (
    <div className="flex items-center gap-2.5 rounded-sheet border-2 border-rule-strong bg-sheet p-2.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-[4px] border-2 border-rule-strong bg-platform text-[14px] font-extrabold text-ink">
        {user.name.replace(/^(Dr\.|Prof\.)\s+/, "").slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[14px] font-bold text-ink">{user.name}</div>
        <div className="truncate text-[12px] text-ink-3">
          {user.demo ? `Demo ${ROLE[user.role].toLowerCase()}` : ROLE[user.role]}
          {user.department ? `, ${user.department}` : ""}
          {user.faculty_id ? `, ${user.faculty_id}` : ""}
        </div>
      </div>
      {!user.demo && (
        <>
          <Tip label="Change password">
            <button onClick={() => setPassword(true)} className={square} aria-label="Change password">
              <KeyRound className="size-4" />
            </button>
          </Tip>
          <PasswordDialog open={password} onOpenChange={setPassword} />
        </>
      )}
      <Tip label="Log out">
        <button onClick={() => logout()} className={square} aria-label="Log out">
          <LogOut className="size-4" />
        </button>
      </Tip>
    </div>
  );
}

function ThemeButton() {
  const { theme } = useTheme();
  return (
    <Tip label={theme === "dark" ? "Light theme" : "Night Shift"}>
      <ThemeToggle />
    </Tip>
  );
}

function SearchButton({ onSearch, className }: { onSearch: () => void; className?: string }) {
  return (
    <button
      onClick={onSearch}
      className={cn(
        "relative flex h-11 items-center gap-2.5 rounded-[4px] border-2 border-rule-strong bg-sheet pl-3 pr-16 text-left text-[15px] font-medium text-ink-3 shadow-mount transition-[box-shadow,background-color] hover:bg-signal-faint hover:shadow-float",
        className,
      )}
    >
      <Search className="size-[18px] shrink-0 text-ink" />
      <span className="truncate">Search pages, groups, faculty and rooms</span>
      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[3px] border-2 border-rule-strong px-1.5 text-[11px] font-bold text-ink">CTRL K</kbd>
    </button>
  );
}

/** The row above every page: search, the week we plan for, and the theme. */
function TopRow({ onSearch }: { onSearch: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchButton onSearch={onSearch} className="min-w-0 flex-[1_1_320px]" />
      <Link
        to="/spectra"
        className="flex h-11 shrink-0 items-center rounded-[4px] border-2 border-rule-strong bg-k-event-tint px-3.5 text-[13px] font-bold tracking-[0.04em] text-ink transition-colors hover:brightness-95"
      >
        WEEK 7 · SPECTRA &apos;27
      </Link>
      <ThemeButton />
    </div>
  );
}

/** Phones: the mark, the page as a title over who and when, and the menu on the right. */
function PhoneHeader({ onMenu }: { onMenu: () => void }) {
  const user = useUser();
  const { pathname } = useLocation();
  const stop = LINES[user.role].find((s) => isActive(s, pathname));
  const day = new Date().toLocaleDateString("en-IN", { weekday: "long" });
  return (
    <header className="flex items-center gap-3 px-4 pb-3 pt-4">
      <Mark size={36} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[17px] font-black uppercase">{stop ? phoneLabel(user.role, stop) : "Velora"}</div>
        <div className="truncate text-[12px] font-semibold text-ink-3">
          {user.name} · {day}
        </div>
      </div>
      <VeloPhoneButton />
      <button onClick={onMenu} className="press grid size-11 shrink-0 place-items-center rounded-[4px] border-2 border-rule-strong bg-sheet text-ink shadow-lift" aria-label="Open menu">
        <MenuIcon className="size-5" />
      </button>
    </header>
  );
}

/** Phones: three pages and "Me" (the full menu); the current one fills its whole cell. */
function PhoneBar({ onMe, meOpen }: { onMe: () => void; meOpen: boolean }) {
  const user = useUser();
  const { pathname } = useLocation();
  const approvals = useApprovalsCount();
  const stops = PHONE[user.role].map((to) => LINES[user.role].find((s) => s.to === to)!).filter(Boolean);
  const cell = "relative flex h-16 w-full flex-col items-center justify-center gap-1 border-r-2 border-rule-strong text-[12px] last:border-r-0";
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-rule-strong bg-sheet pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-4">
        {stops.map((s) => {
          const active = isActive(s, pathname) && !meOpen;
          return (
            <li key={s.to} className="border-r-2 border-rule-strong">
              <NavLink to={s.to} end={s.to === "/"} className={cn(cell, "border-r-0", active ? "bg-signal font-black text-signal-ink" : "font-bold text-ink")}>
                <s.icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                {phoneLabel(user.role, s)}
                {s.badge === "approvals" && approvals > 0 && (
                  <span className="absolute right-3 top-2 grid h-[18px] min-w-[18px] place-items-center rounded-[3px] border-2 border-rule-strong bg-sheet px-1 text-[10px] font-bold text-ink">{approvals}</span>
                )}
              </NavLink>
            </li>
          );
        })}
        <li>
          <button onClick={onMe} className={cn(cell, meOpen ? "bg-signal font-black text-signal-ink" : "font-bold text-ink")} aria-expanded={meOpen}>
            <UserRound className="size-5" />
            Me
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
  const [menuOpen, setMenuOpen] = useState(false);
  const wide = useMediaQuery("(min-width: 1024px)");
  const tablet = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Desktop: the menu is a column of floating cards beside the content. Tablet: the same cards sit
  // above it, the pages in a wrapping row. Phone: a header and a four-cell bar at the bottom.
  return (
    <VeloProvider>
      <div className="platform-bg min-h-dvh">
        {!tablet && <PhoneHeader onMenu={() => setMenuOpen(true)} />}
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-start gap-6 px-4 pb-28 sm:px-6 md:pb-12 md:pt-6">
          {tablet &&
            (wide ? (
              <aside className="sticky top-6 flex max-w-[236px] flex-[1_1_220px] flex-col gap-4">
                <Brand />
                <RouteLine />
                <UserPlate />
              </aside>
            ) : (
              <aside className="flex w-full flex-col gap-4">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                  <Brand />
                  <UserPlate />
                </div>
                <RouteLine row />
              </aside>
            ))}

          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
            {tablet && <TopRow onSearch={() => setPaletteOpen(true)} />}
            <AnimatePresence mode="wait" initial={false}>
              <motion.main
                key={location.pathname}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="min-w-0"
              >
                <Outlet />
              </motion.main>
            </AnimatePresence>
          </div>
        </div>

        {!tablet && <PhoneBar onMe={() => setMenuOpen(true)} meOpen={menuOpen} />}
        <Drawer open={menuOpen} onOpenChange={setMenuOpen} title="Menu" className="bg-sheet text-ink">
          <div className="flex flex-col gap-4 pb-4">
            <div className="flex gap-3">
              <SearchButton
                onSearch={() => {
                  setMenuOpen(false);
                  setPaletteOpen(true);
                }}
                className="min-w-0 flex-1 pr-3 [&>kbd]:hidden"
              />
              <ThemeButton />
            </div>
            <RouteLine onNavigate={() => setMenuOpen(false)} />
            <UserPlate />
          </div>
        </Drawer>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <VeloLauncher />
        <VeloPanel />
      </div>
    </VeloProvider>
  );
}
