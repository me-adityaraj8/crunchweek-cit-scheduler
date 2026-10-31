import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { CalendarRange, DoorOpen, LogOut, MoonStar, Search, SunMedium, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useSummary } from "@/api/hooks";
import { useAuth, useUser } from "@/lib/auth";
import { roomTypeLabel } from "@/lib/format";
import { LINES } from "@/lib/roles";
import { useTheme } from "@/lib/theme";

/** "Where to?": jump to any page, or straight to the timetable of a group, faculty member or room. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const user = useUser();
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const { data: summary } = useSummary();

  const go = (to: string) => {
    onOpenChange(false);
    nav(to);
  };
  const faculty = user.role === "faculty" ? (summary?.faculty ?? []).filter((f) => f.id === user.faculty_id) : (summary?.faculty ?? []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[min(600px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-[6px] border-2 border-rule-strong bg-sheet shadow-[8px_8px_0_var(--shade)] data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in">
          <DialogPrimitive.Title className="sr-only">Where to?</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search pages, groups, faculty and rooms</DialogPrimitive.Description>
          <Command label="Where to?" loop className="flex max-h-[min(520px,70vh)] flex-col">
            <div className="flex items-center gap-3 border-b border-rule px-4">
              <span className="grid size-7 place-items-center rounded-[6px] bg-signal text-signal-ink">
                <Search className="size-4" />
              </span>
              <Command.Input
                autoFocus
                placeholder="Where to? A page, group, faculty member or room"
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
              />
              <kbd className="hidden rounded-[4px] border-2 border-rule-strong px-1.5 py-0.5 text-[11px] text-ink-3 sm:block">Esc</kbd>
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-[13.5px] text-ink-3">Nothing matches. Try a code like CR-101 or a group like CSE-2.</Command.Empty>
              <Group heading="Pages">
                {LINES[user.role].map((s) => (
                  <Item key={s.to + s.label} value={`page ${s.label}`} onSelect={() => go(s.to)} icon={<s.icon />}>
                    {s.label}
                  </Item>
                ))}
              </Group>
              {summary && (
                <>
                  <Group heading="Student groups">
                    {summary.groups.map((g) => (
                      <Item key={g.id} value={`group ${g.id} ${g.name}`} onSelect={() => go(`/timetable?view=group&id=${encodeURIComponent(g.id)}`)} icon={<Users />} hint={`${g.size} students`}>
                        <b className="font-bold [font-stretch:85%]">{g.id}</b> <span className="text-ink-2">{g.name}</span>
                      </Item>
                    ))}
                  </Group>
                  <Group heading="Faculty">
                    {faculty.map((f) => (
                      <Item key={f.id} value={`faculty ${f.id} ${f.name} ${f.department}`} onSelect={() => go(`/timetable?view=faculty&id=${encodeURIComponent(f.id)}`)} icon={<CalendarRange />} hint={f.department}>
                        <b className="font-bold [font-stretch:85%]">{f.id}</b> <span className="text-ink-2">{f.name}</span>
                      </Item>
                    ))}
                  </Group>
                  <Group heading="Rooms">
                    {summary.rooms.map((r) => (
                      <Item key={r.id} value={`room ${r.id} ${r.name} ${r.type}`} onSelect={() => go(`/timetable?view=room&id=${encodeURIComponent(r.id)}`)} icon={<DoorOpen />} hint={`${roomTypeLabel(r.type)}, ${r.capacity} seats`}>
                        <b className="font-bold [font-stretch:85%]">{r.id}</b> <span className="text-ink-2">{r.name}</span>
                      </Item>
                    ))}
                  </Group>
                </>
              )}
              <Group heading="Actions">
                <Item value="action switch theme dark light" onSelect={() => { toggle(); onOpenChange(false); }} icon={theme === "dark" ? <SunMedium /> : <MoonStar />}>
                  Switch to {theme === "dark" ? "light" : "dark"} theme
                </Item>
                <Item value="action log out sign out" onSelect={() => { onOpenChange(false); logout(); }} icon={<LogOut />}>
                  Log out
                </Item>
              </Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-3"
    >
      {children}
    </Command.Group>
  );
}

function Item({ children, icon, hint, value, onSelect }: { children: ReactNode; icon: ReactNode; hint?: ReactNode; value: string; onSelect: () => void }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-default items-center gap-3 rounded-[4px] px-2.5 py-2 text-[13.5px] data-[selected=true]:bg-signal-soft [&_svg]:size-4 [&_svg]:text-ink-3"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[12px] text-ink-3">{hint}</span>}
    </Command.Item>
  );
}

/** Opens the palette on Ctrl/Cmd+K or "/". */
export function usePaletteHotkey(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, [contenteditable=true]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [open, setOpen];
}
