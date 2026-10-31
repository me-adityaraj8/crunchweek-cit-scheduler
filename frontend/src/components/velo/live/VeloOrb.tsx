import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ExpressionController, type Mood } from "./expression";
import { EYE_FRAG, HALO_FRAG, HALO_VERT, ORB_FRAG, ORB_VERT, PARTICLE_FRAG, PARTICLE_VERT, RING_FRAG } from "./shaders";

export type OrbSize = "mini" | "panel" | "stage";

export interface VeloOrbProps {
  mood: Mood;
  /** live audio level 0..1, read every frame (mic while listening, Velo's voice while speaking) */
  level?: () => number;
  size: OrbSize;
  reduced?: boolean;
  className?: string;
}

// pink-led, like the reference: hot pink and magenta, violet on one flank, amber low on the other
const C = {
  pink: new THREE.Color("#ff3fa4"),
  violet: new THREE.Color("#7b4dff"),
  deep: new THREE.Color("#8a1fc2"),
  amber: new THREE.Color("#ff8a3d"),
};
// mesh detail by size: a 36 px launcher doesn't need the stage's 15k vertices
const SEGMENTS: Record<OrbSize, [number, number]> = { mini: [40, 28], panel: [72, 48], stage: [144, 108] };
const CAMERA: Record<OrbSize, number> = { mini: 3.7, panel: 4.6, stage: 7.4 };

function Eye({ side, ctrl, mini }: { side: -1 | 1; ctrl: ExpressionController; mini: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({ uOpen: { value: 1 }, uHappy: { value: 0 }, uFlat: { value: 0 }, uSquint: { value: 0 }, uTilt: { value: 0 } }), []);
  useFrame(() => {
    const f = ctrl.face;
    const m = mesh.current;
    if (!m) return;
    const tiltLift = side * f.tilt * 0.35;
    m.position.set(side * 0.29 + f.lookX * 0.14, 0.13 + f.lookY * 0.12 + tiltLift, 1.06);
    m.scale.setScalar(f.eye * (mini ? 1.55 : 1.22));
    uniforms.uOpen.value = f.open;
    uniforms.uHappy.value = f.happy;
    uniforms.uFlat.value = f.flat;
    uniforms.uSquint.value = side < 0 ? f.squintL : f.squintR;
    uniforms.uTilt.value = f.tilt;
  });
  return (
    <mesh ref={mesh} renderOrder={3}>
      <planeGeometry args={[0.44, 0.44]} />
      <shaderMaterial vertexShader={HALO_VERT} fragmentShader={EYE_FRAG} uniforms={uniforms} transparent depthTest={false} depthWrite={false} />
    </mesh>
  );
}

