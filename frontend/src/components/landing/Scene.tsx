import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ORB_FRAG, ORB_VERT } from "@/components/velo/live/shaders";
import { ANCHORS, BUILDINGS, CAMPUS, N, OFFLINE, ORB } from "./campus";
import * as S from "./shaders";
import { CHAPTERS, PALETTE as P, story } from "./story-state";

const C = (hex: string) => new THREE.Color(hex);
const V = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
// the camera's path through the story: one stop per chapter boundary, a smooth curve between them
const CAM = new THREE.CatmullRomCurve3([[27, 23, 31], [15, 9, 17], [6, 7, 23], [2, 6.5, 16.5], [-8, 7.5, 18], [19, 15, 19], [0, 10, 25], [0, 8.5, 17]].map(V));
const LOOK = new THREE.CatmullRomCurve3([[0, 1, 0], [0, 2.5, 0], [0, 6.2, 0], [0, 6.3, 0], [0, 6, 0], [0, 1.5, 0], [0, 7, 0], [0, 6.6, 0]].map(V));
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const add = THREE.AdditiveBlending;

function shader(uniforms: Record<string, THREE.IUniform>, vertexShader: string, fragmentShader: string, glow = false) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, ...(glow && { transparent: true, blending: add, depthWrite: false }) });
}

function roads() {
  const pos: number[] = [], road: number[] = [], idx: number[] = [];
  let phase = 0;
  const strip = (ax: number, az: number, bx: number, bz: number, w = 0.32) => {
    const L = Math.hypot(bx - ax, bz - az), nx = (-(bz - az) / L) * w, nz = ((bx - ax) / L) * w, o = pos.length / 3;
    pos.push(ax + nx, 0.03, az + nz, ax - nx, 0.03, az - nz, bx + nx, 0.03, bz + nz, bx - nx, 0.03, bz - nz);
    road.push(phase, 1, phase, -1, phase + L, 1, phase + L, -1);
    idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    phase += 11;
  };
  for (const z of [-10.5, -3.5, 3.5, 10.5]) strip(-17, z, 17, z);
  for (const x of [-14, -7, 0, 7, 14]) strip(x, -13, x, 13);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aRoad", new THREE.Float32BufferAttribute(road, 2));
  g.setIndex(idx);
  return g;
}

function dust(count: number, spread: [number, number, number], base: Float32Array | null) {
  const g = new THREE.BufferGeometry();
  const pos = base ?? new Float32Array(count * 3).map((_, i) => (i % 3 === 1 ? Math.random() * spread[1] : (Math.random() - 0.5) * (i % 3 ? spread[2] : spread[0])));
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(count * 4).map(() => Math.random()), 4));
  return g;
}

