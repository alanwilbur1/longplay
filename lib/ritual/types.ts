/**
 * lib/ritual/types.ts — Phase 6B.1
 *
 * Canonical TypeScript shapes for the ritual cadence substrate.
 * Mirrors the schema in supabase/migrations/0022_ritual_cadence_substrate.sql.
 *
 * These are application-level types — they intentionally don't carry
 * the full row shape from the generated Database type (which is
 * still out of date; tracked as a 6B-prep cleanup item). Field
 * additions go in BOTH places when the next regeneration happens.
 */

// ── Cycle lifecycle ────────────────────────────────────────────────

/**
 * Materialized status of a ritual cycle.
 *
 *   upcoming   — created; clock has not yet reached starts_at
 *   active     — starts_at ≤ now < reflection_opens_at
 *   reflection — reflection_opens_at ≤ now < reflection_closes_at
 *   archived   — now ≥ reflection_closes_at OR explicitly archived
 *
 * Transitions are clock-driven and idempotent. lib/ritual/lifecycle.ts
 * exposes the pure `computeCycleStatusForTime()` function that produces
 * this value from the cycle's timestamps + the current clock; the
 * sweep service writes it back when the persisted status drifts from
 * the time-derived status.
 */
export type RitualCycleStatus =
  | 'upcoming'
  | 'active'
  | 'reflection'
  | 'archived'

/**
 * Per-participant state inside a single ritual cycle. Distinct from
 * the cycle's own status — multiple participants in a cycle may sit
 * at different per-user states simultaneously.
 *
 *   joined      — opted in; no listening signal yet
 *   listening   — at least one listen_start observed
 *   completed   — listen_complete observed
 *   reflected   — completed + submitted a reflection
 *   withdrawn   — explicitly opted out (continuity preserved)
 */
export type RitualParticipantState =
  | 'joined'
  | 'listening'
  | 'completed'
  | 'reflected'
  | 'withdrawn'

/**
 * Reflection lifecycle.
 *
 *   draft     — author still composing; visible only to self
 *   published — visible per the cycle-status-gated peer policy
 *   archived  — author soft-removed; not rendered anywhere
 */
export type RitualReflectionState = 'draft' | 'published' | 'archived'

// ── Rows (mirror DB shape) ─────────────────────────────────────────

export interface RitualCycleRow {
  id: string
  room_id: string
  artifact_album_id: string | null
  legacy_cycle_id: string | null
  ritual_type: string
  cycle_number: number
  starts_at: string
  lock_at: string
  reflection_opens_at: string
  reflection_closes_at: string
  archived_at: string | null
  cycle_status: RitualCycleStatus
  created_at: string
  updated_at: string
}

export interface RitualParticipantRow {
  ritual_cycle_id: string
  user_id: string
  joined_at: string
  completed_at: string | null
  reflected_at: string | null
  last_activity_at: string
  participation_state: RitualParticipantState
  completion_percent: number | null
  created_at: string
  updated_at: string
}

export interface RitualReflectionRow {
  id: string
  ritual_cycle_id: string
  user_id: string
  body: string
  reflection_state: RitualReflectionState
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface RitualPresenceEventRow {
  id: string
  ritual_cycle_id: string
  user_id: string
  event_type: string
  metadata: Record<string, unknown>
  created_at: string
}

// ── Service inputs / aggregates ────────────────────────────────────

export interface RitualCycleWindow {
  starts_at: string
  lock_at: string
  reflection_opens_at: string
  reflection_closes_at: string
}

export interface RitualCycleSummary {
  cycle: RitualCycleRow
  participant_counts: {
    joined: number
    listening: number
    completed: number
    reflected: number
    withdrawn: number
  }
  reflection_counts: {
    published: number
    draft: number
  }
}

export interface ParticipationSnapshot {
  cycle_id: string
  user_id: string
  state: RitualParticipantState
  joined_at: string
  completed_at: string | null
  reflected_at: string | null
  completion_percent: number | null
}

/**
 * Canonical event vocabulary for ritual_presence_events. Open enum —
 * the schema allows arbitrary strings (length-bounded) so new event
 * kinds can be added without a migration. This constant is the
 * known-good set used by the services; ad-hoc strings persisted
 * outside this list are tolerated but not blessed.
 */
export const RITUAL_PRESENCE_EVENT_TYPES = [
  'joined',
  'listening_started',
  'listening_completed',
  'reflection_submitted',
  'reflection_updated',
  'revisited',
  'withdrew',
] as const

export type KnownRitualPresenceEventType =
  (typeof RITUAL_PRESENCE_EVENT_TYPES)[number]
