'use client'

import { useState, useTransition } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { AlbumCover } from '@/components/album-cover'
import { cn } from '@/lib/utils'
import {
  joinRitualAction,
  markRitualCompletedAction,
  submitReflectionAction,
  updateReflectionAction,
} from '@/lib/actions/ritual'
import { relativeDaysUntil } from '@/lib/ritual/observations'
import type {
  RitualCycleStatus,
  RitualParticipantState,
} from '@/lib/ritual/types'
import type { VisibleReflection } from '@/lib/data/ritual'
import { ListeningSurface } from './listening-surface'
import { TracklistSurface } from './tracklist-surface'

/**
 * components/ritual/ritual-context-panel.tsx — Phase 6B.2 (refined)
 *
 * The weekly ritual hero. Two-column composition centered on the
 * album as the visual anchor; participation, reflection, and
 * prompts compose on the right. Designed to be the emotional
 * centerpiece of the room page, not a widget appended to it.
 *
 * Tone target: boutique listening ceremony, restrained editorial,
 * Criterion Channel composition. No badges, no progress bars, no
 * cards, no SaaS chrome. Negative space used as a pause, not a void.
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
  participation: {
    state: RitualParticipantState
    joined_at: string
    completed_at: string | null
    reflected_at: string | null
  } | null
  reflections: VisibleReflection[]
  isAuthenticated: boolean
  /** Album artifact for the active cycle. The hero anchors visually
   *  on `cover`; the text columns flow from `title`/`artist`/`year`. */
  artifact: {
    cover: string | null
    title: string | null
    artist: string | null
    year: string | null
  }
  /** Room prompts for the active cycle. Rendered inline in the hero
   *  rather than as a separate "Listening Prompts" section. */
  prompts: ReadonlyArray<{ question: string; hint: string }>
  /** Streaming destinations for the artifact. Rendered as restrained
   *  text pills in the hero, below the album metadata. */
  streamingLinks: {
    spotify: string | null
    appleMusic: string | null
    tidal: string | null
  }
  /** Room visual treatment. Carries through the borderTint /
   *  primaryAccent classes the rest of the room screen uses, so the
   *  hero composes with — rather than against — the room's identity. */
  aesthetics: {
    borderTint: string
    primaryAccent: string
  }
  /** Short room atmosphere line (single phrase). Rendered as a small
   *  ceremonial subtitle below the artist line. */
  roomAtmosphere: string | null
  /** Room slug, used by the embedded ListeningSurface for continuity
   *  state (localStorage keyed by room). */
  roomSlug: string
  /** Spotify album ID parsed from streamingLinks.spotify URL by the
   *  server panel. Null when no Spotify URL is available — the
   *  ListeningSurface falls back to an Apple Music line. */
  spotifyAlbumId: string | null
  /** Phase 6B.5: real per-album track rows pre-fetched server-side
   *  from album_tracks (migration 0023). Empty array when no rows
   *  are hydrated yet — the TracklistSurface renders its restrained
   *  fallback line in that case. */
  tracklist: ReadonlyArray<{
    number: number
    title: string
    duration: string | null
  }>
  /** Phase 6B.4B: the same album_tracks rows, but carrying the raw
   *  duration + Spotify track id, so the album-first in-room player
   *  can render the tracklist, highlight the current track, and play
   *  from any track (offset). Empty when no rows are hydrated — the
   *  player then fetches the tracklist itself with the user token. */
  playerTracks: ReadonlyArray<{
    number: number
    title: string
    durationMs: number | null
    spotifyTrackId: string
  }>
}