function World({ mobile }: { mobile: boolean }) {
  const { camera, size, gl } = useThree();
  const t = useRef(0);
  const orb = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const sweep = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), q: new THREE.Vector3(), v: new THREE.Vector3(), y: new THREE.Vector3(0, 1, 0) }), []);

  const m = useMemo(() => {
    const U = { uT: { value: 0 }, uTime: { value: 0 } };
    const fog = { value: C(P.night) };
    const off = BUILDINGS[OFFLINE];

    const rooms = new THREE.InstancedBufferGeometry().copy(new THREE.BoxGeometry(1, 1, 1) as unknown as THREE.InstancedBufferGeometry);
    rooms.instanceCount = N;
    const inst = (name: string, a: Float32Array, n: number) => rooms.setAttribute(name, new THREE.InstancedBufferAttribute(a, n));
    inst("aCampus", CAMPUS.campus, 3);
    inst("aExplode", CAMPUS.explode, 3);
    inst("aStart", CAMPUS.start, 3);
    inst("aFinal", CAMPUS.final, 3);
    inst("aRepair", CAMPUS.repair, 3);
    inst("aInfo", CAMPUS.info, 4);
    inst("aIndex", CAMPUS.index, 1);

    const links = new THREE.BufferGeometry();
    links.setAttribute("position", new THREE.BufferAttribute(CAMPUS.links, 3));
    links.setAttribute("aU", new THREE.BufferAttribute(CAMPUS.linkU, 1));

    const pix = { value: gl.getPixelRatio() * (mobile ? 1.6 : 1.3) };
    const dustU = (mode: number) => ({ ...U, uPix: pix, uOrb: { value: V(ORB) }, uC1: { value: C(P.sodium) }, uC2: { value: C(P.pink) }, uC3: { value: C(P.ice) }, uMode: { value: mode } });

    return {
      U,
      off,
      rooms,
      room: shader({ ...U, uKind: { value: [C(P.violet), C(P.sodium), C(P.pink), C(P.ice)] }, uRed: { value: C(P.red) }, uIce: { value: C(P.ice) }, uSodium: { value: C(P.sodium) }, uFog: fog }, S.ROOM_VERT, S.ROOM_FRAG),
      ground: shader({ ...U, uFog: fog, uLine: { value: C(P.line) }, uIce: { value: C(P.ice) }, uRed: { value: C(P.red) }, uOff: { value: new THREE.Vector2(off.x, off.z) } }, S.WORLD_VERT, S.GROUND_FRAG),
      roadGeo: roads(),
      road: shader({ ...U, uA: { value: C(P.violet) }, uB: { value: C(P.ice) } }, S.ROAD_VERT, S.ROAD_FRAG, true),
      links,
      link: shader({ ...U, uC: { value: C(P.ice) } }, S.LINK_VERT, S.LINK_FRAG, true),
      dustGeo: dust(mobile ? 450 : 1400, [64, 26, 64], null),
      dust: shader(dustU(0), S.DUST_VERT, S.DUST_FRAG, true),
      nodeGeo: dust(40, [0, 0, 0], CAMPUS.faculty),
      node: shader(dustU(1), S.DUST_VERT, S.DUST_FRAG, true),
      sweep: shader({ uA: { value: 0 }, uC: { value: C(P.ice) } }, S.WORLD_VERT, S.SWEEP_FRAG, true),
      pillar: shader({ ...U, uA: { value: 0 }, uC: { value: C(P.red) } }, S.WORLD_VERT, S.PILLAR_FRAG, true),
      orb: shader({ ...U, uAmp: { value: 0.17 }, uFreq: { value: 1.1 }, uGlow: { value: 1 }, uEnergy: { value: 0.7 }, uSat: { value: 1 }, uPink: { value: C("#ff3fa4") }, uViolet: { value: C("#7b4dff") }, uDeep: { value: C("#8a1fc2") }, uAmber: { value: C("#ff8a3d") } }, ORB_VERT, ORB_FRAG),
      halo: shader({ uA: { value: 0 }, uC1: { value: C(P.pink) }, uC2: { value: C(P.violet) } }, S.WORLD_VERT, S.HALO_FRAG, true),
    };
  }, [gl, mobile]);

  useEffect(() => () => Object.values(m).forEach((x) => x instanceof THREE.Material || x instanceof THREE.BufferGeometry ? x.dispose() : null), [m]);

  useFrame((state, dt) => {
    t.current = THREE.MathUtils.damp(t.current, story.t, 4.5, Math.min(dt, 0.1));
    const tt = t.current;
    const e = state.clock.elapsedTime;
    m.U.uT.value = tt;
    m.U.uTime.value = e;

    // camera: along the path, a slow drift around the campus at the start, a nudge from the pointer
    const k = tt / CHAPTERS;
    CAM.getPoint(k, tmp.p);
    LOOK.getPoint(k, tmp.q);
    tmp.p.sub(tmp.q);
    if (size.width < size.height) tmp.p.multiplyScalar(1.65);
    tmp.p.applyAxisAngle(tmp.y, (1 - smooth(0, 1, tt)) * Math.sin(e * 0.09) * 0.4 + story.mx * 0.06);
    tmp.p.add(tmp.q);
    tmp.p.y += -story.my * 0.9;
    camera.position.copy(tmp.p);
    camera.lookAt(tmp.q);

    const o = smooth(6.0, 6.85, tt);
    if (orb.current && halo.current) {
      orb.current.visible = halo.current.visible = o > 0.002;
      orb.current.scale.setScalar(Math.max(o * 2.7, 0.001));
      orb.current.position.set(ORB[0], ORB[1] - (1 - o) * 4 + Math.sin(e * 0.8) * 0.15, ORB[2]);
      orb.current.rotation.y = e * 0.15;
      halo.current.position.copy(orb.current.position);
      halo.current.quaternion.copy(camera.quaternion);
      halo.current.scale.setScalar(o * 17);
      m.halo.uniforms.uA.value = o * 0.85;
    }
    const sk = Math.min(1, Math.max(0, (tt - 4.0) / 0.95));
    if (sweep.current) sweep.current.position.x = -6.5 + 13 * sk;
    m.sweep.uniforms.uA.value = Math.sin(Math.PI * sk);
    m.pillar.uniforms.uA.value = smooth(5.3, 5.45, tt) * (1 - smooth(5.95, 6.2, tt));

    // HTML labels follow their points in the scene
    for (const a of ANCHORS) {
      const el = story.anchors[a.id];
      if (!el) continue;
      const op = smooth(a.r[0], a.r[0] + 0.15, tt) * (1 - smooth(a.r[1] - 0.15, a.r[1], tt));
      tmp.v.set(a.p[0], a.p[1], a.p[2]).project(camera);
      if (op < 0.01 || tmp.v.z > 1) {
        el.style.opacity = "0";
        continue;
      }
      el.style.opacity = op.toFixed(3);
      el.style.transform = `translate3d(${((tmp.v.x * 0.5 + 0.5) * size.width).toFixed(1)}px,${((-tmp.v.y * 0.5 + 0.5) * size.height).toFixed(1)}px,0)`;
    }
  });

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} material={m.ground}>
        <planeGeometry args={[150, 150]} />
      </mesh>
      <mesh geometry={m.roadGeo} material={m.road} frustumCulled={false} />
      <mesh geometry={m.rooms} material={m.room} frustumCulled={false} />
      <lineSegments geometry={m.links} material={m.link} frustumCulled={false} />
      <points geometry={m.nodeGeo} material={m.node} frustumCulled={false} />
      <points geometry={m.dustGeo} material={m.dust} frustumCulled={false} />
      <mesh ref={sweep} position={[0, 6, 0]} rotation-y={Math.PI / 2} material={m.sweep}>
        <planeGeometry args={[4.5, 12]} />
      </mesh>
      <mesh position={[m.off.x, 13, m.off.z]} material={m.pillar}>
        <cylinderGeometry args={[2.4, 2.4, 26, 48, 1, true]} />
      </mesh>
      <mesh ref={halo} material={m.halo} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={orb} material={m.orb}>
        <sphereGeometry args={[1, mobile ? 64 : 128, mobile ? 48 : 96]} />
      </mesh>
    </>
  );
}

/** The landing's 3D world. It renders only while `active`, so it costs nothing once the story has scrolled away. */
export default function Scene({ mobile, active, onReady }: { mobile: boolean; active: boolean; onReady: () => void }) {
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, mobile ? 1.5 : 1.75]}
      gl={{ antialias: !mobile, powerPreference: "high-performance", alpha: false }}
      camera={{ fov: mobile ? 52 : 40, near: 0.1, far: 220, position: [27, 23, 31] }}
      onCreated={({ gl }) => {
        gl.setClearColor(P.night);
        onReady();
      }}
    >
      <World mobile={mobile} />
    </Canvas>
  );
}
