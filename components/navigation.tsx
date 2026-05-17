'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getLastRoom, type LastRoom } from '@/lib/last-room'

/**
 * LongPlay Navigation - Aligned with Business Plan
 *
 * Five core tabs reflecting the product architecture:
 * 1. Home - Editorial front door
 * 2. Rooms - Listening room discovery and membership
 * 3. Room - Active listening/reflection space
 * 4. Identity - The signature output (emotional product)
 * 5. Profile - Account/membership layer
 */

const primaryNavItems = [
  { href: '/', label: 'Home', mobileLabel: 'Home', icon: HomeIcon },
  { href: '/rooms', label: 'Rooms', mobileLabel: 'Rooms', icon: RoomsIcon },
  { href: '/room', label: 'Room', mobileLabel: 'Room', icon: RoomIcon },
  { href: '/identity', label: 'Identity', mobileLabel: 'Identity', icon: IdentityIcon },
  { href: '/profile', label: 'Profile', mobileLabel: 'Profile', icon: ProfileIcon },
]

export function Navigation() {
  const pathname = usePathname()

  // ── Resume-listening memory ──────────────────────────────────────────
  // The "Listening Room" item should one-tap return the user to whatever
  // active room they were last inside. Read on client-mount only so the
  // SSR href stays /rooms — avoids hydration mismatch on the Link.
  const [lastRoom, setLastRoomState] = useState<LastRoom | null>(null)
  useEffect(() => {
    setLastRoomState(getLastRoom())
  }, [pathname])

  // Don't show navigation on onboarding
  if (pathname.startsWith('/onboarding')) {
    return null
  }

  // Determine active states for room-related pages.
  // "Rooms" tab is active on discovery (/rooms, /rooms/[slug]) and on
  // the legacy /clubs alias that still renders the same surface.
  const isRoomsActive = pathname === '/rooms' || pathname.startsWith('/rooms/') || pathname === '/clubs' || pathname.startsWith('/clubs/')
  const isRoomActive = pathname === '/room' || pathname.startsWith('/room/')

  // Resolve the destination for the "Listening Room" nav item. SSR uses
  // /rooms (a safe public surface); client-mount may upgrade to the
  // user's last active room. Falling back to /rooms when no last room
  // exists keeps the item useful even for new sessions.
  const listeningRoomHref = lastRoom?.slug ? `/room/${lastRoom.slug}` : '/rooms'

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/30 bg-background/95 backdrop-blur-md md:hidden safe-area-pb">
        <div className="flex items-center justify-around py-2">
          {primaryNavItems.map((item) => {
            // Special handling for Rooms (discovery) and Room (active) tabs
            let isActive: boolean
            if (item.href === '/rooms') {
              isActive = isRoomsActive
            } else if (item.href === '/room') {
              isActive = isRoomActive
            } else if (item.href === '/') {
              isActive = pathname === '/'
            } else {
              isActive = pathname.startsWith(item.href)
            }
            const Icon = item.icon
            const isIdentity = item.href === '/identity'
            
            // Resume-listening: the Room tab routes to the last visited
            // active room when known. Falls back to /rooms.
            const resolvedHref = item.href === '/room' ? listeningRoomHref : item.href

            return (
              <Link
                key={item.href}
                href={resolvedHref}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 transition-all duration-500',
                  isActive
                    ? 'text-burgundy'
                    : 'text-muted-foreground hover:text-cream/70'
                )}
              >
                <Icon className={cn("h-5 w-5", isIdentity && "h-6 w-6")} />
                <span className={cn(
                  "text-[9px] font-medium tracking-wider uppercase",
                  isIdentity && "text-[10px]"
                )}>
                  {item.mobileLabel}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Desktop Top Navigation */}
      <nav className="hidden md:block fixed top-0 left-0 right-0 z-50 border-b border-border/20 bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-screen-xl px-8 lg:px-12">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link 
              href="/" 
              className="transition-opacity duration-500 hover:opacity-70"
            >
              <LongPlayWordmark className="h-5" />
            </Link>

            {/* Primary Nav */}
            <div className="flex items-center gap-8">
              <Link
                href="/"
                className={cn(
                  'text-sm tracking-wide transition-all duration-500',
                  pathname === '/' 
                    ? 'text-cream' 
                    : 'text-muted-foreground hover:text-cream/80'
                )}
              >
                Home
              </Link>
              
              <Link
                href="/rooms"
                className={cn(
                  'text-sm tracking-wide transition-all duration-500',
                  isRoomsActive
                    ? 'text-cream'
                    : 'text-muted-foreground hover:text-cream/80'
                )}
              >
                Rooms
              </Link>
              
              {/* Listening Room — resume-aware. The visible label stays
                  "Listening Room"; when a last-visited room is known,
                  render a quiet contextual subline below it that reads
                  e.g. "Return to The Nocturnal Room". */}
              <Link
                href={listeningRoomHref}
                className={cn(
                  'group flex flex-col items-start leading-none transition-all duration-500',
                  isRoomActive
                    ? 'text-cream'
                    : 'text-muted-foreground hover:text-cream/80'
                )}
              >
                <span className="text-sm tracking-wide">Listening Room</span>
                {lastRoom && (
                  <span className="mt-1 text-[10px] italic text-muted-foreground/50 group-hover:text-muted-foreground/70 tracking-wide transition-colors duration-500">
                    Return to {lastRoom.name}
                  </span>
                )}
              </Link>
              
              {/* Identity - Primary CTA styling */}
              <Link
                href="/identity"
                className={cn(
                  'text-sm tracking-wide transition-all duration-500 px-4 py-1.5 border rounded-full',
                  pathname.startsWith('/identity')
                    ? 'text-cream border-burgundy bg-burgundy/20' 
                    : 'text-burgundy/90 border-burgundy/40 hover:border-burgundy hover:bg-burgundy/10'
                )}
              >
                Your Identity
              </Link>
            </div>

            {/* Profile */}
            <Link 
              href="/profile"
              className={cn(
                'flex items-center gap-2 text-sm transition-all duration-500',
                pathname.startsWith('/profile')
                  ? 'text-cream' 
                  : 'text-muted-foreground hover:text-cream/80'
              )}
            >
              <div className="w-8 h-8 rounded-full bg-tobacco/30 border border-tobacco/50 flex items-center justify-center">
                <span className="text-xs text-cream font-medium">E</span>
              </div>
            </Link>
          </div>
        </div>
      </nav>
    </>
  )
}