export function RitualContextPanel(props: RitualContextPanelProps) {
  const { active, upcoming, isAuthenticated, artifact, aesthetics } = props

  // No active cycle → quiet single-line state. We do NOT render a
  // bulky empty section; the room screen still has plenty of editorial
  // content. Just an honest one-line state plus the upcoming hint
  // when there's a real future cycle.
  if (!active) {
    return (
      <section
        className={cn(
          'px-6 py-12 md:px-12 lg:px-24 border-t',
          aesthetics.borderTint,
        )}
      >
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
    <section
      className={cn(
        'px-6 py-14 md:px-12 lg:px-24 md:py-20 border-t',
        aesthetics.borderTint,
      )}
    >
      {/* Hero composition. Symmetric column gap, generous on desktop,
          stacks on mobile. No card wrapper — uses the room's own
          ambient background. */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-12 md:gap-16 items-start max-w-6xl">
        <LeftColumn
          active={active}
          artifact={artifact}
          streamingLinks={props.streamingLinks}
          aesthetics={aesthetics}
          roomAtmosphere={props.roomAtmosphere}
          roomSlug={props.roomSlug}
          spotifyAlbumId={props.spotifyAlbumId}
          tracklist={props.tracklist}
          playerTracks={props.playerTracks}
        />
        <RightColumn
          ritualCycleId={active.id}
          status={active.cycle_status}
          reflectionOpensAt={active.reflection_opens_at}
          reflectionClosesAt={active.reflection_closes_at}
          participation={props.participation}
          reflections={props.reflections}
          prompts={props.prompts}
          isAuthenticated={isAuthenticated}
          aesthetics={aesthetics}
        />
      </div>
    </section>
  )
}

// ── Left column: artifact anchor ───────────────────────────────────

function LeftColumn({
  active,
  artifact,
  streamingLinks,
  aesthetics,
  roomAtmosphere,
  roomSlug,
  spotifyAlbumId,
  tracklist,
  playerTracks,
}: {
  active: NonNullable<RitualContextPanelProps['active']>
  artifact: RitualContextPanelProps['artifact']
  streamingLinks: RitualContextPanelProps['streamingLinks']
  aesthetics: RitualContextPanelProps['aesthetics']
  roomAtmosphere: string | null
  roomSlug: string
  spotifyAlbumId: string | null
  tracklist: RitualContextPanelProps['tracklist']
  playerTracks: RitualContextPanelProps['playerTracks']
}) {
  const statusLabel = (() => {
    switch (active.cycle_status) {
      case 'upcoming':
        return 'Upcoming'
      case 'active':
        return 'In session'
      case 'reflection':
        return 'Reflection window'
      case 'archived':
        return 'Archived'
    }
  })()

  return (
    <div>
      {/* Cycle line — tiny, mono, sets the editorial register. */}
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-6">
        Cycle {active.cycle_number}
        <span className="mx-2 text-muted-foreground/30">·</span>
        <span className={aesthetics.primaryAccent}>{statusLabel}</span>
      </p>

      {/* Album artifact — the visual anchor. Square, generous max
          width, faint ambient glow to lift it from the page. */}
      {artifact.cover && (
        <div className="relative w-full max-w-md mb-8">
          <div
            className={cn(
              'absolute inset-0 blur-3xl -z-10 opacity-30',
              aesthetics.primaryAccent
                .replace('text-', 'bg-')
                .replace('/70', '/20')
                .replace('/80', '/20'),
            )}
          />
          <AlbumCover
            src={artifact.cover}
            alt={artifact.title ?? 'Album cover'}
            title={artifact.title ?? ''}
            artist={artifact.artist ?? ''}
            className="w-full aspect-square shadow-2xl"
          />
        </div>
      )}

      {/* Title — generous serif. */}
      {artifact.title && (
        <h2 className="font-serif text-3xl md:text-4xl text-cream leading-[1.15] tracking-tight mb-3">
          {artifact.title}
        </h2>
      )}

      {/* Artist + year — single understated line. */}
      {artifact.artist && (
        <p className="text-base text-muted-foreground mb-2">
          {artifact.artist}
          {artifact.year && (
            <>
              <span className="mx-2 text-muted-foreground/30">·</span>
              <span className="text-muted-foreground/60">{artifact.year}</span>
            </>
          )}
        </p>
      )}

      {/* Atmosphere — short ceremonial phrase. */}
      {roomAtmosphere && (
        <p
          className={cn(
            'text-xs italic mt-1 mb-6',
            aesthetics.primaryAccent,
            'opacity-80',
          )}
        >
          {roomAtmosphere}
        </p>
      )}

      {/* Phase 6B.4: embedded ritual listening. ListeningSurface
          handles Spotify embed + Apple Music micro-link + continuity
          state ("Begin when you're ready" / "Continue listening").
          Renders nothing when no streaming link is available. */}
      {/* Phase 6B.4 / 6B.4B: embedded ritual listening. When a Spotify
          album ID is present, ListeningSurface renders the album-first
          InRoomSpotifyPlayer, which OWNS the tracklist (renders it,
          highlights the playing track, plays from any track). We pass
          the DB album_tracks through as the player's fast path. */}
      <ListeningSurface
        roomSlug={roomSlug}
        spotifyAlbumId={spotifyAlbumId}
        appleMusicUrl={streamingLinks.appleMusic ?? null}
        ritualCycleId={active.id}
        albumKey={active.artifact_album_id ?? roomSlug}
        playerTracks={playerTracks}
        aesthetics={aesthetics}
      />

      {/* Tracklist surface. Only rendered when there is NO Spotify
          player (no album ID) — otherwise the album-first player above
          already shows the full, interactive tracklist and a second
          static list would be redundant. This remains the restrained
          fallback for rooms without a Spotify album. */}
      {spotifyAlbumId === null && (
        <TracklistSurface
          tracks={tracklist.length > 0 ? tracklist : null}
          embedPresent={false}
          aesthetics={aesthetics}
        />
      )}

      {/* Any other streaming destinations (e.g. TIDAL) — kept as a
          single quiet line below the surface for completeness. */}
      {streamingLinks.tidal && (
        <div className="mt-3">
          <a
            href={streamingLinks.tidal}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors',
            )}
          >
            TIDAL
          </a>
        </div>
      )}
    </div>
  )
}

