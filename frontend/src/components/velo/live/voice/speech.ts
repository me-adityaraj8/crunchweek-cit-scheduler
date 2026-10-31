// Velo's reply as it should be spoken: typographic marks a voice reads badly made plain, and the text cut
// into pieces so the first sentence can play while the rest is still being voiced.

const FIRST_MAX = 70;
const MAX = 220;

export function speechText(text: string): string {
  return text
    .replace(/[  ]/g, " ")
    .replace(/[‐‑–]/g, "-")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\bP(\d+)\s*-\s*P(\d+)\b/g, "periods $1 to $2")
    .replace(/\bP(\d+)\b/g, "period $1")
    .replace(/\bperiods (\d+)\s*-\s*(\d+)\b/g, "periods $1 to $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cut a sentence longer than `max` at a comma, semicolon or colon, else at a space. */
function split(s: string, max: number): string[] {
  const out: string[] = [];
  while (s.length > max) {
    const head = s.slice(0, max);
    let i = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "));
    if (i < 20) i = head.lastIndexOf(" ") - 1;
    if (i < 1) i = max - 1;
    out.push(s.slice(0, i + 1).trim());
    s = s.slice(i + 1).trim();
  }
  if (s) out.push(s);
  return out;
}

/** Pieces to voice one after another: a short first one (so the voice starts quickly), then up to MAX each. */
export function speechChunks(text: string): string[] {
  const sentences = (text.trim().match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const sentence of sentences) {
    for (const p of split(sentence, chunks.length === 0 ? FIRST_MAX : MAX)) {
      const n = chunks.length;
      const cap = n === 1 ? FIRST_MAX : MAX;
      if (n > 0 && (n > 1 || chunks[0].length < 25) && chunks[n - 1].length + 1 + p.length <= cap) chunks[n - 1] += " " + p;
      else chunks.push(p);
    }
  }
  return chunks;
}