// LongPlay Wordmark
export function LongPlayWordmark({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 160 24" 
      fill="none" 
      className={cn("text-cream", className)}
      aria-label="LongPlay"
    >
      <text x="0" y="18" fill="currentColor" fontFamily="'Playfair Display', Georgia, serif" fontSize="18" fontWeight="400" letterSpacing="0.02em">
        Long
      </text>
      <text x="58" y="18" fill="currentColor" fontFamily="'Playfair Display', Georgia, serif" fontSize="18" fontWeight="500" fontStyle="italic" letterSpacing="0.02em">
        Play
      </text>
    </svg>
  )
}

// Cinematic LongPlay Logo - for hero usage
export function LongPlayLogo({ className, showTagline = false }: { className?: string; showTagline?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="flex items-baseline gap-1">
        <span className="font-serif text-5xl md:text-6xl lg:text-7xl tracking-tight text-cream">
          Long
        </span>
        <span className="font-serif text-5xl md:text-6xl lg:text-7xl tracking-tight text-cream italic">
          Play
        </span>
      </div>
      
      {showTagline && (
        <p className="mt-4 text-xs uppercase tracking-[0.4em] text-muted-foreground">
          A Listening Club
        </p>
      )}
    </div>
  )
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}

// Rooms Icon - Community/group listening spaces
function RoomsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Multiple people / community motif */}
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  )
}

// Room Icon - Headphones / listening space
function RoomIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {/* Headphones motif - personal listening */}
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5c-4.142 0-7.5 3.358-7.5 7.5v5.25a2.25 2.25 0 002.25 2.25h.75a1.5 1.5 0 001.5-1.5v-3a1.5 1.5 0 00-1.5-1.5h-.75A2.25 2.25 0 004.5 15.75V12a7.5 7.5 0 1115 0v3.75a2.25 2.25 0 00-2.25-2.25h-.75a1.5 1.5 0 00-1.5 1.5v3a1.5 1.5 0 001.5 1.5h.75a2.25 2.25 0 002.25-2.25V12c0-4.142-3.358-7.5-7.5-7.5z" />
    </svg>
  )
}

// Identity Icon - Emotional fingerprint / waveform
function IdentityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M8 6v12M4 9v6M16 6v12M20 9v6" />
      <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
    </svg>
  )
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  )
}