function Rings({ level, clock }: { level: () => number; clock: { t: number } }) {
  const group = useRef<THREE.Group>(null);
  const rings = useMemo(
    () =>
      [1.62, 1.86, 2.12].map((r, i) => ({
        r,
        tilt: [0.35 + i * 0.4, i * 0.6, 0.2 * i] as const,
        uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uPink: { value: C.pink }, uViolet: { value: C.violet }, uSeed: { value: i * 0.7 } },
      })),
    [],
  );
  useFrame(() => {
    const lv = level();
    group.current?.children.forEach((m, i) => {
      m.rotation.z = clock.t * (0.12 + i * 0.05) * (i % 2 ? -1 : 1);
      m.rotation.x = rings[i].tilt[0] + Math.sin(clock.t * 0.3 + i) * 0.12;
      m.scale.setScalar(1 + lv * 0.06 * (i + 1));
    });
    for (const r of rings) {
      r.uniforms.uTime.value = clock.t;
      r.uniforms.uLevel.value = lv;
    }
  });
  return (
    <group ref={group}>
      {rings.map((r, i) => (
        <mesh key={i} rotation={[r.tilt[0], r.tilt[1], r.tilt[2]]} renderOrder={1}>
          <torusGeometry args={[r.r, 0.007, 6, 220]} />
          <shaderMaterial vertexShader={HALO_VERT} fragmentShader={RING_FRAG} uniforms={r.uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

function Particles({ level, clock }: { level: () => number; clock: { t: number } }) {
  const dpr = useThree((s) => s.viewport.dpr);
  const { positions, seeds } = useMemo(() => {
    const n = 700;
    const positions = new Float32Array(n * 3);
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = 1.7 + Math.random() * 1.6;
      const s = Math.sqrt(1 - u * u);
      positions.set([r * s * Math.cos(a), r * u * 0.8, r * s * Math.sin(a)], i * 3);
      seeds[i] = Math.random();
    }
    return { positions, seeds };
  }, []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uLevel: { value: 0 }, uSize: { value: 22 }, uPink: { value: C.pink }, uViolet: { value: C.violet } }), []);
  useFrame(() => {
    uniforms.uTime.value = clock.t;
    uniforms.uLevel.value = level();
    uniforms.uSize.value = 22 * dpr;
  });
  return (
    <points renderOrder={0}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
      </bufferGeometry>
      <shaderMaterial vertexShader={PARTICLE_VERT} fragmentShader={PARTICLE_FRAG} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Scene({ mood, level, size, reduced }: Required<Pick<VeloOrbProps, "mood" | "size">> & { level: () => number; reduced: boolean }) {
  const ctrl = useMemo(() => new ExpressionController(Math.random, reduced), [reduced]);
  const invalidate = useThree((s) => s.invalidate);
  const body = useRef<THREE.Group>(null);
  const clock = useRef({ t: Math.random() * 10 });
  const orb = useMemo(
    () => ({
      uTime: { value: 0 }, uAmp: { value: 0.09 }, uFreq: { value: 1.1 }, uGlow: { value: 0.35 }, uEnergy: { value: 0.2 }, uSat: { value: 1 },
      uPink: { value: C.pink }, uViolet: { value: C.violet }, uDeep: { value: C.deep }, uAmber: { value: C.amber },
    }),
    [],
  );
  const halo = useMemo(() => ({ uGlow: { value: 0.35 }, uTime: { value: 0 }, uPink: { value: C.pink }, uViolet: { value: C.violet }, uStrength: { value: size === "stage" ? 1.4 : 1 } }), [size]);

  useEffect(() => {
    ctrl.setMood(mood);
    invalidate();
  }, [ctrl, mood, invalidate]);

  useFrame((_, dt) => {
    const f = ctrl.update(Math.min(dt, 0.05), level());
    clock.current.t += Math.min(dt, 0.05) * (reduced ? 0 : f.speed);
    const t = clock.current.t;
    orb.uTime.value = t;
    orb.uAmp.value = f.amp;
    orb.uFreq.value = f.freq;
    orb.uGlow.value = f.glow;
    orb.uEnergy.value = f.energy;
    orb.uSat.value = f.sat;
    halo.uGlow.value = f.glow;
    halo.uTime.value = t;
    const g = body.current;
    if (g) {
      g.position.set(f.shakeX, reduced ? 0 : Math.sin(t * 1.9) * f.float * 0.6, 0);
      g.scale.setScalar(1 + (reduced ? 0 : Math.sin(t * 2.6) * f.breath));
    }
  });

  const [w, h] = SEGMENTS[size];
  return (
    <>
      <mesh position={[0, 0, -1.2]} renderOrder={0}>
        <planeGeometry args={[size === "stage" ? 6.5 : 3.6, size === "stage" ? 6.5 : 3.6]} />
        <shaderMaterial vertexShader={HALO_VERT} fragmentShader={HALO_FRAG} uniforms={halo} transparent depthWrite={false} />
      </mesh>
      {size === "stage" && (
        <>
          <Particles level={level} clock={clock.current} />
          <Rings level={level} clock={clock.current} />
        </>
      )}
      <group ref={body}>
        <mesh renderOrder={2}>
          <sphereGeometry args={[1, w, h]} />
          <shaderMaterial vertexShader={ORB_VERT} fragmentShader={ORB_FRAG} uniforms={orb} />
        </mesh>
        <Eye side={-1} ctrl={ctrl} mini={size === "mini"} />
        <Eye side={1} ctrl={ctrl} mini={size === "mini"} />
      </group>
    </>
  );
}

const silent = () => 0;

/** Velo's orb. Load it lazily (OrbView does); three.js is only fetched when Velo is first shown. */
export default function VeloOrb({ mood, level = silent, size, reduced = false, className }: VeloOrbProps) {
  return (
    <Canvas
      className={className}
      dpr={[1, size === "stage" ? 1.75 : 2]}
      camera={{ position: [0, 0, CAMERA[size]], fov: 35 }}
      gl={{ alpha: true, antialias: true, powerPreference: size === "stage" ? "high-performance" : "low-power" }}
      frameloop={reduced ? "demand" : "always"}
      aria-hidden
    >
      <Scene mood={mood} level={level} size={size} reduced={reduced} />
    </Canvas>
  );
}
