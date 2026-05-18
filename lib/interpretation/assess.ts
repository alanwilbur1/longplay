/**
 * lib/interpretation/assess.ts — Phase 3G
 *
 * The single gatekeeper function. Every observation the product
 * surfaces passes through here. There is no other path to publish.
 *
 * Usage:
 *   const a = assess('room-tendency', { roomReturnsLifetime: 7, cyclesParticipated: 3 })
 *   if (!a.eligible) return null  // surface stays silent
 *   // ... render the line, optionally with uncertainty language
 *
 * This file is intentionally tiny. The rules live in thresholds.ts.
 * The language lives in language.ts. This module exists so future
 * developers reading the codebase find a single, obvious entry point
 * for "when is the system allowed to say X?".
 */

import { RULES } from './thresholds'
import type {
  Assessment,
  Evidence,
  ObservationKind,
  FactKind,
  InterpretationKind,
} from './types'

export function assess(kind: ObservationKind, evidence: Evidence): Assessment {
  const rule = RULES[kind]
  if (!rule) {
    // Unknown kind → treat as insufficient. Defensive default.
    return {
      confidence: 'insufficient',
      eligible: false,
      reason: 'unknown-observation-kind',
    }
  }
  return rule(evidence)
}

// ── Convenience predicates ──────────────────────────────────────────────────
// Sugar over `assess(...).eligible` so callers don't need to destructure
// when they only care about the gate decision.

export function isEligible(kind: ObservationKind, evidence: Evidence): boolean {
  return assess(kind, evidence).eligible
}

// ── Category helpers ────────────────────────────────────────────────────────
// Surfaces sometimes want to know "is this a fact or an interpretation"
// without referencing the kind string directly. These helpers exist so
// the category mapping stays in one place.

const FACT_KINDS: ReadonlySet<FactKind> = new Set([
  'cycle-moment-count',
  'cycle-return-count',
  'archive-timespan',
  'archive-trace-count',
])

const INTERPRETATION_KINDS: ReadonlySet<InterpretationKind> = new Set([
  'room-tendency',
  'cross-room-pattern',
  'temporal-pattern',
  'identity-trait',
  'compatibility-observation',
  'resurfacing-candidate',
  'room-culture-evolution',
  'album-recurrence',
  'room-persistence',
  'room-pace-shift',
  'room-marking-character',
  'room-return-character',
])

export function isFactKind(kind: ObservationKind): kind is FactKind {
  return FACT_KINDS.has(kind as FactKind)
}

export function isInterpretationKind(kind: ObservationKind): kind is InterpretationKind {
  return INTERPRETATION_KINDS.has(kind as InterpretationKind)
}