// Phase 6B.4: the legacy StreamingRow has been folded into the
// ListeningSurface (Spotify embed + Apple Music micro-link) plus a
// single TIDAL anchor below it. The standalone row component is no
// longer needed.

// ── Right column: ceremony ─────────────────────────────────────────

function RightColumn({
  ritualCycleId,
  status,
  reflectionOpensAt,
  reflectionClosesAt,
  participation,
  reflections,
  prompts,
  isAuthenticated,
  aesthetics,
}: {
  ritualCycleId: string
  status: RitualCycleStatus
  reflectionOpensAt: string
  reflectionClosesAt: string
  participation: RitualContextPanelProps['participation']
  reflections: RitualContextPanelProps['reflections']
  prompts: RitualContextPanelProps['prompts']
  isAuthenticated: boolean
  aesthetics: RitualContextPanelProps['aesthetics']
}) {
  const windowLine = (() => {
    switch (status) {
      case 'upcoming':
        return null
      case 'active': {
        const rel = relativeDaysUntil(reflectionOpensAt)
        const date = formatDate(reflectionOpensAt)
        return rel
          ? `Reflection window opens ${rel} · ${date}.`
          : `Reflection window opens ${date}.`
      }
      case 'reflection': {
        const rel = relativeDaysUntil(reflectionClosesAt)
        const date = formatDate(reflectionClosesAt)
        return rel
          ? `Reflections close ${rel} · ${date}.`
          : `Reflections close ${date}.`
      }
      case 'archived':
        return 'This cycle is archived.'
    }
  })()

  return (
    <div>
      {/* Ceremonial title — small uppercase, sets the right column
          register. Mirrors the left column's eyebrow line. */}
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-3">
        This Week’s Ritual
      </p>

      {/* Window timing — one-line, no countdown. Editorial, not
          urgent. */}
      {windowLine && (
        <p className={cn('text-sm mb-10', aesthetics.primaryAccent)}>
          {windowLine}
        </p>
      )}

      <ParticipationBlock
        ritualCycleId={ritualCycleId}
        status={status}
        participation={participation}
        isAuthenticated={isAuthenticated}
        aesthetics={aesthetics}
      />

      <ReflectionBlock
        ritualCycleId={ritualCycleId}
        status={status}
        reflections={reflections}
        isAuthenticated={isAuthenticated}
        participantState={participation?.state ?? null}
        aesthetics={aesthetics}
      />

      <PromptsBlock prompts={prompts} aesthetics={aesthetics} />
    </div>
  )
}

// ── Participation block ────────────────────────────────────────────

