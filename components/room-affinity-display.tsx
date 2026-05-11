'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { 
  ROOM_AFFINITIES,
  CURRENT_INSIGHTS,
  getResonatingRooms,
  getExpansionRooms,
  getDriftingTowardRooms,
  getPrimaryRoom,
  getRecentDrift,
  getAffinityField,
  type RoomAffinity,
  type AffinityInsight,
  type AffinityField,
} from '@/lib/room-affinity'

/**
 * Room Affinity Display Components
 * 
 * These components visualize where the listener BELONGS.
 * NOT recommendation UI. NOT algorithmic matching.
 * 
 * Design principles:
 * - Editorial, not dashboard
 * - Emotionally intelligent language
 * - No percentages, no radar charts
 * - Organic, atmospheric visualization
 */

// ============================================
// 1. ROOMS THAT RESONATE — Main affinity section
// ============================================
export function RoomsThatResonate({ 
  variant = 'full',
  className,
}: {
  variant?: 'full' | 'compact' | 'minimal'
  className?: string
}) {
  const resonatingRooms = getResonatingRooms()
  const primaryRoom = getPrimaryRoom()
  
  if (variant === 'minimal') {
    return (
      <div className={cn("space-y-4", className)}>
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
          Where Your Listening Belongs
        </p>
        <div className="space-y-3">
          {resonatingRooms.slice(0, 3).map((affinity) => (
            <Link
              key={affinity.roomSlug}
              href={`/rooms/${affinity.roomSlug}`}
              className="block text-cream hover:text-tobacco transition-colors duration-500"
            >
              <span className="font-serif text-lg">{affinity.roomName}</span>
              {affinity.resonance === 'deep' && (
                <span className="ml-2 text-xs text-burgundy">primary</span>
              )}
            </Link>
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className={cn("border border-border/20 bg-card/20 p-6", className)}>
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4">
          Rooms That Continue Resonating
        </p>
        <div className="space-y-4">
          {resonatingRooms.slice(0, 3).map((affinity) => (
            <RoomAffinityCard key={affinity.roomSlug} affinity={affinity} compact />
          ))}
        </div>
      </div>
    )
  }

  return (
    <section className={cn("space-y-8", className)}>
      <div>
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-2">
          Where Your Listening Belongs
        </p>
        <h2 className="font-serif text-2xl md:text-3xl text-cream">
          Rooms That Continue Resonating
        </h2>
      </div>
      
      {/* Primary Room — Editorial highlight */}
      {primaryRoom && (
        <div className="border-l-2 border-burgundy/50 pl-6 py-4">
          <p className="font-serif text-xl text-cream/90 italic leading-relaxed mb-4">
            "{primaryRoom.resonanceExplanation}"
          </p>
          <Link
            href={`/rooms/${primaryRoom.roomSlug}`}
            className="inline-flex items-center gap-2 text-burgundy hover:text-cream transition-colors duration-500"
          >
            <span className="font-serif">{primaryRoom.roomName}</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </Link>
        </div>
      )}
      
      {/* Other resonating rooms */}
      <div className="space-y-6">
        {resonatingRooms
          .filter(a => a.resonance !== 'deep')
          .map((affinity) => (
            <RoomAffinityCard key={affinity.roomSlug} affinity={affinity} />
          ))}
      </div>
    </section>
  )
}

// ============================================
// 2. ROOM AFFINITY CARD — Individual room display
// ============================================
function RoomAffinityCard({ 
  affinity, 
  compact = false 
}: { 
  affinity: RoomAffinity
  compact?: boolean 
}) {
  if (compact) {
    return (
      <Link
        href={`/rooms/${affinity.roomSlug}`}
        className="group flex items-start justify-between"
      >
        <div>
          <h3 className="font-serif text-cream group-hover:text-tobacco transition-colors duration-500">
            {affinity.roomName}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {affinity.emotionalThreads[0]}
          </p>
        </div>
        <ResonanceIndicator resonance={affinity.resonance} />
      </Link>
    )
  }

  return (
    <Link
      href={`/rooms/${affinity.roomSlug}`}
      className="group block border border-border/20 bg-card/20 p-6 hover:border-burgundy/30 transition-all duration-500"
    >
      <div className="flex items-start justify-between mb-4">
        <h3 className="font-serif text-xl text-cream group-hover:text-tobacco transition-colors duration-500">
          {affinity.roomName}
        </h3>
        <ResonanceIndicator resonance={affinity.resonance} trend={affinity.trend} />
      </div>
      
      <p className="text-sm text-cream/70 leading-relaxed mb-4">
        {affinity.resonanceExplanation}
      </p>
      
      {/* Emotional threads */}
      <div className="flex flex-wrap gap-2">
        {affinity.emotionalThreads.slice(0, 3).map((thread) => (
          <span
            key={thread}
            className="text-xs text-muted-foreground border border-border/20 px-2 py-1"
          >
            {thread}
          </span>
        ))}
      </div>
      
      {/* Drift indicator */}
      {affinity.trendNote && (
        <p className="text-xs text-tobacco mt-4 italic">
          {affinity.trendNote}
        </p>
      )}
    </Link>
  )
}

// ============================================
// 3. RESONANCE INDICATOR — Visual affinity strength
// ============================================
function ResonanceIndicator({ 
  resonance, 
  trend 
}: { 
  resonance: RoomAffinity['resonance']
  trend?: RoomAffinity['trend']
}) {
  const resonanceLabel = {
    deep: 'Primary',
    strong: 'Strong',
    emerging: 'Emerging',
    peripheral: 'Peripheral',
  }[resonance]

  const resonanceColor = {
    deep: 'text-burgundy border-burgundy/50',
    strong: 'text-tobacco border-tobacco/50',
    emerging: 'text-olive border-olive/50',
    peripheral: 'text-muted-foreground border-border/30',
  }[resonance]

  return (
    <div className="flex items-center gap-2">
      {trend === 'drifting-toward' && (
        <svg className="w-3 h-3 text-olive animate-pulse" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
        </svg>
      )}
      <span className={cn(
        "text-[9px] uppercase tracking-[0.2em] px-2 py-1 border",
        resonanceColor
      )}>
        {resonanceLabel}
      </span>
    </div>
  )
}

// ============================================
// 4. ROOM DRIFT — Identity evolution
// ============================================
export function RoomDriftDisplay({ className }: { className?: string }) {
  const recentDrift = getRecentDrift()
  
  if (!recentDrift) return null
  
  return (
    <div className={cn("border border-olive/20 bg-olive/5 p-6", className)}>
      <p className="text-[10px] uppercase tracking-[0.4em] text-olive/70 mb-4">
        Identity Movement
      </p>
      
      <p className="font-serif text-lg text-cream leading-relaxed mb-4">
        {recentDrift.driftNote}
      </p>
      
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{recentDrift.period}</span>
        <span className="w-1 h-1 rounded-full bg-olive/40" />
        <span className="italic text-cream/60">{recentDrift.emotionalShift}</span>
      </div>
    </div>
  )
}

// ============================================
// 5. AFFINITY INSIGHTS — Editorial observations
// ============================================
export function AffinityInsightsDisplay({ 
  limit = 3,
  className,
}: {
  limit?: number
  className?: string
}) {
  const insights = CURRENT_INSIGHTS.slice(0, limit)
  
  return (
    <div className={cn("space-y-6", className)}>
      {insights.map((insight) => (
        <AffinityInsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  )
}

function AffinityInsightCard({ insight }: { insight: AffinityInsight }) {
  const typeColor = {
    drift: 'border-olive/30 text-olive',
    pattern: 'border-tobacco/30 text-tobacco',
    seasonal: 'border-blue-400/30 text-blue-300',
    resonance: 'border-burgundy/30 text-burgundy',
  }[insight.type]

  return (
    <div className={cn("border-l-2 pl-6 py-2", typeColor.split(' ')[0])}>
      <p className="font-serif text-lg text-cream/90 leading-relaxed mb-2">
        {insight.observation}
      </p>
      {insight.context && (
        <p className="text-sm text-muted-foreground mb-3">
          {insight.context}
        </p>
      )}
      {insight.actionable && (
        <Link
          href={`/rooms/${insight.actionable.roomSlug}`}
          className={cn("text-sm transition-colors duration-500 hover:text-cream", typeColor.split(' ')[1])}
        >
          {insight.actionable.label} →
        </Link>
      )}
    </div>
  )
}

// ============================================
// 6. AFFINITY FIELD — Abstract visualization
// NOT a chart. An atmospheric, organic representation.
// ============================================
export function AffinityFieldVisualization({ className }: { className?: string }) {
  const field = getAffinityField()
  
  return (
    <div className={cn("relative aspect-square max-w-md mx-auto", className)}>
      {/* Atmospheric background */}
      <div className="absolute inset-0 rounded-full bg-gradient-radial from-burgundy/10 via-transparent to-transparent" />
      
      {/* Concentric rings - the listener's emotional gravity */}
      <div className="absolute inset-[10%] rounded-full border border-burgundy/20" />
      <div className="absolute inset-[25%] rounded-full border border-tobacco/15" />
      <div className="absolute inset-[40%] rounded-full border border-cream/10" />
      
      {/* Room nodes */}
      {field.map((room, i) => {
        const position = getRoomPosition(room.distance, i, field.length)
        
        return (
          <Link
            key={room.roomSlug}
            href={`/rooms/${room.roomSlug}`}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
            style={{
              left: `${position.x}%`,
              top: `${position.y}%`,
            }}
          >
            <div className={cn(
              "relative flex items-center justify-center transition-all duration-700",
              room.distance === 'center' ? 'w-16 h-16' :
              room.distance === 'inner' ? 'w-12 h-12' :
              room.distance === 'outer' ? 'w-10 h-10' : 'w-8 h-8'
            )}>
              {/* Glow for approaching rooms */}
              {room.drift === 'approaching' && (
                <div className="absolute inset-0 rounded-full bg-olive/20 animate-pulse" />
              )}
              
              {/* Node */}
              <div className={cn(
                "w-full h-full rounded-full border flex items-center justify-center",
                room.distance === 'center' ? 'bg-burgundy/20 border-burgundy/50' :
                room.distance === 'inner' ? 'bg-tobacco/15 border-tobacco/40' :
                room.distance === 'outer' ? 'bg-card/30 border-border/30' : 
                'bg-card/20 border-border/20'
              )}>
                <span className={cn(
                  "font-serif",
                  room.distance === 'center' ? 'text-sm text-cream' :
                  room.distance === 'inner' ? 'text-xs text-cream/80' :
                  'text-[10px] text-cream/60'
                )}>
                  {room.roomName.split(' ')[0][0]}
                  {room.roomName.split(' ')[1]?.[0] || ''}
                </span>
              </div>
            </div>
            
            {/* Hover label */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
              <span className="text-xs text-cream/70">{room.roomName}</span>
            </div>
          </Link>
        )
      })}
      
      {/* Center marker - the listener */}
      <div className="absolute inset-[45%] rounded-full bg-cream/80 flex items-center justify-center">
        <span className="text-[8px] text-background uppercase tracking-widest">You</span>
      </div>
    </div>
  )
}

// Helper: Calculate room position based on distance
function getRoomPosition(distance: AffinityField['distance'], index: number, total: number) {
  const distanceRadius = {
    center: 20,
    inner: 35,
    outer: 55,
    peripheral: 75,
  }[distance]
  
  // Distribute around the circle
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2
  
  return {
    x: 50 + distanceRadius * Math.cos(angle),
    y: 50 + distanceRadius * Math.sin(angle),
  }
}

// ============================================
// 7. EXPANSION ROOMS — 30% growth territory
// ============================================
export function ExpansionRoomsDisplay({ className }: { className?: string }) {
  const expansionRooms = getExpansionRooms()
  
  if (expansionRooms.length === 0) return null
  
  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-2">
          Rooms That May Expand You
        </p>
        <p className="text-sm text-cream/60 leading-relaxed">
          Familiar enough to trust, but expansive enough to evolve your listening.
        </p>
      </div>
      
      <div className="space-y-4">
        {expansionRooms.map((affinity) => (
          <Link
            key={affinity.roomSlug}
            href={`/rooms/${affinity.roomSlug}`}
            className="group block border border-dashed border-olive/30 bg-olive/5 p-5 hover:border-olive/50 transition-all duration-500"
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-serif text-lg text-cream group-hover:text-olive transition-colors duration-500">
                {affinity.roomName}
              </h3>
              <span className="text-[9px] uppercase tracking-[0.2em] text-olive/70 px-2 py-1 border border-olive/30">
                Expansion
              </span>
            </div>
            <p className="text-sm text-cream/60 leading-relaxed">
              {affinity.resonanceExplanation}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ============================================
// 8. DRIFTING TOWARD — Rooms gaining gravity
// ============================================
export function DriftingTowardDisplay({ className }: { className?: string }) {
  const driftingRooms = getDriftingTowardRooms()
  
  if (driftingRooms.length === 0) return null
  
  return (
    <div className={cn("space-y-4", className)}>
      <p className="text-[10px] uppercase tracking-[0.4em] text-olive/70">
        Where Your Listening Is Drifting
      </p>
      
      <div className="space-y-3">
        {driftingRooms.map((affinity) => (
          <Link
            key={affinity.roomSlug}
            href={`/rooms/${affinity.roomSlug}`}
            className="group flex items-center justify-between p-4 border border-olive/20 bg-olive/5 hover:border-olive/40 transition-all duration-500"
          >
            <div>
              <h3 className="font-serif text-cream group-hover:text-olive transition-colors duration-500">
                {affinity.roomName}
              </h3>
              {affinity.trendNote && (
                <p className="text-xs text-muted-foreground mt-1">
                  {affinity.trendNote}
                </p>
              )}
            </div>
            <svg className="w-4 h-4 text-olive group-hover:translate-x-1 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  )
}
