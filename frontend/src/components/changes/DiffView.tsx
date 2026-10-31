import { Play } from "lucide-react";
import { LayoutGroup } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSummary, useTimetable } from "@/api/hooks";
import type { Proposal, Slot, Summary } from "@/api/types";
import { Board, BoardRow, BoardText } from "@/components/board/Board";
import { SplitFlap, type FlapTone } from "@/components/board/SplitFlap";
import { ErrorState, GridSkeleton } from "@/components/states";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Select } from "@/components/ui/select";
import { dayShort, periodLabel } from "@/lib/time";
import { affected, changeKind, diffItems, type ChangeKind } from "./diff";

const CHANGE: Record<ChangeKind, { board: string; tone: FlapTone; label: string }> = {
  time: { board: "RETIMED", tone: "caution", label: "New time" },
  room: { board: "ROOM", tone: "caution", label: "Room only" },
  added: { board: "NEW", tone: "clear", label: "Added" },
  removed: { board: "REMOVED", tone: "stop", label: "Removed" },
};

function slot(s: Slot | null | undefined, summary?: Summary) {
  return s ? `${dayShort(s.day)} ${periodLabel(s.start, summary?.periods)} ${s.room}` : "—";
}

/** Every session the proposal touches, as a board. */
export function MoveBoard({ p }: { p: Proposal }) {
  const { data: summary } = useSummary();
  return (
    <Board
      title="What moves"
      meta={<span>{p.diff.length} sessions</span>}
      columns="minmax(0,1.1fr) 100px minmax(0,1fr) 20px minmax(0,1fr) 112px"
      headers={["Session", "Groups", "From", "", "To", "Change"]}
    >
      {p.diff.map((m, i) => {
        const k = changeKind(m);
        const c = CHANGE[k];
        return (
          <BoardRow key={m.session_id} index={i}>
            <BoardText>{m.session_id}</BoardText>
            <BoardText dim className="hidden sm:block">{(m.groups ?? []).join(" ")}</BoardText>
            <BoardText dim className="col-span-2 row-start-2 tabular-nums sm:col-span-1 sm:row-start-auto">{slot(m.before, summary)}</BoardText>
            <span role="cell" aria-hidden className="hidden text-ink-3 sm:block">→</span>
            <BoardText className="col-span-2 tabular-nums text-signal sm:col-span-1">{slot(m.after, summary)}</BoardText>
            <span role="cell" className="col-start-2 row-start-1 justify-self-end text-[12.5px] sm:col-start-auto sm:row-start-auto sm:justify-self-start">
              <SplitFlap value={c.board} length={7} tone={c.tone} delay={i * 60} label={c.label} />
            </span>
          </BoardRow>
        );
      })}
    </Board>
  );
}

/**
 * The timetable of one affected group or room, before and after. Switching between them glides
 * each moved session to its new slot; in "after", dashed outlines show where they were.
 */
export function DiffView({ p }: { p: Proposal }) {
  const { data: summary } = useSummary();
  const { groups, rooms } = useMemo(() => affected(p), [p]);
  const [entity, setEntity] = useState(() => (groups[0] ? `group:${groups[0][0]}` : rooms[0] ? `room:${rooms[0][0]}` : ""));
  const [view, id] = entity.split(":") as ["group" | "room", string];
  const [state, setState] = useState<"before" | "after">("after");
  const tt = useTimetable(view, id, "regular", !!id);
  const d = useMemo(() => (tt.data ? diffItems(p, tt.data.entries, view, id) : null), [tt.data, p, view, id]);

  // show "before", then glide to "after": once when a group or room first appears, and on Play
  const timer = useRef<number | undefined>(undefined);
  const playedFor = useRef<string | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const play = useCallback(() => {
    setState("before");
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("after"), 900);
  }, []);
  useEffect(() => {
    if (d && playedFor.current !== entity) {
      playedFor.current = entity;
      play();
    }
  }, [d, entity, play]);

  if (!id) return null;
  const options = [
    ...groups.map(([g, n]) => ({ value: `group:${g}`, label: g, hint: `${n} moved`, group: "Groups" })),
    ...rooms.map(([r, n]) => ({ value: `room:${r}`, label: r, hint: `${n} affected`, group: "Rooms" })),
  ];
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-[16px] font-bold">Revised timetable</h2>
        <Select aria-label="Group or room to compare" value={entity} onValueChange={setEntity} options={options} className="w-[220px]" />
        <Segmented
          aria-label="Before or after"
          value={state}
          onChange={setState}
          items={[
            { value: "before", label: "Before" },
            { value: "after", label: "After" },
          ]}
        />
        <Button size="sm" onClick={play}>
          <Play /> Play
        </Button>
      </div>
      <p className="text-[12.5px] text-ink-2">
        {state === "after"
          ? "Yellow marks a session that moved or is new. A dashed outline shows where it was."
          : "The timetable as it is now. Yellow marks the sessions this proposal moves."}
      </p>
      {tt.isError ? (
        <ErrorState error={tt.error} onRetry={() => tt.refetch()} />
      ) : !d || !summary ? (
        <GridSkeleton />
      ) : (
        <LayoutGroup id={`diff-${entity}`}>
          <TimetableGrid
            items={state === "after" ? d.after : d.before}
            marks={state === "after" ? d.marksAfter : d.marksBefore}
            ghosts={state === "after" ? d.ghosts : undefined}
            days={summary.days}
            periods={summary.periods}
            view={view}
            showEvening={false}
            lunchAfter={summary.lunch_after}
            selected={null}
            onSelect={() => undefined}
            showNow={false}
          />
        </LayoutGroup>
      )}
    </section>
  );
}
