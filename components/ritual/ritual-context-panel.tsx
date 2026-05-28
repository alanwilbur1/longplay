'use client'

import { useState, useTransition } from 'react'
import { Textarea } from '@/components/ui/textarea'
import {
  joinRitualAction,
  markRitualCompletedAction,
  submitReflectionAction,
  updateReflectionAction,
} from '@/lib/actions/ritual'
import type {
  RitualCycleStatus,
  RitualParticipantState,
} from '@/lib/ritual/types'
import type { VisibleReflection } from '@/lib/data/ritual'

/**
 * components/ritual/ritual-context-panel.tsx — Phase 6B.2
 *
 * The calm editorial "This Week" surface. Rendered by the room
 * detail page from a server-loaded RoomRitualContext.
 *
 * Tone target: cinematic, contemplative, club-like. Avoids:
 *   - badges, streaks, counters with social weight
 *   - dopamine affordances (no "like", no "👏")
 *   - dashboard chrome (no progress bars, no metrics row)
 *
 * If the room has no active cycle, the panel returns a single
 * quiet line — "No ritual in this room yet." — and renders the
 * upcoming cycle preview when one exists. Sparsity over richness.
 */

export interface RitualContextPanelProps {
  active: {
    id: string
    cycle_status: RitualCycleStatus
    cycle_number: number
    starts_at: string
    lock_at: string
    reflection_opens_at: string
    reflection_closes_at: string
    artifact_album_id: string | null
  } | null
  upcoming: {
    id: string
    cycle_number: number
    starts_at: string
  } | null
  /** Caller participation in the ACTIVE cycle. */
  participation: {
    state: RitualParticipantState
    joined_at: string
    completed_at: string | null
    reflected_at: string | null
  } | null
  /** Reflections visible to the caller per the RLS-equivalent rules. */
  reflections: VisibleReflection[]
  /** Whether the caller is signed in. Drives whether write affordances render. */
  isAuthenticated: boolean
  /** Display label for the artifact this cycle revolves around.
   *  Server-side resolved to "Album Title — Artist". */
  artifactLabel: string | null
}

