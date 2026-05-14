// Shared parsing helpers. Each adapter previously duplicated these because
// external APIs vary in casing/shape; centralizing keeps the lenient-coerce
// contract uniform: accept `unknown`, return `null` on anything we can't trust.

// Returns a Date when `s` is a non-empty string that parses to a finite time,
// else null. Lenient on input type so adapters can pass through whatever the
// upstream JSON parser produced without re-narrowing first.
export function parseGoodDate(s: unknown): Date | null {
  if (typeof s !== 'string' || s.length === 0) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}
