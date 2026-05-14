// Tiny deterministic-snapshot helper for renderer tests.
//
// Usage:
//   assertSnapshot(actual, 'render_tactical');
//
// File location: __tests__/snapshots/<name>.txt (committed alongside tests).
//
// To regenerate (after intentional renderer change): run the test suite with
//   UPDATE_SNAPSHOTS=1 node --test --experimental-strip-types __tests__/*.test.ts
// and review the diff before committing.
//
// On mismatch the assertion error includes a unified-ish diff line range so
// the operator can spot the divergence without re-running with the env var.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(HERE, 'snapshots');

function diffPreview(expected: string, actual: string): string {
  const a = expected.split('\n');
  const b = actual.split('\n');
  const n = Math.max(a.length, b.length);
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      lines.push(`L${i + 1}: expected ${JSON.stringify(a[i] ?? '')}`);
      lines.push(`L${i + 1}: actual   ${JSON.stringify(b[i] ?? '')}`);
      if (lines.length >= 6) break;
    }
  }
  return lines.join('\n');
}

export function assertSnapshot(actual: string, name: string): void {
  if (!existsSync(SNAP_DIR)) mkdirSync(SNAP_DIR, { recursive: true });
  const file = join(SNAP_DIR, `${name}.txt`);
  if (process.env.UPDATE_SNAPSHOTS === '1' || !existsSync(file)) {
    writeFileSync(file, actual, 'utf8');
    return;
  }
  const expected = readFileSync(file, 'utf8');
  if (expected === actual) return;
  assert.fail(
    `Snapshot mismatch for ${name}.\n` +
      `Run with UPDATE_SNAPSHOTS=1 to refresh after reviewing.\n` +
      `First differing lines:\n${diffPreview(expected, actual)}`,
  );
}
