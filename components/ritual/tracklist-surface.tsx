import { cn } from '@/lib/utils'

/**
 * components/ritual/tracklist-surface.tsx — Phase 6B.4 follow-up
 *
 * Editorial tracklist beneath the embedded ListeningSurface.
 *
 * Phase 6B.4 audit established that NO real per-album track data
 * exists in the LongPlay substrate:
 *   · Album type carries no `tracks` field
 *   · DB albums table has no tracks column
 *   · The static catalog has no per-room track lists
 *   · The only tracklists ever rendered were hardcoded fakes in
 *     the deprecated listening-room screens ("Track 1 / Track 2…")
 *
 * Per the 6B.4 brief: do NOT fabricate tracks; render a restrained
 * fallback line. The Spotify embed in <ListeningSurface> is the
 * primary listening affordance — this surface only acknowledges the
 * absence editorially.
 *
 * When real track data lands in a future phase (album tracks
 * resolved via the Spotify API at sync time, persisted on
 * artist_genre_enrichments-style cache row), this component grows a
 * `tracks: Track[]` prop and renders an editorial list. Until then
 * it renders one quiet caption.
 */

export interface Track {
  number: number
  title: string
  /** ISO 8601 duration ('PT3M21S') or plain "3:21". Both render. */
  duration: string | null
}

export interface TracklistSurfaceProps {
  /** Real track data, when available. Null/empty triggers the
   *  restrained fallback line. We never accept a falsy array silently
   *  — the caller is responsible for choosing tracks vs null. */
  tracks: ReadonlyArray<Track> | null
  /** Room aesthetic tokens — composed with the surrounding hero. */
  aesthetics: {
    borderTint: string
    primaryAccent: string
  }
}

export function TracklistSurface({ tracks, aesthetics }: TracklistSurfaceProps) {
  if (!tracks || tracks.length === 0) {
    return (
      <div className={cn('border-t pt-6 mt-6', aesthetics.borderTint)}>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-3">
          Tracklist
        </p>
        <p className="text-sm text-muted-foreground/50 italic leading-relaxed max-w-prose">
          Tracklist unavailable. Listen through the embedded album player above.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('border-t pt-6 mt-6', aesthetics.borderTint)}>
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-4">
        Tracklist
      </p>
      <ol className="space-y-2.5">
        {tracks.map((t) => (
          <li
            key={t.number}
            className="flex items-baseline gap-4 text-sm leading-snug"
          >
            <span
              aria-hidden
              className={cn(
                'shrink-0 w-6 font-mono text-[11px] tabular-nums text-muted-foreground/40 text-right',
              )}
            >
              {t.number}
            </span>
            <span className="flex-1 text-cream/80 font-serif">{t.title}</span>
            {t.duration && (
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/40">
                {t.duration}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
