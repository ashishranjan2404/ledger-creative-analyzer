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

// Parse a USD amount from JSON values that vary by upstream API:
//   - number: returned as-is when finite (NaN/Infinity ⇒ null)
//   - string: strip leading $ and thousands-separator commas, then parseFloat
//   - range string ("$1,001 - $15,000"): take the LOWER bound (conservative)
//   - anything else ⇒ null
// Returns null (not 0!) on failure so callers can distinguish "couldn't parse"
// from "legitimately zero". Centralized so adapters share the same semantics.
export function parseAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || v.length === 0) return null;
  // Range form ("$1,001 - $15,000" from PTRs) → take the lower bound.
  const dash = v.indexOf(' - ');
  const head = dash >= 0 ? v.slice(0, dash) : v;
  const cleaned = head.replace(/[$,\s]/g, '');
  if (cleaned.length === 0) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}
