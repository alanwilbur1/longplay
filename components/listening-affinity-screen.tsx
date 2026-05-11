'use client'

import Link from 'next/link'
import { AlbumCover, AlbumThumb } from '@/components/album-cover'
import { ALBUMS } from '@/lib/albums'

// Club data with real album artwork from centralized source
const CLUBS = [
  {
    name: "The Nocturnal Room",
    description: "Records built around atmosphere, late-hour intimacy, emotional restraint, and slow accumulation.",
    affinityReason: "Your taste profile suggests you may feel at home here. You gravitate toward music that rewards patience and finds beauty in restraint.",
    emotionalFit: "Contemplative, Intimate, Twilight",
    sonicFit: "Ambient textures, whispered vocals, sparse arrangements",
    currentCycle: "Grouper — Ruins",
    sampleAlbums: [ALBUMS.forEmma, ALBUMS.carrieAndLowell, ALBUMS.pinkMoon],
    affinity: "Strong" as const,
  },
  {
    name: "Analog Futures",
    description: "Tactile production, synthetic warmth, and records that feel both old and not-yet-invented.",
    affinityReason: "Your preference for textured production and forward-thinking arrangements aligns with listeners here.",
    emotionalFit: "Curious, Warm, Otherworldly",
    sonicFit: "Analog synths, tape hiss, retro-futurism",
    currentCycle: "Broadcast — Tender Buttons",
    sampleAlbums: [ALBUMS.spiritOfEden, ALBUMS.kidA, ALBUMS.homogenic],
    affinity: "Strong" as const,
  },
  {
    name: "The Cathedral Hour",
    description: "Sacred spaces in secular music. Reverence, grandeur, and the architecture of sound.",
    affinityReason: "You respond to music with a sense of scale and transcendence. Records that feel like entering a vast interior space.",
    emotionalFit: "Reverent, Expansive, Hushed",
    sonicFit: "Choral textures, organ drones, orchestral swells",
    currentCycle: "Arvo Pärt — Tabula Rasa",
    sampleAlbums: [ALBUMS.aMoonShapedPool, ALBUMS.musicFor18Musicians, ALBUMS.vespertine],
    affinity: "Moderate" as const,
  },
  {
    name: "Beautiful Damage",
    description: "Music that holds both tenderness and fracture. The gorgeous and the broken, unresolved.",
    affinityReason: "Your listening suggests comfort with emotional complexity. You don't need resolution—you're drawn to albums that hold tension.",
    emotionalFit: "Bittersweet, Fragile, Defiant",
    sonicFit: "Distorted beauty, delicate noise, vocal cracks",
    currentCycle: "Punisher — Phoebe Bridgers",
    sampleAlbums: [ALBUMS.punisher, ALBUMS.eitherOr, ALBUMS.aCrowLookedAtMe],
    affinity: "Strong" as const,
  },
  {
    name: "Deep Cuts & Slow Burns",
    description: "The overlooked, the underrated, the records that reveal themselves over time.",
    affinityReason: "You listen with patience. Albums grow on you, and you return to records years later to find new meaning.",
    emotionalFit: "Patient, Devoted, Rewarded",
    sonicFit: "Subtle layers, growers, late bloomers",
    currentCycle: "Arthur Russell — World of Echo",
    sampleAlbums: [ALBUMS.ys, ALBUMS.spiderland, ALBUMS.laughingStock],
    affinity: "Moderate" as const,
  },
  {
    name: "Blue Hour Jazz",
    description: "The liminal hours. Jazz that lives in the space between night and morning.",
    affinityReason: "Your taste for reflective, emotionally complex music suggests a natural alignment with late-night jazz listening.",
    emotionalFit: "Nocturnal, Solitary, Sophisticated",
    sonicFit: "Cool jazz, modal explorations, midnight tones",
    currentCycle: "Bill Evans — Waltz for Debby",
    sampleAlbums: [ALBUMS.kindOfBlue, ALBUMS.blue, ALBUMS.aLoveSupreme],
    affinity: "Light" as const,
  },
]

