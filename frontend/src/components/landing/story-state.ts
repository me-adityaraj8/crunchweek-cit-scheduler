/** Shared between the GSAP story and the 3D scene, read every frame, so it lives outside React state. */
export const CHAPTERS = 7;
export const story = {
  /** story time, 0..CHAPTERS: chapter i runs from i to i + 1 */
  t: 0,
  /** pointer, -1..1 */
  mx: 0,
  my: 0,
  anchors: {} as Record<string, HTMLElement | null>,
};

export const PALETTE = {
  night: "#08070d",
  chalk: "#f2eee6",
  sodium: "#ff8a3d",
  pink: "#ff3fa4",
  violet: "#7b4dff",
  ice: "#8ff3ff",
  red: "#ff2e4d",
  line: "#3b3560",
};
