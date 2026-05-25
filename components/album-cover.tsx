'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { resolveAlbumArtwork } from '@/lib/itunes-artwork-resolver'

/**
 * AlbumCover / AlbumThumb — the ONE component for rendering album
 * artwork anywhere in the app.
 *
 * Rendering rules (non-negotiable):
 *   1. Never show the browser's broken-image icon.
 *   2. Never leak alt text on load failure.
 *   3. Always render something visually intentional, even when the
 *      cover URL is missing / dead / network-blocked.
 *
 * Implementation: CSS `background-image` on a layered overlay div,
 * with active load detection via `new window.Image()`. Failed
 * background-image fetches silently leave the parent gradient
 * showing through — no broken-icon glyph is even possible (that's
 * an HTML `<img>` property; CSS bg-image has no equivalent).
 *
 * When the URL is absent OR confirmed dead, we render a designed
 * fallback: vinyl glyph + title + artist on the album's
 * fallbackGradient. This is the long-term presentation for albums
 * we genuinely don't have artwork for — not an error state.
 *
 * Runtime iTunes resolver: when `src` is absent we optionally try
 * `resolveAlbumArtwork(artist, title)` as a final attempt. Kept for
 * legacy callers — most artwork should be sourced at seed time via
 * scripts/resolve-itunes-artwork.ts.
 *
 * Audit invariant: `scripts/audit-artwork.ts` lints the codebase for
 * raw `<img>` and raw `<Image>` (next/image) of album art outside
 * this file. Add new artwork surfaces here, not via raw image tags.
 */

type CoverStatus = 'pending' | 'loaded' | 'failed' | 'absent'

/** Fire-and-forget Image() ping to detect whether a URL resolves to
 *  an actual image. Strict-mode safe via the cancelled flag. */
function useImageStatus(src: string | null | undefined): CoverStatus {
  const [status, setStatus] = useState<CoverStatus>(src ? 'pending' : 'absent')
  useEffect(() => {
    if (!src) {
      setStatus('absent')
      return
    }
    setStatus('pending')
    let cancelled = false
    const img = new window.Image()
    img.onload = () => {
      if (!cancelled) setStatus('loaded')
    }
    img.onerror = () => {
      if (!cancelled) setStatus('failed')
    }
    img.src = src
    return () => {
      cancelled = true
      img.onload = null
      img.onerror = null
    }
  }, [src])
  return status
}

interface AlbumCoverProps {
  src?: string
  alt?: string
  title: string
  artist: string
  fallbackGradient?: string
  fill?: boolean
  /** Accepted for API compat with prior implementation; no-op. */
  priority?: boolean
  width?: number
  height?: number
  className?: string
  /** Accepted for API compat; no-op. */
  showDebug?: boolean
}

export function AlbumCover({
  src,
  alt: _alt,
  title,
  artist,
  fallbackGradient = 'from-charcoal to-card',
  fill = false,
  width,
  height,
  className,
}: AlbumCoverProps) {
  // Optional runtime iTunes resolver — only fires when src is missing.
  // Most callers pass a real src; the resolver is a safety net for
  // legacy callsites.
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(src ?? null)
  const [resolverDone, setResolverDone] = useState(!!src)
  useEffect(() => {
    if (src) {
      setResolvedSrc(src)
      setResolverDone(true)
      return
    }
    let cancelled = false
    resolveAlbumArtwork(artist, title)
      .then((url) => {
        if (cancelled) return
        setResolvedSrc(url ?? null)
        setResolverDone(true)
      })
      .catch(() => {
        if (cancelled) return
        setResolverDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [src, artist, title])

  const status = useImageStatus(resolverDone ? resolvedSrc : null)
  // Optimistic: show cover during 'pending' AND 'loaded' so successful
  // images don't flash gradient first. Swap to fallback only when the
  // ping confirms failure.
  const showCover =
    !!resolvedSrc && (status === 'pending' || status === 'loaded')
  const showFallback = status === 'failed' || status === 'absent'

  const wrapperClasses = cn(
    'relative overflow-hidden bg-gradient-to-br',
    fallbackGradient || 'from-charcoal to-card',
    fill ? 'absolute inset-0 w-full h-full' : '',
    className,
  )

  const wrapperStyle = !fill && (width || height)
    ? { width, height }
    : undefined

  return (
    <div className={wrapperClasses} style={wrapperStyle}>
      {showCover && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${resolvedSrc}")` }}
          role="presentation"
          aria-hidden="true"
        />
      )}
      {showFallback && (
        <DesignedFallback title={title} artist={artist} compact={false} />
      )}
    </div>
  )
}

interface AlbumThumbProps {
  src?: string
  alt?: string
  title: string
  artist: string
  fallbackGradient?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showDebug?: boolean
}

const THUMB_SIZE_CLASSES = {
  sm: 'w-10 h-10',
  md: 'w-14 h-14',
  lg: 'w-20 h-20',
}

export function AlbumThumb({
  src,
  alt: _alt,
  title,
  artist,
  fallbackGradient = 'from-charcoal to-card',
  size = 'md',
  className,
}: AlbumThumbProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(src ?? null)
  const [resolverDone, setResolverDone] = useState(!!src)
  useEffect(() => {
    if (src) {
      setResolvedSrc(src)
      setResolverDone(true)
      return
    }
    let cancelled = false
    resolveAlbumArtwork(artist, title)
      .then((url) => {
        if (cancelled) return
        setResolvedSrc(url ?? null)
        setResolverDone(true)
      })
      .catch(() => {
        if (cancelled) return
        setResolverDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [src, artist, title])

  const status = useImageStatus(resolverDone ? resolvedSrc : null)
  const showCover =
    !!resolvedSrc && (status === 'pending' || status === 'loaded')
  const showFallback = status === 'failed' || status === 'absent'

  const wrapperClasses = cn(
    'relative overflow-hidden bg-gradient-to-br shrink-0',
    fallbackGradient || 'from-charcoal to-card',
    THUMB_SIZE_CLASSES[size],
    className,
  )

  return (
    <div className={wrapperClasses}>
      {showCover && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${resolvedSrc}")` }}
          role="presentation"
          aria-hidden="true"
        />
      )}
      {showFallback && (
        <DesignedFallback title={title} artist={artist} compact={true} />
      )}
    </div>
  )
}

/**
 * Intentional designed fallback when there's no usable cover URL.
 * Vinyl glyph + title + (optional) artist on the parent gradient.
 * compact=true drops the glyph and artist (used for small thumbs).
 *
 * The wrapper provides the gradient backdrop; this fills it with
 * the centered label content.
 */
function DesignedFallback({
  title,
  artist,
  compact,
}: {
  title: string
  artist: string
  compact: boolean
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center pointer-events-none">
      {!compact && (
        <svg
          viewBox="0 0 48 48"
          fill="none"
          className="w-10 h-10 mb-3 text-cream/40"
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1" opacity="0.6" />
          <circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="1" opacity="0.4" />
          <circle cx="24" cy="24" r="2.5" fill="currentColor" opacity="0.8" />
        </svg>
      )}
      <p
        className={cn(
          'font-serif text-cream/90 leading-tight line-clamp-2',
          compact ? 'text-[10px]' : 'text-sm mb-1',
        )}
      >
        {title}
      </p>
      {!compact && (
        <p className="text-xs text-cream/60 line-clamp-1">{artist}</p>
      )}
    </div>
  )
}
