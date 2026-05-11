'use client'

import Link from 'next/link'
import { AlbumCover, AlbumThumb } from '@/components/album-cover'
import { YEAR_IN_REVIEW_2026 } from '@/lib/archive'

export function YearInReviewScreen() {
  const review = YEAR_IN_REVIEW_2026

  return (
    <div className="grain relative pb-24 md:pb-0">
      {/* ============================================ */}
      {/* OPENING - Literary, not celebratory */}
      {/* ============================================ */}
      <section className="relative min-h-[100svh] flex items-center justify-center px-6 py-24">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-radial from-burgundy/10 via-transparent to-transparent opacity-30" />
        </div>
        
        <div className="text-center animate-fade-in-slow max-w-lg mx-auto">
          <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-10">
            Year In Review
          </p>
          <h1 className="font-serif text-6xl md:text-7xl lg:text-8xl text-cream mb-8">
            {review.year}
          </h1>
          <p className="text-cream/60 leading-relaxed mb-8">
            Not a recap. Not statistics.
          </p>
          <p className="font-serif text-xl text-cream/80 leading-relaxed">
            A portrait of who you became—<br />
            through the music that accompanied you.
          </p>
        </div>
      </section>

      {/* ============================================ */}
      {/* OPENING REFLECTION - Essay style */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24">
        <div className="max-w-2xl mx-auto">
          <p className="font-serif text-xl md:text-2xl text-cream leading-relaxed animate-fade-in-slow">
            {review.openingReflection}
          </p>
        </div>
      </section>

      {/* ============================================ */}
      {/* ARCHETYPE JOURNEY */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24 bg-card/30 border-y border-border/20">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-16 text-center">
          The Archetype Journey
        </p>
        
        <div className="max-w-lg mx-auto text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-8">
            <span className="font-serif text-xl text-cream/50">{review.archetypeJourney.start}</span>
            <svg className="w-8 h-8 text-tobacco" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
            <span className="font-serif text-xl text-cream">{review.archetypeJourney.end}</span>
          </div>
          <p className="text-cream/70 leading-relaxed">
            {review.archetypeJourney.narrative}
          </p>
        </div>
      </section>

      {/* ============================================ */}
      {/* EMOTIONAL THEMES */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4 text-center">
          Emotional Themes
        </p>
        <p className="text-center text-cream/50 text-sm mb-16 max-w-sm mx-auto">
          The currents that ran beneath your listening
        </p>
        
        <div className="max-w-2xl mx-auto space-y-12">
          {review.emotionalThemes.map((theme, i) => (
            <div 
              key={theme.theme}
              className="animate-fade-in-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <h3 className="font-serif text-2xl text-cream mb-4">{theme.theme}</h3>
              <p className="text-cream/70 leading-relaxed">{theme.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* RECORDS REVISITED */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24 bg-burgundy/5 border-y border-burgundy/10">
        <p className="text-[10px] uppercase tracking-[0.4em] text-burgundy mb-4 text-center">
          Records Revisited
        </p>
        <p className="text-center text-cream/50 text-sm mb-16 max-w-sm mx-auto">
          The albums you kept returning to
        </p>
        
        <div className="max-w-2xl mx-auto space-y-12">
          {review.recordsRevisited.map((record, i) => (
            <div 
              key={record.album.id}
              className="flex flex-col md:flex-row gap-6 animate-fade-in-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="w-32 h-32 shrink-0 mx-auto md:mx-0 relative">
                <AlbumCover
                  src={record.album.cover}
                  alt={record.album.title}
                  title={record.album.title}
                  artist={record.album.artist}
                  fill
                />
              </div>
              <div className="flex-1 text-center md:text-left">
                <p className="text-tobacco text-sm mb-2">{record.times} returns</p>
                <h4 className="font-serif text-xl text-cream mb-1">{record.album.title}</h4>
                <p className="text-muted-foreground text-sm mb-4">{record.album.artist}</p>
                <p className="text-cream/70 leading-relaxed">{record.significance}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* ANNOTATIONS THAT MATTERED */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4 text-center">
          Annotations That Mattered
        </p>
        <p className="text-center text-cream/50 text-sm mb-16 max-w-sm mx-auto">
          The thoughts that stopped you
        </p>
        
        <div className="max-w-lg mx-auto space-y-12">
          {review.annotationsThatMattered.map((annotation, i) => (
            <div 
              key={i}
              className="border-l-2 border-tobacco/40 pl-6 animate-fade-in-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <p className="font-serif text-lg text-cream/90 italic mb-4">
                &ldquo;{annotation.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3 mb-4">
                <AlbumThumb
                  src={annotation.album.cover}
                  title={annotation.album.title}
                  artist={annotation.album.artist}
                  size="sm"
                />
                <div>
                  <p className="text-sm text-cream/80">{annotation.album.title}</p>
                  <p className="text-xs text-muted-foreground">{annotation.when}</p>
                </div>
              </div>
              <p className="text-cream/60 text-sm leading-relaxed">{annotation.reflection}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* THE NUMBERS - But presented with meaning */}
      {/* ============================================ */}
      <section className="px-6 py-20 md:px-12 lg:px-24 bg-card/30">
        <div className="max-w-lg mx-auto">
          <p className="font-serif text-center text-cream/60 mb-12">
            Numbers don&apos;t capture what actually happened. But they mark the territory.
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="font-serif text-3xl text-cream mb-2">847</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Listening Sessions</p>
            </div>
            <div>
              <p className="font-serif text-3xl text-cream mb-2">174</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Annotations</p>
            </div>
            <div>
              <p className="font-serif text-3xl text-cream mb-2">4</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Listening Periods</p>
            </div>
            <div>
              <p className="font-serif text-3xl text-cream mb-2">3</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Archetype Shifts</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* CLOSING REFLECTION */}
      {/* ============================================ */}
      <section className="px-6 py-24 md:px-12 lg:px-24">
        <div className="max-w-2xl mx-auto">
          <p className="font-serif text-xl md:text-2xl text-cream leading-relaxed mb-12 animate-fade-in-slow">
            {review.closingReflection}
          </p>
          
          <div className="text-center">
            <p className="text-xs text-tobacco uppercase tracking-[0.4em] mb-8">
              This portrait is yours to keep
            </p>
            
            <div className="flex flex-col md:flex-row gap-4 justify-center">
              <button className="px-8 py-4 bg-cream/5 border border-cream/20 text-cream text-sm hover:bg-cream/10 transition-colors duration-500">
                Save to Your Archive
              </button>
              <button className="px-8 py-4 bg-tobacco/20 text-cream text-sm hover:bg-tobacco/30 transition-colors duration-500">
                Share as Living Portrait
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* BACK TO ARCHIVE */}
      {/* ============================================ */}
      <section className="px-6 py-12 border-t border-border/20">
        <div className="max-w-sm mx-auto text-center">
          <Link 
            href="/archive"
            className="text-muted-foreground hover:text-cream text-sm transition-colors duration-500"
          >
            ← Back to Your Listening Life
          </Link>
        </div>
      </section>
    </div>
  )
}
