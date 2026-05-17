/**
 * lib/presence/count-language.ts — Phase 3B.1A
 *
 * Converts a raw presence count to atmospheric display copy.
 *
 * Rules (per spec):
 *   0       → '' (strip hidden by caller)
 *   1–12    → exact number + "listening"
 *   13–20   → "a dozen or so listening"
 *   21–50   → "scores listening"
 *   51–100  → "many listening"
 *   101–299 → "a crowd listening"
 *   300+    → "hundreds listening"
 *
 * The album remains protagonist; copy is understated.
 */

export function presenceCountLabel(n: number): string {
  if (n <= 0) return ''
  if (n === 1) return '1 listening'
  if (n <= 12) return `${n} listening`
  if (n <= 20) return 'a dozen or so listening'
  if (n <= 50) return 'scores listening'
  if (n <= 100) return 'many listening'
  if (n <= 299) return 'a crowd listening'
  return 'hundreds listening'
}