export function ListeningAffinityScreen() {
  return (
    <div className="grain relative pb-24 md:pb-0 md:pt-16">
      {/* Hero */}
      <section className="px-6 pt-12 pb-16 md:px-12 lg:px-24">
        <p className="text-[10px] uppercase tracking-[0.4em] text-tobacco mb-10 text-center animate-fade-in">
          Your Listening Affinity
        </p>
        
        <div className="max-w-2xl mx-auto text-center animate-fade-in-up">
          <h1 className="font-serif text-4xl md:text-5xl text-cream mb-8 leading-tight">
            Where Your Listening Belongs
          </h1>
          <p className="font-serif text-lg text-cream/70 leading-relaxed">
            There is a room here for the kind of listener you are. Based on your taste identity, 
            these are the clubs and listening communities where you might feel at home.
          </p>
        </div>
      </section>

      {/* Primary Affinity - Feature Card */}
      <section className="px-6 py-16 md:px-12 lg:px-24 bg-burgundy/10 border-y border-burgundy/20">
        <div className="max-w-3xl mx-auto animate-fade-in-up">
          <p className="text-[10px] uppercase tracking-[0.4em] text-tobacco mb-6">Strongest Affinity</p>
          
          <h2 className="font-serif text-3xl md:text-4xl text-cream mb-6">{CLUBS[0].name}</h2>
          <p className="font-serif text-xl text-cream/80 mb-8 leading-relaxed">
            {CLUBS[0].description}
          </p>
          
          <div className="bg-card/30 p-6 border border-border/20 mb-8">
            <p className="text-cream/70 leading-relaxed italic">
              {'"'}{CLUBS[0].affinityReason}{'"'}
            </p>
          </div>

          {/* Sample Albums */}
          <div className="mb-8">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">Albums you might find here</p>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {CLUBS[0].sampleAlbums.map((album) => (
                <div key={album.id} className="shrink-0 w-28">
                  <div className="relative aspect-square mb-2 overflow-hidden bg-muted">
                    <AlbumCover
                      src={album.cover}
                      alt={album.title}
                      title={album.title}
                      artist={album.artist}
                      fill
                    />
                  </div>
                  <p className="text-xs text-cream truncate">{album.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{album.artist}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Current Cycle */}
          <div className="flex items-center justify-between p-4 bg-card/20 border border-border/10 mb-8">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Current Listening Cycle</p>
              <p className="font-serif text-lg text-cream">{CLUBS[0].currentCycle}</p>
            </div>
            <Link 
              href="/club" 
              className="text-sm text-tobacco hover:text-cream transition-colors duration-300"
            >
              Enter Club
            </Link>
          </div>

          {/* Fit Tags */}
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Emotional Fit</p>
              <div className="flex flex-wrap gap-2">
                {CLUBS[0].emotionalFit.split(', ').map((tag) => (
                  <span key={tag} className="text-xs px-3 py-1.5 bg-burgundy/20 text-cream/80">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Sonic Fit</p>
              <p className="text-sm text-cream/60">{CLUBS[0].sonicFit}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Other Clubs Grid */}
      <section className="px-6 py-16 md:px-12 lg:px-24">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-8">
          Other Rooms For You
        </p>
        
        <div className="space-y-8 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6">
          {CLUBS.slice(1).map((club, index) => (
            <ClubCard key={club.name} club={club} index={index} />
          ))}
        </div>
      </section>

      {/* Closing */}
      <section className="px-6 py-20 md:px-12 lg:px-24 bg-navy/15 border-t border-border/20">
        <div className="max-w-lg mx-auto text-center animate-fade-in">
          <p className="font-serif text-2xl text-cream leading-relaxed mb-8">
            These rooms are waiting. Each one holds listeners who hear the way you hear.
          </p>
          <p className="text-cream/60 text-sm">
            Your affinity evolves as you listen. New clubs may appear as your taste expands.
          </p>
        </div>
      </section>
    </div>
  )
}

function ClubCard({ club, index }: { club: typeof CLUBS[0]; index: number }) {
  return (
    <div 
      className="bg-card/30 border border-border/20 p-6 animate-fade-in-up group"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Club Header */}
      <div className="flex items-start justify-between mb-4">
        <h3 className="font-serif text-xl text-cream">{club.name}</h3>
        <span className={`text-xs px-2 py-1 ${
          club.affinity === 'Strong' 
            ? 'bg-tobacco/20 text-tobacco' 
            : club.affinity === 'Moderate'
            ? 'bg-muted/30 text-cream/60'
            : 'bg-muted/20 text-cream/40'
        }`}>
          {club.affinity} affinity
        </span>
      </div>

      {/* Description */}
      <p className="text-cream/70 leading-relaxed mb-4 text-sm">
        {club.description}
      </p>

      {/* Affinity Reason */}
      <p className="text-cream/50 text-sm italic mb-6 leading-relaxed">
        {club.affinityReason}
      </p>

      {/* Sample Albums - Small */}
      <div className="flex gap-2 mb-6">
        {club.sampleAlbums.slice(0, 3).map((album) => (
          <AlbumThumb
            key={album.id}
            src={album.cover}
            title={album.title}
            artist={album.artist}
            size="md"
          />
        ))}
      </div>

      {/* Current Cycle */}
      <div className="pt-4 border-t border-border/10 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Now listening</p>
          <p className="text-sm text-cream/80">{club.currentCycle}</p>
        </div>
        <Link 
          href="/club" 
          className="text-xs text-tobacco hover:text-cream transition-colors duration-300 opacity-0 group-hover:opacity-100"
        >
          Enter
        </Link>
      </div>
    </div>
  )
}
