'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { resolveAlbumArtwork } from '@/lib/itunes-artwork-resolver'

interface AlbumCoverProps {
  src?: string // Optional static src - will be overridden by iTunes resolver
  alt?: string
  title: string
  artist: string
  fallbackGradient?: string
  fill?: boolean
  priority?: boolean // Accepted for API compatibility; artwork loads via useEffect
  width?: number
  height?: number
  className?: string
  showDebug?: boolean // Show debug info under image
}

export function AlbumCover({
  src,
  alt,
  title,
  artist,
  fallbackGradient = "from-charcoal to-card",
  fill = false,
  width,
  height,
  className,
  showDebug = false, // Set to true for debugging
}: AlbumCoverProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isImageLoading, setIsImageLoading] = useState(true)

  // Resolve artwork: prioritize static src, fall back to iTunes API
  useEffect(() => {
    let cancelled = false
    
    async function resolve() {
      setIsResolving(true)
      setHasError(false)
      
      // If we have a static src, use it immediately
      if (src) {
        setResolvedUrl(src)
        setIsResolving(false)
        return
      }
      
      // Only try iTunes API if no static src provided
      try {
        const url = await resolveAlbumArtwork(artist, title)
        if (!cancelled) {
          setResolvedUrl(url)
          setIsResolving(false)
        }
      } catch {
        // Silently fail - no artwork is fine, show fallback card
        if (!cancelled) {
          setIsResolving(false)
        }
      }
    }
    
    resolve()
    
    return () => {
      cancelled = true
    }
  }, [artist, title, src])

  const displayUrl = resolvedUrl
  const showFallback = !isResolving && (!displayUrl || hasError)

  // Debug info
  const debugText = isResolving 
    ? `${artist} / ${title} / resolving...`
    : displayUrl 
      ? `${artist} / ${title} / ${displayUrl.substring(0, 50)}...`
      : `${artist} / ${title} / no artwork found`

  // Fallback card when no image available
  if (showFallback) {
    return (
      <div className={cn("relative", fill ? "absolute inset-0" : "")} style={!fill ? { width, height } : undefined}>
        <div 
          className={cn(
            `bg-gradient-to-br ${fallbackGradient} flex flex-col items-center justify-center p-4 text-center h-full w-full`,
            className
          )}
        >
          {/* Vinyl record icon */}
          <div className="w-12 h-12 mb-4 opacity-30">
            <svg viewBox="0 0 48 48" fill="none" className="text-cream w-full h-full">
              <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="1" opacity="0.6" />
              <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="1" opacity="0.4" />
              <circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.8" />
            </svg>
          </div>
          <p className="font-serif text-sm text-cream/90 leading-tight line-clamp-2 mb-1 text-balance">
            {title}
          </p>
          <p className="text-xs text-cream/60 line-clamp-1">
            {artist}
          </p>
        </div>
        {showDebug && (
          <p className="absolute -bottom-6 left-0 right-0 text-[9px] text-muted-foreground/50 truncate px-1">
            {debugText}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={cn("relative overflow-hidden", fill ? "absolute inset-0" : "")} style={!fill ? { width, height } : undefined}>
      {/* Loading skeleton with warm gradient */}
      {(isResolving || isImageLoading) && (
        <div 
          className={cn(
            `absolute inset-0 bg-gradient-to-br ${fallbackGradient}`,
          )}
        >
          {/* Subtle shimmer effect */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cream/5 to-transparent animate-shimmer" />
          </div>
          {/* Loading indicator */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border border-cream/20 rounded-full border-t-cream/60 animate-spin" />
          </div>
        </div>
      )}
      
      {displayUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={displayUrl}
          alt={alt || `${title} by ${artist}`}
          className={cn(
            "object-cover w-full h-full transition-opacity duration-700 ease-out",
            isImageLoading ? "opacity-0" : "opacity-100",
            className
          )}
          onError={() => {
            setHasError(true)
            setIsImageLoading(false)
          }}
          onLoad={() => setIsImageLoading(false)}
          loading="lazy"
        />
      )}
      
      {showDebug && (
        <p className="absolute -bottom-6 left-0 right-0 text-[9px] text-muted-foreground/50 truncate px-1 z-10">
          {debugText}
        </p>
      )}
    </div>
  )
}

// Simpler version for smaller thumbnails
export function AlbumThumb({
  src,
  alt,
  title,
  artist,
  fallbackGradient = "from-charcoal to-card",
  size = 'md',
  className,
  showDebug = false,
}: {
  src?: string
  alt?: string
  title: string
  artist: string
  fallbackGradient?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showDebug?: boolean
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isImageLoading, setIsImageLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    
    async function resolve() {
      setIsResolving(true)
      
      // If we have a static src, use it immediately
      if (src) {
        setResolvedUrl(src)
        setIsResolving(false)
        return
      }
      
      // Only try iTunes API if no static src
      try {
        const url = await resolveAlbumArtwork(artist, title)
        if (!cancelled) {
          setResolvedUrl(url)
          setIsResolving(false)
        }
      } catch {
        // Silently fail
        if (!cancelled) {
          setIsResolving(false)
        }
      }
    }
    
    resolve()
    return () => { cancelled = true }
  }, [artist, title, src])

  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-20 h-20',
  }

  const displayUrl = resolvedUrl
  const showFallback = !isResolving && (!displayUrl || hasError)

  if (showFallback) {
    return (
      <div className="relative">
        <div 
          className={cn(
            `bg-gradient-to-br ${fallbackGradient} flex items-center justify-center shrink-0`,
            sizeClasses[size],
            className
          )}
        >
          <span className="font-serif text-cream/70 text-xs">
            {title.charAt(0)}
          </span>
        </div>
        {showDebug && (
          <p className="absolute -bottom-4 left-0 text-[8px] text-muted-foreground/50 truncate w-20">
            {artist} / {title}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <div className={cn("relative overflow-hidden shrink-0", sizeClasses[size], className)}>
        {(isResolving || isImageLoading) && (
          <div className={cn(`absolute inset-0 bg-gradient-to-br ${fallbackGradient} animate-pulse`)} />
        )}
        {displayUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={displayUrl}
            alt={alt || `${title} by ${artist}`}
            className={cn(
              "object-cover w-full h-full transition-opacity duration-500",
              isImageLoading ? "opacity-0" : "opacity-100"
            )}
            onError={() => {
              setHasError(true)
              setIsImageLoading(false)
            }}
            onLoad={() => setIsImageLoading(false)}
            loading="lazy"
          />
        )}
      </div>
      {showDebug && (
        <p className="absolute -bottom-4 left-0 text-[8px] text-muted-foreground/50 truncate w-20">
          {artist} / {title}
        </p>
      )}
    </div>
  )
}
