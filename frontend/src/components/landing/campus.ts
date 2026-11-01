// Fixed data for the landing scene. The campus is 12 buildings of 12 rooms each. The same 144 rooms
// become a timetable 3 groups deep (6 days x 9 periods, 162 slots). The data also holds the clashes,
// the solved layout and where one closed building's rooms move. Pure numbers, no three.js, so the
// story can import the label anchors without pulling three.js into its bundle.

export const N = 144;
export const DAYS = 6;
export const PERIODS = 9;
export const OFFLINE = 5;
export const CONFLICTS = 18;
export const ORB: [number, number, number] = [0, 9, 0];

const FLOOR = 1.15;
const BAY = 1.7;
// footprint x, footprint z, floors: every shape is 12 rooms, nothing wider than 3 bays so the roads stay clear
const SHAPES: [number, number, number][] = [
  [2, 2, 3], [3, 2, 2], [1, 2, 6], [2, 3, 2],
  [3, 1, 4], [2, 1, 6], [2, 3, 2], [1, 3, 4],
  [3, 2, 2], [2, 2, 3], [3, 1, 4], [1, 1, 12],
];

export const BUILDINGS = SHAPES.map(([fx, fz, fl], b) => ({ x: [-10.5, -3.5, 3.5, 10.5][b % 4], z: [-7, 0, 7][Math.floor(b / 4)], fx, fz, fl, top: fl * FLOOR }));

/** Where timetable slot s sits in the air: days across, periods down (with a lunch gap), groups in depth. */
export function slot(s: number): [number, number, number] {
  const layer = Math.floor(s / 54);
  const r = s % 54;
  const day = r % DAYS;
  const period = Math.floor(r / DAYS);
  return [(day - 2.5) * 1.75, 10.4 - period * 0.95 - (period >= 5 ? 0.45 : 0), (layer - 1) * 1.4];
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build() {
  const r = rng(7);
  const f3 = () => new Float32Array(N * 3);
  const campus = f3(), explode = f3(), start = f3(), final = f3(), repair = f3();
  const info = new Float32Array(N * 4); // seed, clash, offline, kind
  const index = new Float32Array(N);
  const put = (a: Float32Array, i: number, p: number[]) => a.set(p, i * 3);
  const roofs: number[][][] = [];

  BUILDINGS.forEach((B, b) => {
    const spots: number[][] = [];
    let k = 0;
    for (let fl = 0; fl < B.fl; fl++)
      for (let iz = 0; iz < B.fz; iz++)
        for (let ix = 0; ix < B.fx; ix++) {
          const i = b * 12 + k++;
          const lx = (ix - (B.fx - 1) / 2) * BAY;
          const lz = (iz - (B.fz - 1) / 2) * BAY;
          const y = fl * FLOOR + FLOOR / 2;
          put(campus, i, [B.x + lx, y, B.z + lz]);
          put(explode, i, [B.x + lx * 1.3, y + fl * 0.85 + 0.6, B.z + lz * 1.3]);
          if (fl === B.fl - 1) spots.push([B.x + lx, B.top + FLOOR / 2, B.z + lz]);
          info.set([r(), 0, b === OFFLINE ? 1 : 0, Math.floor(r() * 4)], i * 4);
          index[i] = i / N;
        }
    roofs.push(spots);
  });

  // the solved timetable: 144 of the 162 slots, shuffled
  const slots = Array.from({ length: DAYS * PERIODS * 3 }, (_, s) => s);
  for (let s = slots.length - 1; s > 0; s--) {
    const j = Math.floor(r() * (s + 1));
    [slots[s], slots[j]] = [slots[j], slots[s]];
  }
  for (let i = 0; i < N; i++) {
    put(final, i, slot(slots[i]));
    put(start, i, slot(slots[i]));
  }
  // clashes: these start on another class's slot, and the solve moves them to their own
  const picked = new Set<number>();
  while (picked.size < CONFLICTS) picked.add(Math.floor(r() * N));
  for (const c of picked) {
    let v: number;
    do v = Math.floor(r() * N);
    while (picked.has(v));
    const p = slot(slots[v]);
    put(start, c, [p[0] + 0.3, p[1] - 0.14, p[2] + 0.3]);
    info[c * 4 + 1] = 1;
  }
  // the disruption: the closed building's rooms move up onto the other roofs
  repair.set(campus);
  const others = BUILDINGS.map((_, b) => b).filter((b) => b !== OFFLINE);
  for (let j = 0; j < 12; j++) {
    const to = roofs[others[j % others.length]];
    put(repair, OFFLINE * 12 + j, to[Math.floor(j / others.length) % to.length]);
  }
  // 40 faculty in an arc over the board, each linked to its classes
  const faculty = new Float32Array(40 * 3);
  for (let f = 0; f < 40; f++) {
    const a = -1.1 + (f / 39) * 2.2;
    put(faculty, f, [Math.sin(a) * 11, 13.2 + Math.cos(f * 1.7) * 0.6, -Math.cos(a) * 5 - 1.5]);
  }
  const links = new Float32Array(N * 6);
  const linkU = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    links.set(faculty.subarray((i % 40) * 3, (i % 40) * 3 + 3), i * 6);
    links.set(start.subarray(i * 3, i * 3 + 3), i * 6 + 3);
    linkU[i * 2 + 1] = 1;
  }
  return { campus, explode, start, final, repair, info, index, faculty, links, linkU };
}

export const CAMPUS = build();

const B = BUILDINGS;
/** HTML labels pinned to points in the scene, each shown over a range of the story. */
export const ANCHORS: { id: string; text: string; p: [number, number, number]; r: [number, number]; tone?: "red" | "day" }[] = [
  { id: "a", text: "BLOCK A · LECTURE HALLS", p: [B[0].x, B[0].top + 0.4, B[0].z], r: [0, 1.75] },
  { id: "b", text: "BLOCK B · LABS", p: [B[6].x, B[6].top + 0.4, B[6].z], r: [0.15, 1.75] },
  { id: "lib", text: "LIBRARY TOWER", p: [B[11].x, B[11].top + 0.4, B[11].z], r: [0, 1.75] },
  { id: "off", text: "BLOCK C · CLOSED", p: [B[OFFLINE].x, B[OFFLINE].top + 1.2, B[OFFLINE].z], r: [5.3, 5.97], tone: "red" },
  ...["MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d, i) => ({ id: d, text: d, p: [(i - 2.5) * 1.75, 11.35, 1.6] as [number, number, number], r: [2.55, 4.97] as [number, number], tone: "day" as const })),
];
