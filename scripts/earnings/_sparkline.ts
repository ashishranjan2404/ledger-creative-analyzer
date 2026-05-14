// Render a number array as an inline Unicode-block sparkline.
// 8 levels (eighths-block); NaN/Infinity → '·' gap marker.
const BLOCKS = '▁▂▃▄▅▆▇█'; // ▁▂▃▄▅▆▇█
const GAP = '·'; // ·
const MID = BLOCKS[Math.floor(BLOCKS.length / 2)] as string; // ▅

function isGap(n: number): boolean {
  return Number.isNaN(n) || !Number.isFinite(n);
}

export function sparkline(values: readonly number[]): string {
  if (values.length === 0) return '';
  const finite = values.filter((v) => !isGap(v));
  if (finite.length === 0) return GAP.repeat(values.length);
  let min = finite[0] as number;
  let max = min;
  for (const v of finite) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  const last = BLOCKS.length - 1;
  let out = '';
  for (const v of values) {
    if (isGap(v)) {
      out += GAP;
      continue;
    }
    const idx = span === 0 ? Math.floor(BLOCKS.length / 2) : Math.min(last, Math.floor(((v - min) / span) * BLOCKS.length));
    out += BLOCKS[idx] ?? MID;
  }
  return out;
}