function ParticipationBlock({
  ritualCycleId,
  status,
  participation,
  isAuthenticated,
  aesthetics,
}: {
  ritualCycleId: string
  status: RitualCycleStatus
  participation: RitualContextPanelProps['participation']
  isAuthenticated: boolean
  aesthetics: RitualContextPanelProps['aesthetics']
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!isAuthenticated) {
    return null
  }

  const canJoin =
    !participation && (status === 'upcoming' || status === 'active')
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

  const stateCopy = (() => {
    if (!participation) return 'You haven’t joined this week’s ritual yet.'
    switch (participation.state) {
      case 'joined':
        return 'Joined. Listen at your own pace this week.'
      case 'listening':
        return 'Listening.'
      case 'completed':
        return 'Completed. Reflect when you’re ready.'
      case 'reflected':
        return 'You’ve reflected.'
      case 'withdrawn':
        return 'Withdrawn from this cycle.'
    }
  })()

  return (
    <div
      className={cn(
        'border-l pl-5 py-1 mb-10',
        aesthetics.borderTint.replace('border-', 'border-'),
      )}
    >
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-2">
        Your participation
      </p>
      <p className="font-serif text-base text-cream/80 leading-relaxed mb-3">
        {stateCopy}
      </p>

      {/* Phase 6B.3: typographic progression. NOT a progress bar.
          A row of small ritual labels — the current one accented,
          the rest faded. No percentages, no badges, no streaks.
          The labels themselves ARE the indicator. */}
      <ParticipationProgression
        currentState={participation?.state ?? null}
        aesthetics={aesthetics}
      />

      {(canJoin || canComplete) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4">
          {canJoin && (
            <button
              type="button"
              onClick={handleJoin}
              disabled={isPending}
              className={cn(
                'text-sm transition-colors disabled:opacity-50',
                'text-cream hover:opacity-80',
              )}
            >
              {isPending ? 'Joining…' : 'Join this week'}
            </button>
          )}
          {canComplete && (
            <button
              type="button"
              onClick={handleComplete}
              disabled={isPending}
              className="text-sm text-muted-foreground hover:text-cream transition-colors disabled:opacity-50"
            >
              {isPending ? 'Marking…' : 'Mark complete'}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-[10px] text-burgundy/80 mt-2">{error}</p>
      )}
    </div>
  )
}

const PROGRESSION_STAGES: ReadonlyArray<{
  state: RitualParticipantState | 'none'
  label: string
}> = [
  { state: 'none', label: 'invited' },
  { state: 'joined', label: 'joined' },
  { state: 'listening', label: 'listening' },
  { state: 'completed', label: 'completed' },
  { state: 'reflected', label: 'reflected' },
]

function ParticipationProgression({
  currentState,
  aesthetics,
}: {
  currentState: RitualParticipantState | null
  aesthetics: RitualContextPanelProps['aesthetics']
}) {
  // Withdrawn is a sink — render as a single quiet line rather than
  // the progression row, so the ritual labels don't mislead.
  if (currentState === 'withdrawn') {
    return (
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/40 mt-2">
        — withdrawn —
      </p>
    )
  }

  // Index of the listener's current stage in the progression. Stages
  // before that index are "completed"; stage at index is "current";
  // stages after are "future".
  const currentIndex =
    currentState === null
      ? 0
      : PROGRESSION_STAGES.findIndex((s) => s.state === currentState)
  const safeIndex = currentIndex < 0 ? 0 : currentIndex

  return (
    <div
      role="group"
      aria-label="Ritual participation progression"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 font-mono text-[10px] uppercase tracking-[0.25em]"
    >
      {PROGRESSION_STAGES.map((stage, i) => {
        const isCurrent = i === safeIndex
        const isPast = i < safeIndex
        return (
          <span key={stage.label} className="flex items-center">
            <span
              aria-hidden
              className={cn(
                'inline-block mr-2 leading-none',
                isCurrent
                  ? aesthetics.primaryAccent
                  : isPast
                    ? 'text-muted-foreground/50'
                    : 'text-muted-foreground/20',
              )}
            >
              {isCurrent ? '•' : '·'}
            </span>
            <span
              className={cn(
                'transition-colors',
                isCurrent
                  ? aesthetics.primaryAccent
                  : isPast
                    ? 'text-muted-foreground/50'
                    : 'text-muted-foreground/30',
              )}
            >
              {stage.label}
            </span>
          </span>
        )
      })}
    </div>
  )
}

// ── Reflection block ───────────────────────────────────────────────

function ReflectionBlock({
  ritualCycleId,
  status,
  reflections,
  isAuthenticated,
  participantState,
  aesthetics,
}: {
  ritualCycleId: string
  status: RitualCycleStatus
  reflections: VisibleReflection[]
  isAuthenticated: boolean
  participantState: RitualParticipantState | null
  aesthetics: RitualContextPanelProps['aesthetics']
}) {
  // Phase 6B.3: peer reflections moved to <RitualEcologySection>
  // ("From the Room") below the hero. This block now governs ONLY
  // the listener's own composer + their published reflection.
  const own = reflections.filter((r) => r.is_own)
  const draft = own.find((r) => r.reflection_state === 'draft')
  const published = own.find((r) => r.reflection_state === 'published')

  const isReflectionWindow = status === 'reflection'
  const showComposer =
    isAuthenticated && (status === 'active' || isReflectionWindow)

  // Nothing to render: upcoming cycle, or no composer for non-auth
  // listeners and no own publication.
  if (status === 'upcoming') return null
  if (!showComposer && !published) return null

  return (
    <div className="mb-10">
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-4">
        Your reflection
      </p>
      {showComposer ? (
        <ReflectionComposer
          ritualCycleId={ritualCycleId}
          existingDraft={draft ?? null}
          existingPublished={published ?? null}
          canPublish={isReflectionWindow}
          participantState={participantState}
          aesthetics={aesthetics}
        />
      ) : published ? (
        <article className={cn('border-l pl-5 py-1', aesthetics.borderTint)}>
          <p className="font-serif text-base text-cream/80 leading-relaxed whitespace-pre-wrap">
            {published.body}
          </p>
        </article>
      ) : null}
    </div>
  )
}

// ── Composer ───────────────────────────────────────────────────────

function ReflectionComposer({
  ritualCycleId,
  existingDraft,
  existingPublished,
  canPublish,
  participantState,
  aesthetics,
}: {
  ritualCycleId: string
  existingDraft: VisibleReflection | null
  existingPublished: VisibleReflection | null
  canPublish: boolean
  participantState: RitualParticipantState | null
  aesthetics: RitualContextPanelProps['aesthetics']
}) {
  if (existingPublished) {
    return (
      <article className={cn('border-l pl-5 py-1', aesthetics.borderTint)}>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-2">
          Your reflection
        </p>
        <p className="font-serif text-base text-cream/80 leading-relaxed whitespace-pre-wrap">
          {existingPublished.body}
        </p>
      </article>
    )
  }

  return (
    <ComposerForm
      ritualCycleId={ritualCycleId}
      existingDraft={existingDraft}
      canPublish={canPublish}
      participantState={participantState}
      aesthetics={aesthetics}
    />
  )
}

function ComposerForm({
  ritualCycleId,
  existingDraft,
  canPublish,
  participantState,
  aesthetics,
}: {
  ritualCycleId: string
  existingDraft: VisibleReflection | null
  canPublish: boolean
  participantState: RitualParticipantState | null
  aesthetics: RitualContextPanelProps['aesthetics']
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

  const cantPublishYet = !canPublish && participantState !== 'reflected'

  return (
    <div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={6}
        maxLength={8000}
        className="bg-card/30 border-border/20 font-serif text-base text-cream/90 placeholder:text-muted-foreground/30 focus-visible:ring-0 focus-visible:border-border/40"
      />
      <div className="flex items-center justify-between mt-3">
        <p className="text-[10px] text-muted-foreground/40">
          {body.length} / 8000
          {savedAt && <span className="ml-3 text-olive/70">Saved.</span>}
        </p>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={isPending || body.trim().length === 0}
            className="text-sm text-muted-foreground hover:text-cream transition-colors disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Save draft'}
          </button>
          {canPublish && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isPending || body.trim().length === 0}
              className={cn(
                'text-sm transition-colors disabled:opacity-40',
                'text-cream hover:opacity-80',
              )}
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
      {/* Keep the aesthetics reference live for the linter when none
          of the conditional branches above consumed it. */}
      <span className="hidden" aria-hidden data-tint={aesthetics.borderTint} />
    </div>
  )
}

// ── Prompts block ──────────────────────────────────────────────────

function PromptsBlock({
  prompts,
  aesthetics,
}: {
  prompts: RitualContextPanelProps['prompts']
  aesthetics: RitualContextPanelProps['aesthetics']
}) {
  if (!prompts || prompts.length === 0) return null
  return (
    <div className={cn('border-t pt-8 mt-2', aesthetics.borderTint)}>
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-6">
        Listening prompts
      </p>
      <ol className="space-y-6">
        {prompts.map((prompt, i) => (
          <li key={i} className="flex items-start gap-4">
            <span
              className={cn(
                'font-serif text-lg leading-snug shrink-0',
                aesthetics.primaryAccent,
                'opacity-50',
              )}
            >
              {i + 1}
            </span>
            <div>
              <p className="font-serif text-lg text-cream/85 leading-snug">
                {prompt.question}
              </p>
              {prompt.hint && (
                <p className="text-xs text-muted-foreground/50 italic mt-1.5">
                  {prompt.hint}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────

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
