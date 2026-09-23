// COUNCIL-2026-031 D5 — declares which product surfaces a test exercises.
//
// scripts/test-surface.mjs reads covers('…') string literals statically, so
// arguments must be plain string literals (not variables or templates).
// Surface ids come from `npm run test:surface -- --list`.
//
// Returns the first id so table-driven specs can tag and use a surface in one
// expression: { surface: covers('page:/admin/users'), … }.
export function covers(first: string, ...rest: string[]): string {
  void rest
  return first
}