export function RitualContextPanel(props: RitualContextPanelProps) {
  const { active, upcoming, isAuthenticated } = props

  if (!active) {
    return (
      <section className="px-6 py-12 md:px-12 lg:px-24 border-t border-border/10">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-3">
          This Week
        </p>
        <p className="text-sm text-muted-foreground/70 italic">
          No ritual in this room yet.
        </p>
        {upcoming && (
          <p className="text-xs text-muted-foreground/50 mt-4">
            Next cycle begins {formatDate(upcoming.starts_at)}.
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="px-6 py-12 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-3xl mx-auto">
        <CycleHeader
          status={active.cycle_status}
          cycleNumber={active.cycle_number}
          startsAt={active.starts_at}
          reflectionOpensAt={active.reflection_opens_at}
          reflectionClosesAt={active.reflection_closes_at}
          artifactLabel={props.artifactLabel}
        />
        <ParticipationLine
          ritualCycleId={active.id}
          status={active.cycle_status}
          participation={props.participation}
          isAuthenticated={isAuthenticated}
        />
        <ReflectionSurface
          ritualCycleId={active.id}
          status={active.cycle_status}
          reflections={props.reflections}
          isAuthenticated={isAuthenticated}
          participantState={props.participation?.state ?? null}
        />
      </div>
    </section>
  )
}

// ── Header ──────────────────────────────────────────────────────────

function CycleHeader({
  status,
  cycleNumber,
  startsAt,
  reflectionOpensAt,
  reflectionClosesAt,
  artifactLabel,
}: {
  status: RitualCycleStatus
  cycleNumber: number
  startsAt: string
  reflectionOpensAt: string
  reflectionClosesAt: string
  artifactLabel: string | null
}) {
  const subline = (() => {
    switch (status) {
      case 'upcoming':
        return `Begins ${formatDate(startsAt)}.`
      case 'active':
        return `Reflection window opens ${formatDate(reflectionOpensAt)}.`
      case 'reflection':
        return `Reflections close ${formatDate(reflectionClosesAt)}.`
      case 'archived':
        return 'Archived.'
    }
  })()

  return (
    <header className="mb-10">
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-3">
        This Week · Cycle {cycleNumber}
      </p>
      {artifactLabel && (
        <h2 className="font-serif text-2xl md:text-3xl text-cream/90 leading-tight mb-3">
          {artifactLabel}
        </h2>
      )}
      <p className="text-sm text-tobacco/80">{subline}</p>
    </header>
  )
}

// ── Participation line ──────────────────────────────────────────────

function ParticipationLine({
  ritualCycleId,
  status,
  participation,
  isAuthenticated,
}: {
  ritualCycleId: string
  status: RitualCycleStatus
  participation: RitualContextPanelProps['participation']
  isAuthenticated: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!isAuthenticated) {
    // Quiet — no CTA shouting. Sign-in is available from nav.
    return null
  }

  const canJoin = !participation && (status === 'upcoming' || status === 'active')
  const canComplete =
    participation &&
    (participation.state === 'joined' || participation.state === 'listening') &&
    (status === 'active' || status === 'reflection')

  const handleJoin = () => {
    setError(null)
    startTransition(async () => {
      const r = await joinRitualAction(ritualCycleId)
      if (!r.ok) setError(r.error.message)
    })
  }
  const handleComplete = () => {
    setError(null)
    startTransition(async () => {
      const r = await markRitualCompletedAction(ritualCycleId)
      if (!r.ok) setError(r.error.message)
    })
  }

  return (
    <div className="mb-10 border-l border-tobacco/20 pl-5 py-1">
      <p className="text-[10px] uppercase tracking-[0.3em] text-tobacco/60 mb-2">
        Your participation
      </p>
      <p className="text-sm text-cream/70 mb-3">
        {!participation &&
          'You haven’t joined this week’s ritual yet.'}
        {participation?.state === 'joined' && 'Joined — listen this week.'}
        {participation?.state === 'listening' && 'Listening.'}
        {participation?.state === 'completed' &&
          'Completed. Reflect when you’re ready.'}
        {participation?.state === 'reflected' && 'You’ve reflected.'}
        {participation?.state === 'withdrawn' && 'Withdrawn from this cycle.'}
      </p>

      {canJoin && (
        <button
          type="button"
          onClick={handleJoin}
          disabled={isPending}
          className="text-xs text-tobacco hover:text-cream transition-colors disabled:opacity-50"
        >
          {isPending ? 'Joining…' : 'Join this week'}
        </button>
      )}
      {canComplete && (
        <button
          type="button"
          onClick={handleComplete}
          disabled={isPending}
          className="text-xs text-tobacco hover:text-cream transition-colors disabled:opacity-50 ml-1"
        >
          {isPending ? 'Marking…' : 'Mark complete'}
        </button>
      )}

      {error && (
        <p className="text-[10px] text-burgundy/80 mt-2">{error}</p>
      )}
    </div>
  )
}

// ── Reflection surface ──────────────────────────────────────────────

function ReflectionSurface({
  ritualCycleId,
  status,
  reflections,
  isAuthenticated,
  participantState,
}: {
  ritualCycleId: string
  status: RitualCycleStatus
  reflections: VisibleReflection[]
  isAuthenticated: boolean
  participantState: RitualParticipantState | null
}) {
  const ownReflections = reflections.filter((r) => r.is_own)
  const ownDraft = ownReflections.find((r) => r.reflection_state === 'draft')
  const ownPublished = ownReflections.find(
    (r) => r.reflection_state === 'published',
  )
  const peerReflections = reflections.filter((r) => !r.is_own)

  // Composer / read view selection
  const isReflectionWindow = status === 'reflection'
  const isArchived = status === 'archived'
  const showComposer =
    isAuthenticated && (status === 'active' || isReflectionWindow)

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.3em] text-tobacco/60 mb-3">
        Reflections
      </p>

      {showComposer && (
        <ReflectionComposer
          ritualCycleId={ritualCycleId}
          existingDraft={ownDraft ?? null}
          existingPublished={ownPublished ?? null}
          canPublish={isReflectionWindow}
          participantState={participantState}
        />
      )}

      {/* Peer reflections — only visible during reflection or archived */}
      {(isReflectionWindow || isArchived) && peerReflections.length > 0 && (
        <div className="mt-8 space-y-6">
          {peerReflections.map((r) => (
            <article
              key={r.id}
              className="border-l border-cream/10 pl-5 py-1"
            >
              <p className="text-[10px] text-muted-foreground/40 font-mono mb-1">
                {formatDate(r.created_at)}
              </p>
              <p className="font-serif text-base text-cream/80 leading-relaxed whitespace-pre-wrap">
                {r.body}
              </p>
            </article>
          ))}
        </div>
      )}

      {(isReflectionWindow || isArchived) &&
        peerReflections.length === 0 &&
        !ownPublished && (
          <p className="text-sm text-muted-foreground/40 italic mt-3">
            No reflections yet.
          </p>
        )}

      {status === 'upcoming' && (
        <p className="text-sm text-muted-foreground/40 italic">
          The ritual hasn’t started yet.
        </p>
      )}
    </div>
  )
}

// ── Composer ────────────────────────────────────────────────────────

function ReflectionComposer({
  ritualCycleId,
  existingDraft,
  existingPublished,
  canPublish,
  participantState,
}: {
  ritualCycleId: string
  existingDraft: VisibleReflection | null
  existingPublished: VisibleReflection | null
  canPublish: boolean
  participantState: RitualParticipantState | null
}) {
  // If user has a published reflection, render the published view
  // (read-only here; un-publish is a separate flow we don't expose
  // in this minimal first pass).
  if (existingPublished) {
    return (
      <article className="border-l border-tobacco/30 pl-5 py-1">
        <p className="text-[10px] uppercase tracking-[0.3em] text-tobacco/60 mb-2">
          Your reflection
        </p>
        <p className="font-serif text-base text-cream/80 leading-relaxed whitespace-pre-wrap">
          {existingPublished.body}
        </p>
      </article>
    )
  }

  // Otherwise show the composer, seeded with an existing draft if
  // there is one.
  return (
    <ComposerForm
      ritualCycleId={ritualCycleId}
      existingDraft={existingDraft}
      canPublish={canPublish}
      participantState={participantState}
    />
  )
}

function ComposerForm({
  ritualCycleId,
  existingDraft,
  canPublish,
  participantState,
}: {
  ritualCycleId: string
  existingDraft: VisibleReflection | null
  canPublish: boolean
  participantState: RitualParticipantState | null
}) {
  const [body, setBody] = useState(existingDraft?.body ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const handleSave = (publish: boolean) => {
    if (body.trim().length === 0) {
      setError('Write something first.')
      return
    }
    setError(null)
    startTransition(async () => {
      if (existingDraft) {
        // Update existing draft
        const r = await updateReflectionAction({
          reflectionId: existingDraft.id,
          body,
          transition: publish ? 'publish' : undefined,
        })
        if (!r.ok) setError(r.error.message)
        else setSavedAt(new Date().toISOString())
      } else {
        const r = await submitReflectionAction({
          ritualCycleId,
          body,
          asState: publish ? 'published' : 'draft',
        })
        if (!r.ok) setError(r.error.message)
        else setSavedAt(new Date().toISOString())
      }
    })
  }

  const placeholder = canPublish
    ? 'What did this listening leave you with?'
    : 'Draft your reflection. Shared with the room when the reflection window opens.'

  const cantPublishYet =
    !canPublish && participantState !== 'reflected'

  return (
    <div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={6}
        maxLength={8000}
        className="bg-card/30 border-border/20 font-serif text-base text-cream/90 placeholder:text-muted-foreground/30"
      />
      <div className="flex items-center justify-between mt-3">
        <p className="text-[10px] text-muted-foreground/40">
          {body.length} / 8000
          {savedAt && <span className="ml-3 text-olive/70">Saved.</span>}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={isPending || body.trim().length === 0}
            className="text-xs text-tobacco hover:text-cream transition-colors disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Save draft'}
          </button>
          {canPublish && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isPending || body.trim().length === 0}
              className="text-xs text-cream hover:text-burgundy transition-colors disabled:opacity-40"
            >
              {isPending ? 'Publishing…' : 'Publish'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-[10px] text-burgundy/80 mt-2">{error}</p>}
      {cantPublishYet && (
        <p className="text-[10px] text-muted-foreground/40 mt-2 italic">
          Drafts only — publish becomes available when the reflection window
          opens.
        </p>
      )}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}
