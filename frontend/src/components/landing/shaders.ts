// GLSL for the landing scene. Everything moves on the GPU from one story clock (uT, 0..7), so the
// 144 rooms are one draw call and scrolling only changes a uniform.
import { NOISE } from "@/components/velo/live/shaders";

/* The rooms. Each one has a home in the campus, an exploded spot, a start slot (on top of another class
   for the clashes), a solved slot and a place after the repair. Its position is chained through those
   with staggered, arcing moves, and at the end it joins a ring around Velo. */
export const ROOM_VERT = /* glsl */ `
uniform float uT; uniform float uTime;
attribute vec3 aCampus; attribute vec3 aExplode; attribute vec3 aStart; attribute vec3 aFinal; attribute vec3 aRepair;
attribute vec4 aInfo; attribute float aIndex;
varying vec3 vLocal; varying vec3 vN; varying vec3 vWorld; varying vec4 vInfo;
varying float vGrid; varying float vRed; varying float vDissolve; varying float vHeal;
vec3 arc(vec3 a, vec3 b, float k, float h){ vec3 p = mix(a, b, k); p.y += sin(3.14159 * k) * h; return p; }
void main(){
  float seed = aInfo.x, clash = aInfo.y, off = aInfo.z, t = uT;
  float ex = smoothstep(1.0, 1.7, t) * (1.0 - smoothstep(2.0, 2.45, t));
  vec3 p = mix(aCampus, aExplode, ex);
  float g = smoothstep(2.05 + seed * 0.45, 2.5 + seed * 0.45, t);
  p = arc(p, aStart, g, 3.5);
  float s = smoothstep(4.05 + seed * 0.4, 4.45 + seed * 0.4, t);
  p = arc(p, aFinal, s * clash, 1.6);
  float c = smoothstep(5.0 + seed * 0.3, 5.32 + seed * 0.3, t);
  p = arc(p, aCampus, c, 4.0);
  float r = smoothstep(5.62 + seed * 0.22, 5.92 + seed * 0.22, t) * off;
  p.y -= off * 0.4 * smoothstep(5.32, 5.5, t) * (1.0 - r);
  p = arc(p, aRepair, r, 5.0);
  float v = smoothstep(6.0 + seed * 0.45, 6.6 + seed * 0.45, t);
  float ang = aIndex * 6.28318 + uTime * 0.22;
  vec3 ring = vec3(cos(ang) * 6.2, 9.0 + sin(aIndex * 25.13 + uTime * 0.9) * 0.55, sin(ang) * 6.2);
  p = arc(p, ring, v, 2.5);
  // clashing rooms shake until the solve takes them
  float cj = clash * smoothstep(2.95, 3.15, t) * (1.0 - s);
  p += cj * vec3(sin(uTime * 37.0 + seed * 50.0), cos(uTime * 29.0 + seed * 20.0), sin(uTime * 23.0 + seed * 7.0)) * 0.05;
  float grid = g * (1.0 - c);
  vec3 sc = mix(vec3(1.55, 1.0, 1.55), vec3(1.5, 0.78, 0.3), grid);
  sc *= mix(1.0, 0.34, v) * (1.0 + cj * 0.12 * sin(uTime * 14.0 + seed * 9.0));
  vec3 world = p + position * sc;
  vLocal = position; vN = normal; vWorld = world; vInfo = aInfo; vGrid = grid;
  vRed = clash * smoothstep(2.95, 3.12, t) * (1.0 - s) + off * smoothstep(5.3, 5.45, t) * (1.0 - r);
  vDissolve = clash * sin(3.14159 * s) + off * sin(3.14159 * r);
  vHeal = clash * s * (1.0 - smoothstep(4.95, 5.2, t)) + off * r * (1.0 - v);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

export const ROOM_FRAG = /* glsl */ `
uniform float uT; uniform float uTime;
uniform vec3 uKind[4]; uniform vec3 uRed; uniform vec3 uIce; uniform vec3 uSodium; uniform vec3 uFog;
varying vec3 vLocal; varying vec3 vN; varying vec3 vWorld; varying vec4 vInfo;
varying float vGrid; varying float vRed; varying float vDissolve; varying float vHeal;
${NOISE}
void main(){
  float n = snoise(vWorld * 2.6) * 0.5 + 0.5;
  float cut = n - vDissolve * 1.05;
  if (vDissolve > 0.01 && cut < 0.0) discard;
  vec3 N = normalize(vN);
  vec3 kind = uKind[int(vInfo.w)];
  vec2 uv = abs(N.y) > 0.5 ? vLocal.xz : (abs(N.x) > 0.5 ? vLocal.zy : vLocal.xy);
  vec2 e = abs(uv) * 2.0;
  float edge = smoothstep(0.84, 0.97, max(e.x, e.y));
  float light = 0.45 + 0.55 * max(dot(N, normalize(vec3(0.35, 0.8, 0.5))), 0.0);
  // the campus look: dark facades, a grid of windows, some lit in sodium and flickering now and then
  vec2 w = (uv + 0.5) * vec2(4.0, 3.0);
  vec2 cell = fract(w);
  float side = 1.0 - step(0.5, abs(N.y));
  float win = step(0.22, cell.x) * step(cell.x, 0.78) * step(0.28, cell.y) * step(cell.y, 0.72) * side;
  float h = fract(sin(dot(floor(w) + vInfo.x * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
  float lit = step(0.42, h) * (0.85 + 0.15 * sin(uTime * (1.0 + h * 3.0) + h * 40.0));
  vec3 campus = vec3(0.07, 0.062, 0.1) * light + win * lit * uSodium * 1.35 + win * 0.025 + edge * uIce * 0.16;
  campus += kind * 0.05 * (1.0 - side);
  // the timetable look: a glowing tile in its kind's colour with a bright rim
  vec3 tile = kind * (0.35 + 0.5 * light) + edge * mix(kind, vec3(1.0), 0.5) * 0.9;
  vec3 col = mix(campus, tile, vGrid);
  col = mix(col, uRed * (1.1 + 0.45 * sin(uTime * 16.0 + vInfo.x * 20.0)), vRed);
  col = mix(col, uIce * (0.6 + 0.5 * light) + edge * 0.8, vHeal * 0.75);
  if (vDissolve > 0.01) col += smoothstep(0.12, 0.0, cut) * uIce * 3.0;
  float d = length(cameraPosition - vWorld);
  col = mix(col, uFog, 1.0 - exp(-d * d * 0.00045));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export const WORLD_VERT = /* glsl */ `
varying vec3 vW; varying vec2 vUv;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

/* The ground: a blueprint grid that fades into the night, sonar rings in the opening, a scan ring as the
   solve runs, and a red zone around the closed building. */
export const GROUND_FRAG = /* glsl */ `
uniform float uT; uniform float uTime; uniform vec3 uFog; uniform vec3 uLine; uniform vec3 uIce; uniform vec3 uRed; uniform vec2 uOff;
varying vec3 vW;
float grid(vec2 p, float s, float w){ vec2 g = abs(fract(p / s - 0.5) - 0.5) * s; vec2 f = fwidth(p) * w; vec2 l = 1.0 - smoothstep(vec2(0.0), f, g); return max(l.x, l.y); }
void main(){
  float d = length(vW.xz);
  vec3 col = uFog + uLine * (grid(vW.xz, 1.75, 1.0) * 0.22 + grid(vW.xz, 7.0, 1.6) * 0.6) * exp(-d * 0.03);
  col += uLine * exp(-abs(d - mod(uTime * 7.0, 50.0)) * 0.7) * 0.5 * (1.0 - smoothstep(0.8, 1.6, uT));
  float k = clamp((uT - 4.0) / 1.0, 0.0, 1.0);
  col += uIce * exp(-abs(d - k * 42.0) * 1.1) * (1.0 - k) * step(0.001, k) * 0.9;
  float off = smoothstep(5.25, 5.4, uT) * (1.0 - smoothstep(5.95, 6.25, uT));
  float od = length(vW.xz - uOff);
  col += uRed * off * (exp(-od * 0.4) * 0.45 + exp(-abs(od - 3.2 - sin(uTime * 5.0) * 0.25) * 5.0) * 0.9);
  col = mix(col, uFog, smoothstep(24.0, 62.0, d));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/* Roads: ribbons on the ground with pulses running along them, brightest while the campus is on show. */
export const ROAD_VERT = /* glsl */ `
attribute vec2 aRoad; varying vec2 vRoad; varying vec3 vW;
void main(){ vRoad = aRoad; vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
export const ROAD_FRAG = /* glsl */ `
uniform float uT; uniform float uTime; uniform vec3 uA; uniform vec3 uB;
varying vec2 vRoad; varying vec3 vW;
void main(){
  float show = 0.22 + smoothstep(0.1, 0.7, uT) * (1.0 - smoothstep(1.9, 2.3, uT)) + smoothstep(5.0, 5.3, uT) * (1.0 - smoothstep(5.95, 6.2, uT)) * 1.3;
  float core = exp(-abs(vRoad.y) * 3.5);
  float f = fract(vRoad.x * 0.07 - uTime * 0.4);
  float pulse = smoothstep(0.0, 0.04, f) * (1.0 - smoothstep(0.04, 0.3, f));
  vec3 col = mix(uA, uB, 0.5 + 0.5 * sin(vRoad.x * 0.12)) * (core * 0.22 + pulse * core * 1.7) * show;
  col *= 1.0 - smoothstep(16.0, 28.0, length(vW.xz));
  gl_FragColor = vec4(col, 1.0);
}`;

/* Faculty-to-class links, drawn from the faculty end as the board fills. */
export const LINK_VERT = /* glsl */ `
attribute float aU; varying float vU;
void main(){ vU = aU; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
export const LINK_FRAG = /* glsl */ `
uniform float uT; uniform float uTime; uniform vec3 uC;
varying float vU;
void main(){
  float reveal = smoothstep(2.4, 3.0, uT);
  if (vU > reveal) discard;
  float fade = 1.0 - smoothstep(3.9, 4.3, uT);
  float pulse = exp(-abs(fract(vU - uTime * 0.6) - 0.5) * 12.0);
  gl_FragColor = vec4(uC * (0.12 + pulse * 0.5) * fade, 1.0);
}`;

/* Glowing points: dust drifting up through the campus, and the faculty nodes. The dust is drawn into a
   swirl around Velo at the end. */
export const DUST_VERT = /* glsl */ `
uniform float uT; uniform float uTime; uniform float uPix; uniform vec3 uOrb; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uMode;
attribute vec4 aSeed; varying vec3 vCol; varying float vA;
void main(){
  vec3 p = position;
  float a = 1.0;
  if (uMode < 0.5) {
    p.y = mod(position.y + uTime * (0.15 + aSeed.x * 0.4), 26.0);
    p.x += sin(uTime * 0.3 + aSeed.z * 6.28) * 0.8;
    float pull = smoothstep(5.85 + aSeed.x * 0.3, 6.8 + aSeed.x * 0.2, uT);
    float ang = aSeed.w * 6.28318 + uTime * (0.35 + aSeed.x * 0.5);
    vec3 swirl = uOrb + vec3(cos(ang), (aSeed.y - 0.5) * 0.9, sin(ang)) * (3.4 + aSeed.z * 5.5);
    p = mix(p, swirl, pull);
  } else {
    a = smoothstep(2.25, 2.7, uT) * (1.0 - smoothstep(3.95, 4.3, uT));
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uPix * (0.6 + aSeed.x * 1.7) * (30.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
  vCol = aSeed.y < 0.34 ? uC1 : (aSeed.y < 0.67 ? uC2 : uC3);
  vA = (0.3 + 0.7 * aSeed.z) * a;
}`;
export const DUST_FRAG = /* glsl */ `
varying vec3 vCol; varying float vA;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vCol * a * 1.6, 1.0); }`;

/* A sheet of light swept across the board as the solver runs. */
export const SWEEP_FRAG = /* glsl */ `
uniform float uA; uniform vec3 uC; varying vec2 vUv;
void main(){ float a = exp(-pow((vUv.x - 0.5) * 7.0, 2.0)) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y) * uA; gl_FragColor = vec4(uC * a * 1.4, 1.0); }`;

/* A red column of light over the closed building. */
export const PILLAR_FRAG = /* glsl */ `
uniform float uA; uniform float uTime; uniform vec3 uC; varying vec2 vUv;
void main(){ float a = pow(1.0 - vUv.y, 1.6) * (0.55 + 0.45 * sin(vUv.x * 70.0 + uTime * 4.0 - vUv.y * 9.0)) * uA; gl_FragColor = vec4(uC * a, 1.0); }`;

/* The soft glow behind Velo. */
export const HALO_FRAG = /* glsl */ `
uniform float uA; uniform vec3 uC1; uniform vec3 uC2; varying vec2 vUv;
void main(){ float d = length(vUv - 0.5) * 2.0; float a = exp(-d * d * 5.0) * uA; gl_FragColor = vec4(mix(uC1, uC2, d) * a, 1.0); }`;
