'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlbumCover, AlbumThumb } from '@/components/album-cover'
import { ALBUMS, type Album } from '@/lib/albums'
import {
  LISTENING_PERIODS,
  ARCHETYPE_EVOLUTION,
  FORMATIVE_RECORDS,
  RESURFACED_MOMENTS,
  QUIET_MILESTONES,
  SONIC_THREADS,
  SEARCH_FACETS,
  YEAR_IN_REVIEW_2026,
} from '@/lib/archive'

export function ListeningLifeScreen() {
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFacet, setSelectedFacet] = useState<string | null>(null)

  return (
    <div className="grain relative pb-24 md:pb-0">
      {/* ============================================ */}
      {/* HERO - The Private Museum */}
      {/* ============================================ */}
      <section className="relative min-h-[100svh] flex items-center justify-center px-6 py-24">
        {/* Atmospheric background - layered album covers */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            {[ALBUMS.forEmma, ALBUMS.blue, ALBUMS.pinkMoon].map((album, i) => (
              <div 
                key={album.id}
                className="absolute"
                style={{
                  left: `${20 + i * 30}%`,
                  top: `${15 + i * 20}%`,
                  transform: `rotate(${-5 + i * 5}deg)`,
                }}
              >
                <AlbumCover
                  src={album.cover}
                  alt=""
                  title={album.title}
                  artist={album.artist}
                  className="w-48 h-48 opacity-40 blur-sm"
                />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
        </div>
        
        <div className="text-center animate-fade-in-slow max-w-lg mx-auto">
          <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-10">
            A Lifelong Archive
          </p>
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-cream mb-8 leading-tight">
            Your Listening Life
          </h1>
          <p className="text-cream/60 leading-relaxed mb-6">
            Not statistics. Not a recap.
          </p>
          <p className="font-serif text-xl text-cream/80 leading-relaxed mb-8">
            A private museum of who you became—<br />
            through the music that accompanied you.
          </p>
          
          <div className="mt-16 flex items-center justify-center gap-3 text-muted-foreground text-sm">
            <span>847 listening sessions</span>
            <span className="w-1 h-1 rounded-full bg-tobacco/40" />
            <span>174 annotations</span>
            <span className="w-1 h-1 rounded-full bg-tobacco/40" />
            <span>Still unfolding</span>
          </div>
          
          {/* Quick access to Past Cycles */}
          <Link 
            href="/archive/cycles"
            className="inline-flex items-center gap-2 mt-10 text-sm text-tobacco hover:text-cream transition-colors"
          >
            <span>Browse Past Listening Cycles</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ============================================ */}
      {/* RESURFACED MOMENTS - Memory triggers */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 bg-burgundy/5 border-y border-burgundy/10">
        <p className="text-[10px] uppercase tracking-[0.4em] text-burgundy mb-8 text-center">
          From Your Archive
        </p>
        
        <div className="max-w-md mx-auto">
          {RESURFACED_MOMENTS.slice(0, 2).map((moment, i) => (
            <div 
              key={i}
              className={`py-6 ${i > 0 ? 'border-t border-burgundy/10' : ''}`}
            >
              <p className="text-xs text-tobacco mb-3">{moment.when}</p>
              {moment.type === 'annotation' && moment.album && (
                <div className="flex gap-4">
                  <AlbumThumb
                    src={moment.album.cover}
                    title={moment.album.title}
                    artist={moment.album.artist}
                    size="sm"
                  />
                  <div className="flex-1">
                    <p className="font-serif text-cream/90 italic mb-2">
                      &ldquo;{moment.content}&rdquo;
                    </p>
                    <p className="text-xs text-muted-foreground">{moment.context}</p>
                  </div>
                </div>
              )}
              {moment.type === 'club-memory' && (
                <div>
                  <p className="font-serif text-lg text-cream mb-2">{moment.content}</p>
                  <p className="text-sm text-cream/60">{moment.context}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* LISTENING PERIODS - Chapters of your life */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4 text-center">
          Listening Periods
        </p>
        <p className="text-center text-cream/50 text-sm mb-16 max-w-sm mx-auto">
          Identifiable eras in your musical life—chapters that emerged from how you listened
        </p>
        
        <div className="max-w-2xl mx-auto space-y-16">
          {LISTENING_PERIODS.map((period, i) => (
            <div 
              key={period.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="flex items-start gap-6">
                {/* Timeline marker */}
                <div className="hidden md:flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${i === LISTENING_PERIODS.length - 1 ? 'bg-tobacco' : 'bg-muted-foreground/40'}`} />
                  {i < LISTENING_PERIODS.length - 1 && (
                    <div className="w-px h-full bg-gradient-to-b from-muted-foreground/40 to-transparent min-h-[100px]" />
                  )}
                </div>
                
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    {period.timeRange}
                  </p>
                  <h3 className="font-serif text-2xl md:text-3xl text-cream mb-4">
                    {period.name}
                  </h3>
                  <p className="text-cream/70 leading-relaxed mb-6">
                    {period.description}
                  </p>
                  
                  {/* Albums from this period */}
                  <div className="flex gap-3 mb-4">
                    {period.albums.slice(0, 3).map((album) => (
                      <div key={album.id} className="flex items-center gap-2">
                        <AlbumThumb
                          src={album.cover}
                          title={album.title}
                          artist={album.artist}
                          size="sm"
                        />
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="text-tobacco">{period.archetype}</span>
                    <span>{period.annotations} annotations</span>
                    <span className="capitalize">{period.dominantEmotion}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* ARCHETYPE EVOLUTION - How you changed */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24 bg-card/30">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4 text-center">
          Archetype Evolution
        </p>
        <p className="text-center font-serif text-xl text-cream/80 mb-16 max-w-md mx-auto">
          You were once one kind of listener. Over time, another emerged.
        </p>
        
        <div className="max-w-lg mx-auto space-y-12">
          {ARCHETYPE_EVOLUTION.map((shift, i) => (
            <div key={i} className="animate-fade-in-up">
              <div className="flex items-center gap-4 mb-4">
                <span className="font-serif text-lg text-cream/50">{shift.from}</span>
                <svg className="w-6 h-6 text-tobacco" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <span className="font-serif text-lg text-cream">{shift.to}</span>
              </div>
              <p className="text-xs text-tobacco mb-2">{shift.when}</p>
              <p className="text-cream/70 leading-relaxed">{shift.insight}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* RECORDS THAT SHAPED YOU */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4 text-center">
          Records That Shaped You
        </p>
        <p className="text-center text-cream/50 text-sm mb-6 max-w-sm mx-auto">
          Not your &ldquo;top albums.&rdquo; The records that altered who you are.
        </p>
        <p className="text-center font-serif text-xl text-cream/80 mb-16 max-w-md mx-auto italic">
          &ldquo;These records explain who I became.&rdquo;
        </p>
        
        <div className="max-w-2xl mx-auto space-y-16">
          {FORMATIVE_RECORDS.map((record, i) => (
            <div 
              key={record.album.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="flex flex-col md:flex-row gap-6">
                {/* Album artwork */}
                <div className="w-32 h-32 md:w-40 md:h-40 shrink-0 mx-auto md:mx-0">
                  <AlbumCover
                    src={record.album.cover}
                    alt={record.album.title}
                    title={record.album.title}
                    artist={record.album.artist}
                    fill
                    className="shadow-xl"
                  />
                </div>
                
                <div className="flex-1">
                  <p className="text-xs text-tobacco mb-2">Discovered {record.discoveredWhen}</p>
                  <h4 className="font-serif text-2xl text-cream mb-1">{record.album.title}</h4>
                  <p className="text-muted-foreground mb-4">{record.album.artist}</p>
                  
                  <p className="text-cream/80 leading-relaxed mb-4">
                    {record.significance}
                  </p>
                  
                  {/* Key moment */}
                  <div className="bg-card/50 border border-border/20 p-4 mb-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Key Moment</p>
                    <p className="font-serif text-cream/90 italic text-sm leading-relaxed">
                      {record.keyMoment}
                    </p>
                  </div>
                  
                  {/* Context */}
                  <p className="text-sm text-cream/60 italic">{record.lifeContext}</p>
                  
                  <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                    <span>{record.returns} returns</span>
                    <span>{record.annotations} annotations</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* SONIC THREADS - Patterns across listening */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24 bg-navy/10">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4 text-center">
          Sonic Threads
        </p>
        <p className="text-center text-cream/50 text-sm mb-16 max-w-sm mx-auto">
          Patterns that emerged across your listening—themes that kept appearing
        </p>
        
        <div className="max-w-lg mx-auto space-y-10">
          {SONIC_THREADS.map((thread, i) => (
            <div key={thread.name} className="animate-fade-in-up">
              <h4 className="font-serif text-xl text-cream mb-3">{thread.name}</h4>
              <p className="text-cream/70 leading-relaxed mb-4">{thread.description}</p>
              <div className="flex items-center gap-3 mb-4">
                {thread.examples.map((album) => (
                  <AlbumThumb
                    key={album.id}
                    src={album.cover}
                    title={album.title}
                    artist={album.artist}
                    size="sm"
                  />
                ))}
              </div>
              <p className="text-xs text-tobacco">{thread.frequency}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* QUIET MILESTONES - No gamification */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4 text-center">
          Quiet Milestones
        </p>
        <p className="text-center text-cream/50 text-sm mb-16 max-w-sm mx-auto">
          Thresholds crossed. Acknowledged without fanfare.
        </p>
        
        <div className="max-w-md mx-auto space-y-8">
          {QUIET_MILESTONES.map((milestone, i) => (
            <div 
              key={milestone.title}
              className="border-l-2 border-tobacco/30 pl-6 animate-fade-in-up"
            >
              <p className="text-xs text-tobacco mb-2">{milestone.when}</p>
              <h4 className="font-serif text-lg text-cream mb-2">{milestone.title}</h4>
              <p className="text-cream/70 text-sm mb-2">{milestone.description}</p>
              <p className="text-cream/50 text-sm italic">{milestone.reflection}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* ARCHIVE SEARCH - Beautiful exploration */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24 bg-card/30 border-y border-border/20">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4 text-center">
          Explore Your Archive
        </p>
        <p className="text-center text-cream/50 text-sm mb-12 max-w-sm mx-auto">
          Search by mood, texture, period, or annotation
        </p>
        
        <div className="max-w-md mx-auto">
          {/* Search input */}
          <div className="relative mb-8">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your listening history..."
              className="w-full bg-background/50 border border-border/30 px-4 py-3 text-cream placeholder:text-muted-foreground focus:outline-none focus:border-tobacco/50 transition-colors"
            />
            <svg 
              className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </div>
          
          {/* Facets */}
          <div className="space-y-6">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">By Emotion</p>
              <div className="flex flex-wrap gap-2">
                {SEARCH_FACETS.emotions.map((emotion) => (
                  <button
                    key={emotion}
                    onClick={() => setSelectedFacet(emotion)}
                    className={`px-3 py-1.5 text-xs border transition-all duration-300 ${
                      selectedFacet === emotion
                        ? 'border-tobacco bg-tobacco/20 text-cream'
                        : 'border-border/30 text-muted-foreground hover:border-tobacco/50 hover:text-cream'
                    }`}
                  >
                    {emotion}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">By Texture</p>
              <div className="flex flex-wrap gap-2">
                {SEARCH_FACETS.textures.map((texture) => (
                  <button
                    key={texture}
                    onClick={() => setSelectedFacet(texture)}
                    className={`px-3 py-1.5 text-xs border transition-all duration-300 ${
                      selectedFacet === texture
                        ? 'border-tobacco bg-tobacco/20 text-cream'
                        : 'border-border/30 text-muted-foreground hover:border-tobacco/50 hover:text-cream'
                    }`}
                  >
                    {texture}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">By Period</p>
              <div className="flex flex-wrap gap-2">
                {SEARCH_FACETS.periods.map((period) => (
                  <button
                    key={period}
                    onClick={() => setSelectedFacet(period)}
                    className={`px-3 py-1.5 text-xs border transition-all duration-300 ${
                      selectedFacet === period
                        ? 'border-burgundy bg-burgundy/20 text-cream'
                        : 'border-border/30 text-muted-foreground hover:border-burgundy/50 hover:text-cream'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* YEAR IN REVIEW PREVIEW */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4 text-center">
          Year In Review
        </p>
        <p className="text-center font-serif text-2xl md:text-3xl text-cream mb-6">
          2026
        </p>
        <p className="text-center text-cream/50 text-sm mb-12 max-w-sm mx-auto">
          Not Spotify Wrapped. A beautifully written personal essay.
        </p>
        
        <div className="max-w-lg mx-auto">
          <div className="bg-card/50 border border-border/20 p-8 md:p-10">
            <p className="font-serif text-cream/90 leading-relaxed mb-8 text-lg">
              {YEAR_IN_REVIEW_2026.openingReflection.slice(0, 200)}...
            </p>
            
            <div className="flex items-center gap-4 mb-8 py-4 border-y border-border/20">
              <div className="text-center flex-1">
                <p className="font-serif text-2xl text-cream">847</p>
                <p className="text-xs text-muted-foreground">sessions</p>
              </div>
              <div className="text-center flex-1">
                <p className="font-serif text-2xl text-cream">174</p>
                <p className="text-xs text-muted-foreground">annotations</p>
              </div>
              <div className="text-center flex-1">
                <p className="font-serif text-2xl text-cream">4</p>
                <p className="text-xs text-muted-foreground">periods</p>
              </div>
            </div>
            
            <Link 
              href="/archive/2026"
              className="block text-center py-4 border border-cream/20 text-cream/80 text-sm hover:bg-cream/5 transition-colors duration-500"
            >
              Read Your 2026 Review
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* CLOSING - The Irreplaceable Archive */}
      {/* ============================================ */}
      <section className="px-6 py-24 md:px-12 lg:px-24 bg-burgundy/5">
        <div className="max-w-lg mx-auto text-center">
          <p className="font-serif text-2xl md:text-3xl text-cream leading-relaxed mb-10">
            This archive is yours.
            <br />
            <span className="text-cream/60">It grows with every listen.</span>
          </p>
          <p className="text-cream/60 leading-relaxed mb-6">
            Every annotation, every return to an album, every late-night listening session adds to this portrait of who you are becoming through music.
          </p>
          <p className="text-cream/50 leading-relaxed mb-12">
            This is not a feature. This is memory. This is your listening life, kept on your behalf.
          </p>
          <p className="text-xs text-tobacco uppercase tracking-[0.4em]">
            Updated with every listen
          </p>
        </div>
      </section>
    </div>
  )
}
