'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlbumCover, AlbumThumb } from '@/components/album-cover'
import {
  PAST_CYCLES,
  LISTENING_ERAS,
  getResonatingCycles,
  getTotalEngagement,
  type ListeningCycle,
  type ListeningEra,
} from '@/lib/cycles'

/**
 * Past Cycles Archive
 * 
 * A cinematic archive of previous listening cycles.
 * Each cycle is a preserved cultural artifact, not expired content.
 */
export function PastCyclesArchive() {
  const [viewMode, setViewMode] = useState<'eras' | 'timeline' | 'grid'>('eras')
  const [selectedCycle, setSelectedCycle] = useState<ListeningCycle | null>(null)
  
  const resonatingCycles = getResonatingCycles()
  const totalEngagement = getTotalEngagement()
  
  return (
    <div className="grain relative pb-24 md:pb-0">
      {/* ============================================ */}
      {/* HERO - The Living Archive */}
      {/* ============================================ */}
      <section className="relative px-6 py-20 md:px-12 lg:px-24">
        <div className="max-w-2xl mx-auto text-center animate-fade-in-slow">
          <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-8">
            Previous Listening Cycles
          </p>
          <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl text-cream mb-6 leading-tight">
            Your Listening Archive
          </h1>
          <p className="text-cream/60 leading-relaxed mb-4">
            Not a playlist history. Not a content backlog.
          </p>
          <p className="font-serif text-lg text-cream/80 leading-relaxed">
            Each cycle is a preserved chapter in your listening life—<br className="hidden md:block" />
            a cultural artifact holding who you were while you listened.
          </p>
        </div>
        
        {/* Archive stats */}
        <div className="flex items-center justify-center gap-6 mt-12 text-sm text-muted-foreground">
          <div className="text-center">
            <p className="font-serif text-2xl text-cream">{PAST_CYCLES.length}</p>
            <p className="text-xs">cycles preserved</p>
          </div>
          <div className="w-px h-8 bg-border/30" />
          <div className="text-center">
            <p className="font-serif text-2xl text-cream">{totalEngagement.annotations}</p>
            <p className="text-xs">annotations saved</p>
          </div>
          <div className="w-px h-8 bg-border/30" />
          <div className="text-center">
            <p className="font-serif text-2xl text-cream">{LISTENING_ERAS.length}</p>
            <p className="text-xs">listening eras</p>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* STILL RESONATES - Cycles that continue to matter */}
      {/* ============================================ */}
      {resonatingCycles.length > 0 && (
        <section className="px-6 py-16 md:px-12 lg:px-24 bg-burgundy/5 border-y border-burgundy/10">
          <p className="text-[10px] uppercase tracking-[0.4em] text-burgundy mb-4 text-center">
            Still Resonating
          </p>
          <p className="text-center text-cream/50 text-sm mb-12 max-w-sm mx-auto">
            Cycles you keep returning to. Records that still shape your listening.
          </p>
          
          <div className="max-w-2xl mx-auto space-y-8">
            {resonatingCycles.slice(0, 3).map((cycle) => (
              <div 
                key={cycle.id}
                className="flex gap-6 p-4 bg-card/30 border border-border/20 cursor-pointer hover:border-burgundy/30 transition-all duration-500"
                onClick={() => setSelectedCycle(cycle)}
              >
                <AlbumCover
                  src={cycle.album.cover}
                  alt={cycle.album.title}
                  title={cycle.album.title}
                  artist={cycle.album.artist}
                  className="w-20 h-20 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-tobacco mb-1">{cycle.seasonLabel}</p>
                  <h4 className="font-serif text-lg text-cream mb-1 truncate">{cycle.album.title}</h4>
                  <p className="text-sm text-muted-foreground mb-2">{cycle.album.artist}</p>
                  <p className="text-sm text-cream/70 line-clamp-2">
                    {cycle.stillResonates.resonanceNote}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-serif text-xl text-burgundy">{cycle.stillResonates.returnsSince}</p>
                  <p className="text-xs text-muted-foreground">returns</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============================================ */}
      {/* VIEW TOGGLE */}
      {/* ============================================ */}
      <section className="px-6 py-8 md:px-12 lg:px-24">
        <div className="flex items-center justify-center gap-2">
          {(['eras', 'timeline', 'grid'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-2 text-sm tracking-wide transition-all duration-300 ${
                viewMode === mode
                  ? 'text-cream border-b-2 border-tobacco'
                  : 'text-muted-foreground hover:text-cream'
              }`}
            >
              {mode === 'eras' ? 'By Era' : mode === 'timeline' ? 'Timeline' : 'All Cycles'}
            </button>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* ERAS VIEW - Grouped by emotional period */}
      {/* ============================================ */}
      {viewMode === 'eras' && (
        <section className="px-6 py-12 md:px-12 lg:px-24">
          <div className="max-w-3xl mx-auto space-y-20">
            {LISTENING_ERAS.map((era) => (
              <EraCard key={era.id} era={era} onSelectCycle={setSelectedCycle} />
            ))}
          </div>
        </section>
      )}

      {/* ============================================ */}
      {/* TIMELINE VIEW - Chronological */}
      {/* ============================================ */}
      {viewMode === 'timeline' && (
        <section className="px-6 py-12 md:px-12 lg:px-24">
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-tobacco/50 via-tobacco/20 to-transparent" />
              
              <div className="space-y-12">
                {PAST_CYCLES.map((cycle, i) => (
                  <TimelineCycleCard 
                    key={cycle.id} 
                    cycle={cycle} 
                    isFirst={i === 0}
                    onClick={() => setSelectedCycle(cycle)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============================================ */}
      {/* GRID VIEW - All cycles */}
      {/* ============================================ */}
      {viewMode === 'grid' && (
        <section className="px-6 py-12 md:px-12 lg:px-24">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {PAST_CYCLES.map((cycle) => (
                <GridCycleCard 
                  key={cycle.id} 
                  cycle={cycle}
                  onClick={() => setSelectedCycle(cycle)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============================================ */}
      {/* CYCLE DETAIL MODAL */}
      {/* ============================================ */}
      {selectedCycle && (
        <CycleDetailModal 
          cycle={selectedCycle} 
          onClose={() => setSelectedCycle(null)} 
        />
      )}
    </div>
  )
}

// ============================================
// ERA CARD COMPONENT
// ============================================
function EraCard({ 
  era, 
  onSelectCycle 
}: { 
  era: ListeningEra
  onSelectCycle: (cycle: ListeningCycle) => void 
}) {
  return (
    <div className="animate-fade-in-up">
      {/* Era header */}
      <div className="mb-8">
        <p className="text-xs text-tobacco uppercase tracking-wider mb-2">{era.timeRange}</p>
        <h3 className="font-serif text-2xl md:text-3xl text-cream mb-4">{era.name}</h3>
        <p className="text-cream/70 leading-relaxed">{era.description}</p>
      </div>
      
      {/* Archetype journey */}
      <div className="flex items-center gap-4 mb-8 py-4 border-y border-border/20">
        <span className="font-serif text-cream/50">{era.archetypeJourney.start}</span>
        <svg className="w-5 h-5 text-tobacco" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
        <span className="font-serif text-cream">{era.archetypeJourney.end}</span>
      </div>
      
      {/* Cycles in this era */}
      <div className="space-y-4">
        {era.cycles.map((cycle) => (
          <div 
            key={cycle.id}
            className="flex gap-4 p-4 bg-card/30 border border-border/20 cursor-pointer hover:border-tobacco/30 transition-all duration-500"
            onClick={() => onSelectCycle(cycle)}
          >
            <AlbumCover
              src={cycle.album.cover}
              alt={cycle.album.title}
              title={cycle.album.title}
              artist={cycle.album.artist}
              className="w-16 h-16 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <h4 className="font-serif text-cream truncate">{cycle.album.title}</h4>
                <span className="text-xs text-muted-foreground shrink-0">Week {cycle.week}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{cycle.album.artist}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{cycle.room.name}</span>
                <span className="w-1 h-1 rounded-full bg-tobacco/40" />
                <span>{cycle.userEngagement.annotations} annotations</span>
              </div>
            </div>
            {cycle.stillResonates.isTrue && (
              <div className="shrink-0">
                <span className="text-[10px] uppercase tracking-wider text-burgundy">Still resonates</span>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Era stats */}
      <div className="flex items-center gap-6 mt-6 text-xs text-muted-foreground">
        <span>{era.cycles.length} cycles</span>
        <span>{era.totalAnnotations} annotations</span>
        <span className="text-tobacco">{era.dominantThemes.slice(0, 2).join(', ')}</span>
      </div>
    </div>
  )
}

// ============================================
// TIMELINE CYCLE CARD
// ============================================
function TimelineCycleCard({ 
  cycle, 
  isFirst,
  onClick 
}: { 
  cycle: ListeningCycle
  isFirst: boolean
  onClick: () => void
}) {
  return (
    <div className="relative pl-12 animate-fade-in-up">
      {/* Timeline dot */}
      <div className={`absolute left-4 top-2 w-4 h-4 rounded-full border-2 ${
        isFirst ? 'bg-tobacco border-tobacco' : 'bg-background border-tobacco/50'
      }`} />
      
      <div 
        className="bg-card/30 border border-border/20 p-6 cursor-pointer hover:border-tobacco/30 transition-all duration-500"
        onClick={onClick}
      >
        <div className="flex gap-4">
          <AlbumCover
            src={cycle.album.cover}
            alt={cycle.album.title}
            title={cycle.album.title}
            artist={cycle.album.artist}
            className="w-24 h-24 shrink-0"
          />
          <div className="flex-1">
            <p className="text-xs text-tobacco mb-2">{cycle.seasonLabel} · Week {cycle.week}</p>
            <h4 className="font-serif text-xl text-cream mb-1">{cycle.album.title}</h4>
            <p className="text-muted-foreground mb-3">{cycle.album.artist}</p>
            <p className="text-sm text-cream/60">{cycle.room.name}</p>
          </div>
        </div>
        
        {/* Key annotation preview */}
        {cycle.keyAnnotations[0] && (
          <div className="mt-4 pt-4 border-t border-border/20">
            <p className="font-serif text-cream/80 italic text-sm">
              &ldquo;{cycle.keyAnnotations[0].content}&rdquo;
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {cycle.keyAnnotations[0].trackTitle} · {cycle.keyAnnotations[0].timestamp}
            </p>
          </div>
        )}
        
        {/* Identity impact */}
        {cycle.identityImpact.archetypeBefore !== cycle.identityImpact.archetypeAfter && (
          <div className="mt-4 flex items-center gap-2 text-xs">
            <span className="text-cream/50">{cycle.identityImpact.archetypeBefore}</span>
            <svg className="w-4 h-4 text-burgundy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
            <span className="text-cream">{cycle.identityImpact.archetypeAfter}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// GRID CYCLE CARD
// ============================================
function GridCycleCard({ 
  cycle,
  onClick 
}: { 
  cycle: ListeningCycle
  onClick: () => void
}) {
  return (
    <div 
      className="group cursor-pointer"
      onClick={onClick}
    >
      <div className="relative aspect-square mb-3 overflow-hidden">
        <AlbumCover
          src={cycle.album.cover}
          alt={cycle.album.title}
          title={cycle.album.title}
          artist={cycle.album.artist}
          fill
          className="group-hover:scale-105 transition-transform duration-700"
        />
        {cycle.stillResonates.isTrue && (
          <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-burgundy" title="Still resonates" />
        )}
      </div>
      <p className="text-xs text-tobacco mb-1">{cycle.seasonLabel}</p>
      <h4 className="font-serif text-cream text-sm mb-0.5 truncate">{cycle.album.title}</h4>
      <p className="text-xs text-muted-foreground truncate">{cycle.album.artist}</p>
    </div>
  )
}

// ============================================
// CYCLE DETAIL MODAL
// ============================================
function CycleDetailModal({ 
  cycle, 
  onClose 
}: { 
  cycle: ListeningCycle
  onClose: () => void 
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/95 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-card border border-border/30 max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-fade-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-cream transition-colors z-10"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        {/* Hero */}
        <div className="relative h-64 overflow-hidden">
          <div className="absolute inset-0">
            <AlbumCover
              src={cycle.album.cover}
              alt={cycle.album.title}
              title={cycle.album.title}
              artist={cycle.album.artist}
              fill
              className="opacity-40 blur-lg scale-110"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <p className="text-xs text-tobacco uppercase tracking-wider mb-2">
              {cycle.seasonLabel} · {cycle.room.name}
            </p>
            <div className="flex gap-6">
              <AlbumCover
                src={cycle.album.cover}
                alt={cycle.album.title}
                title={cycle.album.title}
                artist={cycle.album.artist}
                className="w-24 h-24 shadow-xl shrink-0"
              />
              <div>
                <h2 className="font-serif text-2xl text-cream mb-1">{cycle.album.title}</h2>
                <p className="text-muted-foreground">{cycle.album.artist} · {cycle.album.year}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-8 space-y-10">
          {/* Curator's Note */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4">
              Curator&apos;s Note
            </p>
            <h3 className="font-serif text-xl text-cream mb-4">{cycle.curatorNote.title}</h3>
            <p className="text-cream/80 leading-relaxed whitespace-pre-line">
              {cycle.curatorNote.fullText}
            </p>
            <p className="text-xs text-tobacco mt-4">— {cycle.curatorNote.author}</p>
          </div>
          
          {/* Listening Prompts */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4">
              That Week&apos;s Prompts
            </p>
            <div className="space-y-4">
              {cycle.prompts.map((prompt, i) => (
                <div key={i} className="border-l-2 border-tobacco/30 pl-4">
                  <p className="text-cream/90 mb-1">{prompt.question}</p>
                  <p className="text-sm text-cream/50 italic">{prompt.hint}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Your Annotations */}
          {cycle.keyAnnotations.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4">
                Your Annotations From This Cycle
              </p>
              <div className="space-y-4">
                {cycle.keyAnnotations.map((annotation, i) => (
                  <div key={i} className="bg-card/50 border border-border/20 p-4">
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-xs text-tobacco">{annotation.timestamp}</span>
                      <span className="text-xs text-muted-foreground">{annotation.trackTitle}</span>
                    </div>
                    <p className="font-serif text-cream/90 italic">
                      &ldquo;{annotation.content}&rdquo;
                    </p>
                    {annotation.emotion && (
                      <p className="text-xs text-burgundy mt-2">{annotation.emotion}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Identity Impact */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4">
              How This Cycle Changed You
            </p>
            <p className="text-cream/80 leading-relaxed mb-4">
              {cycle.identityImpact.shiftDescription}
            </p>
            {cycle.identityImpact.archetypeBefore !== cycle.identityImpact.archetypeAfter && (
              <div className="flex items-center gap-4 py-3 border-y border-border/20">
                <span className="font-serif text-cream/50">{cycle.identityImpact.archetypeBefore}</span>
                <svg className="w-5 h-5 text-burgundy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <span className="font-serif text-cream">{cycle.identityImpact.archetypeAfter}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              {cycle.identityImpact.dimensionsAffected.map((dim) => (
                <span key={dim} className="text-xs px-2 py-1 bg-burgundy/10 text-burgundy border border-burgundy/20">
                  {dim}
                </span>
              ))}
            </div>
          </div>
          
          {/* Still Resonates */}
          {cycle.stillResonates.isTrue && (
            <div className="bg-burgundy/10 border border-burgundy/20 p-6">
              <p className="text-[10px] uppercase tracking-[0.4em] text-burgundy mb-3">
                This Cycle Still Resonates
              </p>
              <p className="text-cream/80 leading-relaxed mb-4">
                {cycle.stillResonates.resonanceNote}
              </p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{cycle.stillResonates.returnsSince} returns since this cycle</span>
                {cycle.stillResonates.lastReturn && (
                  <span>Last return: {new Date(cycle.stillResonates.lastReturn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                )}
              </div>
            </div>
          )}
          
          {/* Engagement */}
          <div className="flex items-center justify-between py-4 border-t border-border/20 text-sm text-muted-foreground">
            <span>{cycle.userEngagement.listeningSessions} sessions</span>
            <span>{cycle.userEngagement.annotations} annotations</span>
            <span>{cycle.userEngagement.savedMoments} saved moments</span>
          </div>
          
          {/* Return to Cycle */}
          <div className="flex justify-center">
            <button className="flex items-center gap-2 px-6 py-3 bg-tobacco/20 text-cream hover:bg-tobacco/30 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              <span className="text-sm">Return to This Cycle</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
