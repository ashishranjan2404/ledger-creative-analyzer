// Shared env-validation helper for routines. WHY aggregate-throw: one error
// message lists EVERY missing required var so an operator fixes all gaps
// in a single cron edit, not N retry rounds.

export function readRequiredEnv<K extends string>(
  keys: readonly K[],
  env: NodeJS.ProcessEnv = process.env,
): Record<K, string> {
  const out = {} as Record<K, string>;
  const missing: string[] = [];
  for (const k of keys) { const v = env[k]; if (!v) missing.push(k); else out[k] = v; }
  if (missing.length) throw new Error(`missing env var(s): ${missing.join(', ')}`);
  return out;
}

// Read optional env keys; absent keys produce no entries (caller can
// `?? null` or destructure with undefined-safe access).
export function readOptionalEnv<K extends string>(
  keys: readonly K[],
  env: NodeJS.ProcessEnv = process.env,
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const k of keys) { const v = env[k]; if (v) out[k] = v; }
  return out;
}
