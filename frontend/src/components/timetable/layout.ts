import type { BookingEntry, Entry, Kind } from "@/api/types";
import { kindOf } from "@/lib/format";

/** One block on a grid: a session or a Week-7 booking. Periods are inclusive. */
export interface GridItem {
  key: string;
  day: string;
  start: number;
  end: number;
  kind: Kind;
  room: string;
  entry?: Entry;
  booking?: BookingEntry;
}

export function fromEntries(entries: Entry[], bookings: BookingEntry[] = []): GridItem[] {
  return [
    ...entries.map((e) => ({
      key: e.session_id,
      day: e.day,
      start: e.start_period,
      end: e.start_period + e.duration - 1,
      kind: kindOf(e.kind),
      room: e.room_id,
      entry: e,
    })),
    ...bookings.map((b) => ({
      key: `bk-${b.request_id}`,
      day: b.day,
      start: b.start_period,
      end: b.end_period,
      kind: "event" as Kind,
      room: b.room_id,
      booking: b,
    })),
  ];
}

/**
 * Side-by-side lanes for blocks that overlap in one column (elective baskets, the all-rooms view).
 * Returns lane index and lane count per key; blocks that overlap share the same count.
 */
export function assignLanes(items: GridItem[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end || a.key.localeCompare(b.key));
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: GridItem[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const it of cluster) out.get(it.key)!.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };
  for (const it of sorted) {
    if (cluster.length && it.start > clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end < it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else laneEnds[lane] = it.end;
    out.set(it.key, { lane, lanes: 1 });
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

/** Pixel offset of a period's top edge, with the lunch band after `lunchAfter`. */
export function rowTop(p: number, rowH: number, lunchH: number, lunchAfter: number) {
  return (p - 1) * rowH + (p > lunchAfter ? lunchH : 0);
}
