import { ALBUMS, type Album } from './albums'

/**
 * LongPlay Rooms (Clubs) — Living Listening Cultures
 * 
 * Rooms are NOT social groups or generic communities.
 * Rooms ARE listening philosophies, emotional spaces, and curated cultural environments.
 * 
 * Each room should feel like entering a different cultural world:
 * - authored by a distinct curatorial voice
 * - aesthetically unique (typography, pacing, lighting, motion)
 * - emotionally specific
 * - alive over time
 */

// Fallback album for when data is missing
const FALLBACK_ALBUM: Album = {
  id: 'unknown',
  title: 'Unknown Album',
  artist: 'Unknown Artist',
  year: '',
  cover: '',
  fallbackGradient: 'from-charcoal to-card',
  description: '',
}

function safeAlbum(album: Album | undefined): Album {
  return album ?? FALLBACK_ALBUM
}

// ============================================
// ROOM TYPES
// ============================================
export type RoomType = 'editorial' | 'genre' | 'creator' | 'private'

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

export interface RoomPastCycle {
  id: string
  album: Album
  dateRange: string
  annotationCount: number
  highlights: string[]
}

// Rich curator identity
export interface CuratorProfile {
  id: string
  name: string
  role: string
  avatar?: string
  
  // Editorial voice
  listeningPhilosophy: string // 1-2 sentences on how they listen
  curatorStatement: string // Longer statement about their curatorial approach
  
  // Taste markers
  favoriteRecords: Album[]
  currentObsessions: string[]
  recurringThemes: string[]
  
  // Social presence (optional)
  publications?: string[] // If they write elsewhere
  credentials?: string // Brief background
}

// Room cultural identity
export interface RoomCulture {
  // Manifesto - the room's reason for existing
  manifesto: string // 2-3 paragraphs
  
  // Listening philosophy
  listeningRitual: string // How people listen here
  whatWeLookFor: string[] // 3-4 qualities
  whatWeAvoid: string[] // 2-3 qualities
  
  // Entry ritual
  invitationText: string // Shown before entering
  entryPhrase: string // e.g., "Enter the Room"
  
  // Associated archetypes
  associatedArchetypes: {
    name: string
    description: string
  }[]
  
  // Related rooms
  relatedRooms: string[] // Room slugs
  
  // Seasonal states
  seasonalMoods: {
    winter: { description: string; moodShift: string }
    spring: { description: string; moodShift: string }
    summer: { description: string; moodShift: string }
    autumn: { description: string; moodShift: string }
  }
}

// Visual/aesthetic system per room
export interface RoomAesthetics {
  // CSS class name for theming
  themeClass: string
  
  // Color palette
  primaryAccent: string // e.g., 'text-blue-300/80'
  backgroundGradient: string
  borderTint: string
  
  // Typography rhythm
  typographyStyle: 'intimate' | 'expansive' | 'structured' | 'organic' | 'restrained'
  
  // Motion/pacing
  transitionSpeed: 'slow' | 'medium' | 'deliberate' // How animations feel
  
  // Atmosphere
  grainOpacity: number // 0.02 to 0.05
  glowEffect?: string // Optional ambient glow CSS
  
  // Spacing rhythm
  spacingRhythm: 'tight' | 'breathable' | 'expansive'
}

export interface Room {
  id: string
  slug: string
  name: string
  type: RoomType
  
  // Core identity
  description: string
  tagline?: string
  atmosphere: string
  emotionalTemperature: 'warm' | 'cool' | 'neutral'
  
  // Current cycle
  currentAlbum: Album
  weeklyPhase: 'arrival' | 'private' | 'discussion' | 'curators-note'
  phaseDay: string
  
  // Rich curator profile
  curator: CuratorProfile
  
  // Curator's current note
  curatorNote: {
    title: string
    excerpt: string
    fullText: string
  }
  
  // Prompts
  prompts: {
    question: string
    hint: string
  }[]
  
  // Streaming
  streamingLinks: {
    spotify?: string
    appleMusic?: string
    tidal?: string
  }
  
  // Social proof (ambient, not gamified)
  memberCountLabel: string
  atmosphereNotes: string[]
  
  // Album samples for preview
  albumSample: Album[]
  
  // Past cycles
  pastCycles: RoomPastCycle[]
  
  // Emotional/sonic tags
  emotionalTags: string[]
  sonicTags: string[]
  
  // Cultural identity
  culture: RoomCulture
  
  // Visual aesthetics
  aesthetics: RoomAesthetics
  
  // Current cycle DB id — used for presence substrate (Phase 3B.1A)
  // Null for static/fallback rooms that have no live cycle row.
  cycleId?: string | null

  // Current season (computed from date, but can be overridden)
  currentSeason?: Season
}

// ============================================
// CURATOR PROFILES
// ============================================
const CURATORS: Record<string, CuratorProfile> = {
  eleanorVance: {
    id: 'eleanor-vance',
    name: 'Eleanor Vance',
    role: 'Founding Curator, The Nocturnal Room',
    listeningPhilosophy: 'I listen for what hides in the quiet parts—the breath before a line, the space between notes. The records I love are the ones that trust silence.',
    curatorStatement: 'I started The Nocturnal Room because I kept noticing that my favorite music only made sense after midnight. Not "late night music" as a genre, but music that requires the particular kind of attention that only arrives when the world stops expecting anything from you. These are records that don\'t compete for your attention. They assume you\'ve already decided to listen.',
    favoriteRecords: [safeAlbum(ALBUMS.forEmma), safeAlbum(ALBUMS.pinkMoon), safeAlbum(ALBUMS.carrieAndLowell)],
    currentObsessions: ['The first 30 seconds of any album', 'Records made in isolation', 'The texture of tape hiss'],
    recurringThemes: ['Solitude as creative space', 'The architecture of quiet', 'Music as private ritual'],
    credentials: 'Former music editor at The Quietus. Has written about ambient and folk music for a decade.',
  },
  jamesOkonkwo: {
    id: 'james-okonkwo',
    name: 'James Okonkwo',
    role: 'Electronic Music Curator, Analog Futures',
    listeningPhilosophy: 'The best electronic music remembers it was made by human hands. I listen for the seams—where the machine reveals its maker.',
    curatorStatement: 'Analog Futures exists because I got tired of electronic music being treated as either nostalgic (synthwave, retromania) or purely futuristic (hard techno, abstract). The most interesting electronic music lives in tension: warm machines, breathing synthesizers, programmed performances that feel improvised. This room celebrates technology with soul.',
    favoriteRecords: [safeAlbum(ALBUMS.vespertine), safeAlbum(ALBUMS.ageOf), safeAlbum(ALBUMS.homogenic)],
    currentObsessions: ['Organic synthesis', 'Domestic sounds in production', 'The Matmos approach to sampling'],
    recurringThemes: ['Human-machine dialogue', 'Warmth in digital spaces', 'Intimacy and technology'],
    credentials: 'Producer and sound designer. Runs a modular synthesis workshop in East London.',
  },
  marcusWebb: {
    id: 'marcus-webb',
    name: 'Marcus Webb',
    role: 'Ambient & Sacred Music Curator, Cathedral Hour',
    listeningPhilosophy: 'Some music asks you to enter it like a building. I listen for architecture—for music that creates space rather than fills it.',
    curatorStatement: 'Cathedral Hour is a practice as much as a room. We listen to records that require patience, that build slowly, that create cathedrals in sound. This isn\'t background music—it\'s devotional listening. Every week we practice the discipline of attention, the willingness to let music unfold at its own pace.',
    favoriteRecords: [safeAlbum(ALBUMS.spiritOfEden), safeAlbum(ALBUMS.musicForAirports), safeAlbum(ALBUMS.disintegrationLoops)],
    currentObsessions: ['The drone as meditation', 'Silence as structure', 'Environmental recordings'],
    recurringThemes: ['Patience as practice', 'Sound as architecture', 'Transcendence through attention'],
    credentials: 'Former church musician. Has written extensively on ambient music and sacred sound traditions.',
  },
  sarahChen: {
    id: 'sarah-chen',
    name: 'Sarah Chen',
    role: 'Confessional Music Curator, Beautiful Damage',
    listeningPhilosophy: 'I listen for the crack in the voice—the moment where the performance gives way to something real. The records I love are the ones that risk too much.',
    curatorStatement: 'Beautiful Damage is for people who believe vulnerability is a form of courage. We don\'t look for music that makes us feel better—we look for music that makes us feel. These are records made from fractures, art that doesn\'t pretend the wound is healed. Every week we sit with something difficult and find that sitting together makes it bearable.',
    favoriteRecords: [safeAlbum(ALBUMS.punisher), safeAlbum(ALBUMS.blue), safeAlbum(ALBUMS.funeral)],
    currentObsessions: ['Grief without resolution', 'Humor as armor', 'The confessional tradition'],
    recurringThemes: ['Pain as material', 'Collective catharsis', 'Beauty in damage'],
    credentials: 'Music therapist and writer. Has written about emotional authenticity in songwriting for Pitchfork and NPR.',
  },
  ninaPatel: {
    id: 'nina-patel',
    name: 'Nina Patel',
    role: 'Weather & Mood Curator, Records for Rain',
    listeningPhilosophy: 'The best music matches the weather inside you. I listen for records that create shelter, that turn solitude into refuge.',
    curatorStatement: 'Records for Rain started as a personal practice—matching my listening to grey afternoons. I realized others needed this too: music that doesn\'t fight your mood but accompanies it. We celebrate melancholy here, not as sadness but as a particular quality of attention.',
    favoriteRecords: [safeAlbum(ALBUMS.blue), safeAlbum(ALBUMS.pinkMoon)],
    currentObsessions: ['The color grey in music', 'Piano as rainfall', 'Soft melancholy'],
    recurringThemes: ['Weather as emotional state', 'Music as shelter', 'Solitude as comfort'],
    credentials: 'Playlist curator and essayist. Writes a seasonal newsletter on music and mood.',
  },
}

// ============================================
// THE NOCTURNAL ROOM — Fully Realized
// ============================================
const NOCTURNAL_ROOM: Room = {
  id: 'nocturnal-room',
  slug: 'nocturnal-room',
  name: 'The Nocturnal Room',
  type: 'editorial',
  
  description: 'For listeners who find clarity after midnight. Music that breathes in darkness, that opens up when the world quiets down. We gather here in the late hours, in the space between days.',
  tagline: 'Where the night listens back',
  atmosphere: 'Late night, introspective, liminal',
  emotionalTemperature: 'cool',
  
  currentAlbum: safeAlbum(ALBUMS.forEmma),
  weeklyPhase: 'private',
  phaseDay: 'Wednesday',
  
  curator: CURATORS.eleanorVance,
  
  curatorNote: {
    title: 'On Winter Cabins and the Architecture of Solitude',
    excerpt: 'What makes For Emma, Forever Ago remarkable is not the mythology of its creation—though the Wisconsin cabin has become indie rock\'s most famous origin story—but rather how completely it captures the texture of isolation.',
    fullText: 'What makes For Emma, Forever Ago remarkable is not the mythology of its creation—though the Wisconsin cabin has become indie rock\'s most famous origin story—but rather how completely it captures the texture of isolation. This is not an album about being alone. It is an album that sounds alone.\n\nThe falsetto isn\'t a stylistic choice—it\'s a necessity. Vernon\'s voice has retreated so far inward that it can only emerge in its highest register, the register of private thought, of talking to oneself in an empty room. The production isn\'t lo-fi for aesthetic reasons; it\'s lo-fi because this music was never meant to be heard by anyone else.\n\nWe spend a week here. And what will emerge from our listening is a collective recognition: solitude is not the opposite of connection. Sometimes, the most profound connection happens when we bring our solitude to the same room.',
  },
  
  prompts: [
    { question: 'What emotion arrives before the lyrics do?', hint: 'Notice the instrumental introduction. What does it prepare you to feel?' },
    { question: 'Where does the room seem to open?', hint: 'Find the moment where the sonic space expands.' },
    { question: 'What texture keeps returning?', hint: 'A guitar tone, a reverb, a particular way the voice is recorded.' },
  ],
  
  streamingLinks: {
    spotify: 'https://open.spotify.com/album/4SxFsOO0h4Nz3lFJQFqUoI',
    appleMusic: 'https://music.apple.com/album/for-emma-forever-ago/1440830798',
    tidal: 'https://tidal.com/browse/album/1440830798',
  },
  
  memberCountLabel: '847 listeners',
  atmosphereNotes: [
    'Most active after 11pm',
    'Annotations tend toward reflection',
    'Quietest room in LongPlay',
  ],
  
  albumSample: [safeAlbum(ALBUMS.forEmma), safeAlbum(ALBUMS.pinkMoon), safeAlbum(ALBUMS.carrieAndLowell)],
  
  pastCycles: [
    {
      id: 'nocturnal-pink-moon',
      album: safeAlbum(ALBUMS.pinkMoon),
      dateRange: 'Feb 3-9, 2026',
      annotationCount: 127,
      highlights: ['28 minutes of infinite space', 'The gravity of the opening chord'],
    },
    {
      id: 'nocturnal-carrie-lowell',
      album: safeAlbum(ALBUMS.carrieAndLowell),
      dateRange: 'Apr 28 - May 4, 2026',
      annotationCount: 156,
      highlights: ['Grief that doesn\'t resolve', 'The pause before "I made a lot of mistakes"'],
    },
  ],
  
  emotionalTags: ['Solitude', 'Restraint', 'Fragility', 'Introspection'],
  sonicTags: ['Sparse', 'Atmospheric', 'Acoustic', 'Intimate'],
  
  culture: {
    manifesto: `The Nocturnal Room exists for listeners who have learned that some music only makes sense after midnight. Not because it's "late-night music" as a genre—we're not talking about jazz standards or lo-fi beats to study to. We're talking about records that require a particular quality of attention that only arrives when the world stops expecting anything from you.

Here, we practice a form of listening that is almost devotional. We put on a record and we stay with it. We don't skip tracks. We don't check our phones. We let the music unfold at its own pace, in its own time, and we discover what happens when we stop asking music to do anything other than be present with us.

This room is quiet by design. We don't have active discussion threads during the annotation phase. We believe that some experiences are best processed privately first, and that sharing becomes more meaningful when it emerges from genuine reflection rather than real-time reaction.`,
    
    listeningRitual: 'We listen after dark, with headphones, in solitude. The room is active from 10pm to 3am in your local timezone. Annotations are private until Friday.',
    
    whatWeLookFor: [
      'Records that trust silence',
      'Music that assumes your attention',
      'Albums that reward patience',
      'Art made in solitude',
    ],
    
    whatWeAvoid: [
      'Music that competes for attention',
      'Albums that front-load their impact',
    ],
    
    invitationText: 'For listeners drawn to atmosphere, restraint, and records that reveal themselves slowly after midnight.',
    entryPhrase: 'Enter the Nocturnal Room',
    
    associatedArchetypes: [
      { name: 'The Midnight Archivist', description: 'Listeners who treat their collection as a lifelong companion' },
      { name: 'The Velvet Dissenter', description: 'Those who find comfort in the shadows of sound' },
      { name: 'The Nocturnal Romantic', description: 'Listeners who believe the night reveals what day conceals' },
    ],
    
    relatedRooms: ['cathedral-hour', 'records-for-rain'],
    
    seasonalMoods: {
      winter: { 
        description: 'The Nocturnal Room reaches its truest form in winter—longer nights, deeper quiet, records that match the darkness.',
        moodShift: 'Darker, more ambient-focused. Emphasis on records made in isolation.' 
      },
      spring: { 
        description: 'As nights shorten, we hold onto the darkness a little longer. Transitional records, music about emergence.',
        moodShift: 'Slightly warmer, more space in the sound. Dawn-adjacent selections.' 
      },
      summer: { 
        description: 'Summer nights are brief but potent. We compress our listening, finding nocturnal pockets in the endless day.',
        moodShift: 'More intimate, more urgent. Records that feel stolen from sleep.' 
      },
      autumn: { 
        description: 'The nights return, and so does the room\'s full character. Harvest-time for nocturnal listening.',
        moodShift: 'The room breathes again. Melancholy returns as a friend.' 
      },
    },
  },
  
  aesthetics: {
    themeClass: 'nocturnal-room',
    primaryAccent: 'text-blue-200/70',
    backgroundGradient: 'from-slate-950 via-slate-900/90 to-background',
    borderTint: 'border-blue-900/30',
    typographyStyle: 'intimate',
    transitionSpeed: 'slow',
    grainOpacity: 0.035,
    glowEffect: 'bg-gradient-radial from-blue-900/10 via-transparent to-transparent',
    spacingRhythm: 'breathable',
  },
}

// ============================================
// ANALOG FUTURES — Fully Realized
// ============================================
const ANALOG_FUTURES: Room = {
  id: 'analog-futures',
  slug: 'analog-futures',
  name: 'Analog Futures',
  type: 'editorial',
  
  description: 'Where warmth meets the machine. Electronic music with human fingerprints—the crackle of vintage synthesizers, the breath between programmed beats, the imperfection that makes perfection interesting.',
  tagline: 'The warmth of machines',
  atmosphere: 'Textural, warm synthesis, forward-looking',
  emotionalTemperature: 'warm',
  
  currentAlbum: safeAlbum(ALBUMS.vespertine),
  weeklyPhase: 'discussion',
  phaseDay: 'Friday',
  
  curator: CURATORS.jamesOkonkwo,
  
  curatorNote: {
    title: 'The Domestic Sublime',
    excerpt: 'Vespertine is an album about the interior—both literally (it was largely recorded in Björk\'s home) and emotionally. It\'s music that turns inward, that finds transcendence not in grand gestures but in intimate details.',
    fullText: 'Vespertine is an album about the interior—both literally (it was largely recorded in Björk\'s home) and emotionally. It\'s music that turns inward, that finds transcendence not in grand gestures but in intimate details: the crunch of snow, the click of knitting needles, the breath between words.\n\nMatmos\'s contributions—those micro-sampled domestic sounds—aren\'t decoration. They\'re structural. Björk built a sonic architecture from the sounds of private life, and in doing so, she made private life feel infinite.\n\nThis week, we listen to what happens when electronic music stops looking outward and starts looking in. We discover that sometimes the most revolutionary sound is the one that happens in your own living room.',
  },
  
  prompts: [
    { question: 'What domestic sounds do you hear hiding in the production?', hint: 'Matmos sampled everyday objects. Try to identify them.' },
    { question: 'How does intimacy scale?', hint: 'The album feels both tiny and vast. Where does this tension live?' },
    { question: 'Where does the machine become human?', hint: 'Find the moment where programmed sounds feel organic.' },
  ],
  
  streamingLinks: {
    spotify: 'https://open.spotify.com/album/14QWzMxz8OqeAg6h5Eb7mo',
    appleMusic: 'https://music.apple.com/album/vespertine/1440831496',
  },
  
  memberCountLabel: '623 listeners',
  atmosphereNotes: [
    'Texture-focused discussions',
    'Producers and sonic explorers',
    'Late afternoon listening',
  ],
  
  albumSample: [safeAlbum(ALBUMS.vespertine), safeAlbum(ALBUMS.ageOf), safeAlbum(ALBUMS.homogenic)],
  
  pastCycles: [
    {
      id: 'analog-homogenic',
      album: safeAlbum(ALBUMS.homogenic),
      dateRange: 'Mar 17-23, 2026',
      annotationCount: 145,
      highlights: ['Strings as weapons', 'The volcanic opening'],
    },
  ],
  
  emotionalTags: ['Warmth', 'Intimacy', 'Wonder', 'Texture'],
  sonicTags: ['Electronic', 'Organic', 'Layered', 'Detailed'],
  
  culture: {
    manifesto: `Analog Futures exists because the most interesting electronic music refuses easy categories. We're not interested in retromania or accelerationism. We're interested in the tension—the warmth of vintage circuits, the breath between programmed notes, the human fingerprints on machine-made sound.

This room celebrates electronic music that remembers it was made by hands. We listen for the seams: where the producer's choices become audible, where the technology reveals its maker, where the machine and the human negotiate their relationship.

We believe electronic music is at its best when it doesn't try to sound inhuman. The records we love are the ones where you can hear someone thinking, feeling, breathing through the technology. We listen for the warmth hiding in the waveforms.`,
    
    listeningRitual: 'We listen with attention to production. Headphones recommended. The room discusses texture, technique, and emotional architecture.',
    
    whatWeLookFor: [
      'Records where you can hear the maker',
      'Electronic music with organic elements',
      'Warmth in digital production',
      'Technology serving emotion',
    ],
    
    whatWeAvoid: [
      'Purely nostalgic synthwave',
      'Electronic music that hides its humanity',
    ],
    
    invitationText: 'For listeners who believe machines can breathe, and that the future sounds warm.',
    entryPhrase: 'Enter Analog Futures',
    
    associatedArchetypes: [
      { name: 'The Texture Devotee', description: 'Listeners who hear in layers and love the grain' },
      { name: 'The Synthetic Romantic', description: 'Those who find warmth in circuits' },
    ],
    
    relatedRooms: ['warm-static', 'cathedral-hour'],
    
    seasonalMoods: {
      winter: { 
        description: 'The room turns inward—home listening, domestic electronica, intimate textures.',
        moodShift: 'Cozier, more interior-focused. Vespertine weather.' 
      },
      spring: { 
        description: 'Synthesis meets renewal. Warmer tones, more expansive arrangements.',
        moodShift: 'Brighter, more hopeful electronics. Organic growth metaphors.' 
      },
      summer: { 
        description: 'The machines go outside. Field recordings, environmental electronics.',
        moodShift: 'More spacious, sun-dappled production.' 
      },
      autumn: { 
        description: 'The warmth of machines against the cooling world. Amber tones return.',
        moodShift: 'Nostalgic warmth, analog textures deepen.' 
      },
    },
  },
  
  aesthetics: {
    themeClass: 'analog-futures',
    primaryAccent: 'text-amber-300/80',
    backgroundGradient: 'from-amber-950/30 via-orange-950/20 to-background',
    borderTint: 'border-amber-800/20',
    typographyStyle: 'structured',
    transitionSpeed: 'medium',
    grainOpacity: 0.03,
    glowEffect: 'bg-gradient-radial from-amber-900/15 via-transparent to-transparent',
    spacingRhythm: 'tight',
  },
}

// ============================================
// CATHEDRAL HOUR — Fully Realized
// ============================================
const CATHEDRAL_HOUR: Room = {
  id: 'cathedral-hour',
  slug: 'cathedral-hour',
  name: 'Cathedral Hour',
  type: 'editorial',
  
  description: 'Devotional listening. Ambient, sacred, transcendent sound architecture. Music that builds cathedrals in the air and asks you to wander through them. Here, we practice patience as a form of attention.',
  tagline: 'Sound as architecture',
  atmosphere: 'Expansive, spiritual, reverent',
  emotionalTemperature: 'cool',
  
  currentAlbum: safeAlbum(ALBUMS.spiritOfEden),
  weeklyPhase: 'arrival',
  phaseDay: 'Monday',
  
  curator: CURATORS.marcusWebb,
  
  curatorNote: {
    title: 'The Birth of Patience',
    excerpt: 'Spirit of Eden is not an album you listen to. It\'s an album you inhabit. Mark Hollis and Tim Friese-Greene constructed a cathedral of sound—vast, echoing, sacred—and then stepped back to let you wander through it.',
    fullText: 'Spirit of Eden is not an album you listen to. It\'s an album you inhabit. Mark Hollis and Tim Friese-Greene constructed a cathedral of sound—vast, echoing, sacred—and then stepped back to let you wander through it.\n\nThe silence here is not absence. It\'s architecture. The moments of quiet are load-bearing walls. Remove them and the whole structure collapses.\n\nThis week we learn what patience sounds like when it becomes form. We learn that some albums don\'t reward attention—they require it. And we learn that the space between notes can contain more meaning than the notes themselves.',
  },
  
  prompts: [
    { question: 'When does the silence become part of the song?', hint: 'Find the moment where absence becomes presence.' },
    { question: 'What architecture do you hear?', hint: 'This album was constructed like a building. What kind?' },
    { question: 'Where does trust enter the listening?', hint: 'At what moment do you stop waiting for something to happen?' },
  ],
  
  streamingLinks: {
    spotify: 'https://open.spotify.com/album/4lCthLsKwYv5UuC0PHCJ2r',
    appleMusic: 'https://music.apple.com/album/spirit-of-eden/724466069',
  },
  
  memberCountLabel: '512 listeners',
  atmosphereNotes: [
    'Longest average listening sessions',
    'Ambient and sacred focus',
    'Early morning activity',
  ],
  
  albumSample: [safeAlbum(ALBUMS.musicForAirports), safeAlbum(ALBUMS.disintegrationLoops), safeAlbum(ALBUMS.spiritOfEden)],
  
  pastCycles: [
    {
      id: 'cathedral-airports',
      album: safeAlbum(ALBUMS.musicForAirports),
      dateRange: 'Jan 20-26, 2026',
      annotationCount: 89,
      highlights: ['The invention of ambient', 'Music as furniture or weather'],
    },
    {
      id: 'cathedral-disintegration',
      album: safeAlbum(ALBUMS.disintegrationLoops),
      dateRange: 'Feb 17-23, 2026',
      annotationCount: 112,
      highlights: ['Watching memory decay', 'September light'],
    },
  ],
  
  emotionalTags: ['Transcendence', 'Patience', 'Reverence', 'Stillness'],
  sonicTags: ['Ambient', 'Orchestral', 'Atmospheric', 'Sparse'],
  
  culture: {
    manifesto: `Cathedral Hour is a practice disguised as a room. We gather here not to discuss music but to practice a discipline of attention that has become rare: the willingness to let something unfold at its own pace, in its own time, without asking it to compete for our attention.

The records we listen to here are not background music. They require foreground attention. They build slowly, they reward patience, they create space rather than fill it. These are albums that function like architecture—you enter them, you inhabit them, you let them change the shape of your interior space.

We call it Cathedral Hour because the best ambient and sacred music creates what cathedrals create: a sense of scale that makes the self feel both small and infinite. We practice patience here. We practice attention. We discover that some music is less an object to consume and more a space to occupy.`,
    
    listeningRitual: 'We listen in full, without interruption. Many members listen in the early morning. Silence is part of the practice.',
    
    whatWeLookFor: [
      'Music that creates space',
      'Records that reward patience',
      'Sound as architecture',
      'Silence as structure',
    ],
    
    whatWeAvoid: [
      'Music that competes for attention',
      'Albums designed for impatience',
    ],
    
    invitationText: 'For listeners who understand that some music asks you to enter it like a building.',
    entryPhrase: 'Enter the Cathedral',
    
    associatedArchetypes: [
      { name: 'The Cathedral Listener', description: 'Those who practice attention as devotion' },
      { name: 'The Sonic Pilgrim', description: 'Listeners who journey through sound landscapes' },
      { name: 'The Ambient Devotee', description: 'Those who hear infinity in sustained tones' },
    ],
    
    relatedRooms: ['nocturnal-room', 'spiritual-jazz'],
    
    seasonalMoods: {
      winter: { 
        description: 'The cathedral is coldest in winter—stone floors, breath visible, resonance deepened by the chill.',
        moodShift: 'Sparser, more austere. Drone-heavy.' 
      },
      spring: { 
        description: 'Light returns to the cathedral. Stained glass illuminated. Sacred music meets renewal.',
        moodShift: 'Warmer tones enter. Choral elements welcome.' 
      },
      summer: { 
        description: 'The cathedral doors open. Field recordings join the ambient wash.',
        moodShift: 'More environmental, more expansive.' 
      },
      autumn: { 
        description: 'The light grows golden, then fades. Vespers return. The hour deepens.',
        moodShift: 'Reflective, end-of-day energy. Evening ambience.' 
      },
    },
  },
  
  aesthetics: {
    themeClass: 'cathedral-hour',
    primaryAccent: 'text-emerald-300/60',
    backgroundGradient: 'from-emerald-950/20 via-teal-950/10 to-background',
    borderTint: 'border-emerald-900/20',
    typographyStyle: 'expansive',
    transitionSpeed: 'slow',
    grainOpacity: 0.025,
    glowEffect: 'bg-gradient-radial from-emerald-900/10 via-transparent to-transparent',
    spacingRhythm: 'expansive',
  },
}

// ============================================
// BEAUTIFUL DAMAGE — Fully Realized
// ============================================
const BEAUTIFUL_DAMAGE: Room = {
  id: 'beautiful-damage',
  slug: 'beautiful-damage',
  name: 'Beautiful Damage',
  type: 'editorial',
  
  description: 'Art made from fractures. Records that transmute pain into resonance—music that doesn\'t avoid the wound but sits in it, transforms it, makes something beautiful from the damage.',
  tagline: 'Where pain becomes resonance',
  atmosphere: 'Raw, cathartic, emotionally direct',
  emotionalTemperature: 'warm',
  
  currentAlbum: safeAlbum(ALBUMS.punisher),
  weeklyPhase: 'curators-note',
  phaseDay: 'Saturday',
  
  curator: CURATORS.sarahChen,
  
  curatorNote: {
    title: 'The Gospel of Phoebe Bridgers',
    excerpt: 'Punisher is an album about haunting and being haunted—by Elliott Smith, by death, by the terror of loving people who might leave. Bridgers writes about grief the way some people write about weather: it\'s always there, shaping everything.',
    fullText: 'Punisher is an album about haunting and being haunted—by Elliott Smith, by death, by the terror of loving people who might leave. Bridgers writes about grief the way some people write about weather: it\'s always there, shaping everything.\n\nThe production (with Tony Berg and Ethan Gruska) is deceptively lush. Listen closer and you\'ll hear the tremor underneath—the barely-held-together quality of someone singing through tears they refuse to let fall.\n\nThis week we sit with music that doesn\'t pretend everything is okay. We learn that sometimes the bravest thing an artist can do is admit they\'re scared. And we discover that beautiful damage isn\'t a contradiction—it\'s a truth.',
  },
  
  prompts: [
    { question: 'Where does the production hide the pain?', hint: 'The arrangements are lush. What are they covering?' },
    { question: 'Who is she singing to?', hint: 'Many songs are addressed to specific people. Identify them.' },
    { question: 'Where does dark humor become coping mechanism?', hint: 'Find the jokes that aren\'t really jokes.' },
  ],
  
  streamingLinks: {
    spotify: 'https://open.spotify.com/album/2xECuqnvvmVktV7UO8Dd3s',
    appleMusic: 'https://music.apple.com/album/punisher/1508306286',
  },
  
  memberCountLabel: '734 listeners',
  atmosphereNotes: [
    'Most emotional annotations',
    'Late night crying sessions (their words)',
    'Strong sense of community',
  ],
  
  albumSample: [safeAlbum(ALBUMS.punisher), safeAlbum(ALBUMS.funeral), safeAlbum(ALBUMS.blue)],
  
  pastCycles: [
    {
      id: 'damage-blue',
      album: safeAlbum(ALBUMS.blue),
      dateRange: 'Mar 31 - Apr 6, 2026',
      annotationCount: 203,
      highlights: ['The most vulnerable album ever made', 'River as inheritance'],
    },
    {
      id: 'damage-funeral',
      album: safeAlbum(ALBUMS.funeral),
      dateRange: 'Jan 13-19, 2026',
      annotationCount: 167,
      highlights: ['Collective grief becomes celebration', 'Neighborhood as metaphor'],
    },
  ],
  
  emotionalTags: ['Catharsis', 'Vulnerability', 'Grief', 'Healing'],
  sonicTags: ['Confessional', 'Lush', 'Indie', 'Atmospheric'],
  
  culture: {
    manifesto: `Beautiful Damage is a room for people who believe that the most important art is often the art that risks too much. We don't look for music that makes us feel better—we look for music that makes us feel. Period.

The records we listen to here are made from fractures. They don't pretend the wound is healed. They sit in the damage and find, somehow, that sitting there long enough transforms the pain into something that can be shared, that can be witnessed, that can become—impossibly—beautiful.

This room has the strongest community in LongPlay because vulnerability creates connection. When we share what hurt us about a record, we're also sharing what healed us. When we annotate the moment where the voice cracks, we're saying: I heard that too. I felt that too. You're not alone in your damage.`,
    
    listeningRitual: 'We listen vulnerably. We don\'t judge emotion. We share what moves us without performing. Tissues are expected.',
    
    whatWeLookFor: [
      'Records that risk too much',
      'Music made from fractures',
      'Vulnerability as courage',
      'Pain transformed, not hidden',
    ],
    
    whatWeAvoid: [
      'Performative sadness',
      'Music that exploits emotion without earning it',
    ],
    
    invitationText: 'For listeners who believe vulnerability is courage, and that some damage becomes beautiful when witnessed.',
    entryPhrase: 'Enter Beautiful Damage',
    
    associatedArchetypes: [
      { name: 'The Confessional Heart', description: 'Listeners who process life through vulnerable art' },
      { name: 'The Grief Companion', description: 'Those who sit with sadness as a friend' },
    ],
    
    relatedRooms: ['records-for-rain', 'nocturnal-room'],
    
    seasonalMoods: {
      winter: { 
        description: 'Winter is high season for Beautiful Damage. Seasonal affect meets confessional music.',
        moodShift: 'Heavier, more grief-focused. The room goes deeper.' 
      },
      spring: { 
        description: 'Healing becomes possible. Records about emergence, about aftermath.',
        moodShift: 'Still vulnerable, but with hope entering.' 
      },
      summer: { 
        description: 'Even summer has its damage. Heartbreak season, transition records.',
        moodShift: 'More romantic damage. Love as wound.' 
      },
      autumn: { 
        description: 'The leaves fall and so does our guard. Reflective damage, earned melancholy.',
        moodShift: 'Nostalgic pain. Looking back at what hurt.' 
      },
    },
  },
  
  aesthetics: {
    themeClass: 'beautiful-damage',
    primaryAccent: 'text-rose-300/80',
    backgroundGradient: 'from-rose-950/30 via-pink-950/20 to-background',
    borderTint: 'border-rose-900/30',
    typographyStyle: 'intimate',
    transitionSpeed: 'medium',
    grainOpacity: 0.04,
    glowEffect: 'bg-gradient-radial from-rose-900/15 via-transparent to-transparent',
    spacingRhythm: 'breathable',
  },
}

// ============================================
// RECORDS FOR RAIN — Fully Realized
// ============================================
const RECORDS_FOR_RAIN: Room = {
  id: 'records-for-rain',
  slug: 'records-for-rain',
  name: 'Records for Rain',
  type: 'genre',
  
  description: 'Music that matches the weather. For grey afternoons and window-watching. The soft melancholy of precipitation as a listening companion.',
  tagline: 'Music that matches the weather',
  atmosphere: 'Soft, melancholic, reflective',
  emotionalTemperature: 'cool',
  
  currentAlbum: safeAlbum(ALBUMS.blue),
  weeklyPhase: 'private',
  phaseDay: 'Tuesday',
  
  curator: CURATORS.ninaPatel,
  
  curatorNote: {
    title: 'Grey Afternoons',
    excerpt: 'Some albums need rain. Joni Mitchell\'s Blue is one of them—music so exposed that it needs the soft cover of precipitation, the privacy of a grey afternoon.',
    fullText: 'Some albums need rain. Joni Mitchell\'s Blue is one of them—music so exposed that it needs the soft cover of precipitation, the privacy of a grey afternoon.\n\nThis week we match our listening to the weather—real or remembered. We discover that melancholy isn\'t sadness; it\'s a particular quality of attention, a willingness to sit with feelings that don\'t resolve.',
  },
  
  prompts: [
    { question: 'What weather does this song create?', hint: 'Not the weather outside. The weather inside.' },
    { question: 'Where does reflection become refuge?', hint: 'Find the moment the song becomes shelter.' },
  ],
  
  streamingLinks: {
    spotify: 'https://open.spotify.com/album/1vz94WpXDVYIEGja8cjFNa',
  },
  
  memberCountLabel: '678 listeners',
  atmosphereNotes: ['Most active on overcast days', 'Afternoon listeners'],
  
  albumSample: [safeAlbum(ALBUMS.blue), safeAlbum(ALBUMS.pinkMoon)],
  
  pastCycles: [],
  
  emotionalTags: ['Melancholy', 'Reflection', 'Comfort', 'Solitude'],
  sonicTags: ['Acoustic', 'Intimate', 'Soft'],
  
  culture: {
    manifesto: `Records for Rain started as a personal practice—a way of matching my listening to grey afternoons. Some music needs shelter to make sense. Some albums are best heard when the world outside matches the weather inside.

We don't celebrate sadness here. We celebrate melancholy—which is different. Melancholy is a quality of attention, a particular softness that arrives when you stop fighting your mood and start accompanying it. The records we choose are shelters. They don't make the rain stop. They make it beautiful.`,
    
    listeningRitual: 'We listen on grey days, by windows. The room is most alive during storms.',
    
    whatWeLookFor: [
      'Music that matches weather',
      'Soft melancholy',
      'Records that shelter',
      'Grey-afternoon energy',
    ],
    
    whatWeAvoid: [
      'Performative sadness',
      'Music that demands attention',
    ],
    
    invitationText: 'For listeners who know that some music only makes sense when the sky is grey.',
    entryPhrase: 'Enter the Rain',
    
    associatedArchetypes: [
      { name: 'The Weather Listener', description: 'Those who match their music to the sky' },
    ],
    
    relatedRooms: ['beautiful-damage', 'nocturnal-room'],
    
    seasonalMoods: {
      winter: { description: 'Rain becomes snow. The room goes quieter.', moodShift: 'Sparser, colder selections.' },
      spring: { description: 'April showers. The room comes alive.', moodShift: 'Classic rain-record season.' },
      summer: { description: 'Rare rains, treasured listening.', moodShift: 'Thunder-focused, dramatic.' },
      autumn: { description: 'The room\'s natural home.', moodShift: 'Deep melancholy, leaves and rain.' },
    },
  },
  
  aesthetics: {
    themeClass: 'records-rain',
    primaryAccent: 'text-slate-400/80',
    backgroundGradient: 'from-slate-900/40 via-slate-800/20 to-background',
    borderTint: 'border-slate-700/20',
    typographyStyle: 'intimate',
    transitionSpeed: 'slow',
    grainOpacity: 0.04,
    glowEffect: 'bg-gradient-radial from-slate-700/10 via-transparent to-transparent',
    spacingRhythm: 'breathable',
  },
}

// ============================================
// REMAINING GENRE ROOMS (simplified)
// ============================================
const WARM_STATIC: Room = {
  id: 'warm-static',
  slug: 'warm-static',
  name: 'Warm Static',
  type: 'genre',
  description: 'Lo-fi textures and tape hiss. Music that sounds like memory—slightly degraded, warmly imperfect, beloved precisely because it isn\'t pristine.',
  tagline: 'The beauty of degradation',
  atmosphere: 'Nostalgic, textural, warm',
  emotionalTemperature: 'warm',
  currentAlbum: safeAlbum(ALBUMS.inRainbows),
  weeklyPhase: 'discussion',
  phaseDay: 'Thursday',
  curator: {
    id: 'david-park',
    name: 'David Park',
    role: 'Lo-Fi & Texture Curator',
    listeningPhilosophy: 'I listen for what\'s been worn smooth by love.',
    curatorStatement: 'Warm Static is for people who hear beauty in imperfection.',
    favoriteRecords: [safeAlbum(ALBUMS.inRainbows)],
    currentObsessions: ['Tape degradation', 'Analog warmth'],
    recurringThemes: ['Memory', 'Imperfection', 'Nostalgia'],
  },
  curatorNote: {
    title: 'The Sound of Memory',
    excerpt: 'In Rainbows was released on tape before digital. There\'s something fitting about that.',
    fullText: 'In Rainbows was released on tape before digital. There\'s something fitting about that—this is music that sounds like it\'s being remembered even as you hear it for the first time.',
  },
  prompts: [
    { question: 'What gives this album its warmth?', hint: 'Production choices, performance choices, something else?' },
  ],
  streamingLinks: { spotify: 'https://open.spotify.com/album/5vkqYmiPBYLaalcmjujWxK' },
  memberCountLabel: '534 listeners',
  atmosphereNotes: ['Texture obsessives', 'Evening listening'],
  albumSample: [safeAlbum(ALBUMS.inRainbows), safeAlbum(ALBUMS.forEmma)],
  pastCycles: [],
  emotionalTags: ['Nostalgia', 'Warmth', 'Imperfection', 'Memory'],
  sonicTags: ['Lo-Fi', 'Textural', 'Analog', 'Warm'],
  culture: {
    manifesto: 'Warm Static celebrates the imperfect, the worn, the loved-smooth.',
    listeningRitual: 'We listen for texture, for grain, for the sound of hands.',
    whatWeLookFor: ['Lo-fi warmth', 'Tape texture', 'Analog imperfection'],
    whatWeAvoid: ['Clinical production'],
    invitationText: 'For listeners who hear beauty in the hiss.',
    entryPhrase: 'Enter the Static',
    associatedArchetypes: [{ name: 'The Texture Devotee', description: 'Listeners who love grain' }],
    relatedRooms: ['analog-futures'],
    seasonalMoods: {
      winter: { description: 'Warm static against cold.', moodShift: 'Cozier textures.' },
      spring: { description: 'Sun-warmed tape.', moodShift: 'Brighter warmth.' },
      summer: { description: 'Heat-warped vinyl.', moodShift: 'Lazy textures.' },
      autumn: { description: 'Golden-hour grain.', moodShift: 'Nostalgic warmth.' },
    },
  },
  aesthetics: {
    themeClass: 'warm-static',
    primaryAccent: 'text-amber-400/70',
    backgroundGradient: 'from-amber-950/20 via-yellow-950/10 to-background',
    borderTint: 'border-amber-900/20',
    typographyStyle: 'organic',
    transitionSpeed: 'medium',
    grainOpacity: 0.045,
    spacingRhythm: 'breathable',
  },
}

const SPIRITUAL_JAZZ: Room = {
  id: 'spiritual-jazz',
  slug: 'spiritual-jazz',
  name: 'Spiritual Jazz',
  type: 'genre',
  description: 'From Pharoah Sanders to Kamasi Washington. Jazz as devotional practice—music that reaches for transcendence through improvisation, repetition, and collective breath.',
  tagline: 'Jazz as devotion',
  atmosphere: 'Transcendent, communal, searching',
  emotionalTemperature: 'warm',
  currentAlbum: safeAlbum(ALBUMS.kindOfBlue),
  weeklyPhase: 'arrival',
  phaseDay: 'Monday',
  curator: {
    id: 'terrence-williams',
    name: 'Terrence Williams',
    role: 'Jazz Curator',
    listeningPhilosophy: 'Jazz is prayer in motion.',
    curatorStatement: 'Spiritual Jazz is for those who hear the sacred in improvisation.',
    favoriteRecords: [safeAlbum(ALBUMS.kindOfBlue)],
    currentObsessions: ['Modal exploration', 'Collective breath'],
    recurringThemes: ['Transcendence', 'Community', 'Spirit'],
  },
  curatorNote: {
    title: 'The Sound of Blue',
    excerpt: 'Kind of Blue isn\'t cool jazz. It\'s modal jazz—a different grammar entirely.',
    fullText: 'Kind of Blue isn\'t cool jazz. It\'s modal jazz—a different grammar entirely. Miles found a way to make space the star.',
  },
  prompts: [
    { question: 'Where does space become the star?', hint: 'Find the silence between notes.' },
  ],
  streamingLinks: { spotify: 'https://open.spotify.com/album/1weenld61qoidwYuZ1GESA' },
  memberCountLabel: '456 listeners',
  atmosphereNotes: ['Morning listeners', 'Meditation energy'],
  albumSample: [safeAlbum(ALBUMS.kindOfBlue)],
  pastCycles: [],
  emotionalTags: ['Transcendence', 'Devotion', 'Space', 'Spirit'],
  sonicTags: ['Jazz', 'Modal', 'Ambient', 'Acoustic'],
  culture: {
    manifesto: 'Spiritual Jazz treats improvisation as prayer.',
    listeningRitual: 'We listen for the breath between notes.',
    whatWeLookFor: ['Jazz as devotion', 'Transcendent improvisation'],
    whatWeAvoid: ['Technical showing off'],
    invitationText: 'For listeners who hear the sacred in jazz.',
    entryPhrase: 'Enter the Spirit',
    associatedArchetypes: [{ name: 'The Sonic Pilgrim', description: 'Seekers through sound' }],
    relatedRooms: ['cathedral-hour'],
    seasonalMoods: {
      winter: { description: 'Quiet devotion.', moodShift: 'Sparser, more contemplative.' },
      spring: { description: 'Spirit rises.', moodShift: 'More expansive.' },
      summer: { description: 'Sun-drenched modality.', moodShift: 'Brighter tones.' },
      autumn: { description: 'Harvest reflection.', moodShift: 'Golden, grateful.' },
    },
  },
  aesthetics: {
    themeClass: 'spiritual-jazz',
    primaryAccent: 'text-yellow-400/70',
    backgroundGradient: 'from-yellow-950/20 via-orange-950/10 to-background',
    borderTint: 'border-yellow-900/20',
    typographyStyle: 'expansive',
    transitionSpeed: 'slow',
    grainOpacity: 0.03,
    spacingRhythm: 'expansive',
  },
}

// ============================================
// CREATOR ROOMS (simplified)
// ============================================
const CRITERION_LISTENING: Room = {
  id: 'criterion-listening',
  slug: 'criterion-listening',
  name: 'Criterion Listening',
  type: 'creator',
  description: 'Scores and soundtracks from cinema\'s finest. Curated by The Criterion Collection.',
  tagline: 'Cinema for your ears',
  atmosphere: 'Cinematic, archival, prestigious',
  emotionalTemperature: 'neutral',
  currentAlbum: safeAlbum(ALBUMS.disintegrationLoops),
  weeklyPhase: 'discussion',
  phaseDay: 'Friday',
  curator: {
    id: 'criterion-collection',
    name: 'The Criterion Collection',
    role: 'Label Partner',
    listeningPhilosophy: 'The best films deserve the best listening.',
    curatorStatement: 'We bring the same care to soundtracks that we bring to films.',
    favoriteRecords: [],
    currentObsessions: ['Film scores', 'Sonic cinema'],
    recurringThemes: ['Cinema', 'Score', 'Atmosphere'],
  },
  curatorNote: {
    title: 'Sound and Vision',
    excerpt: 'Music that sees.',
    fullText: 'Music that sees. Scores that create worlds.',
  },
  prompts: [
    { question: 'What film does this music create?', hint: 'Close your eyes and see.' },
  ],
  streamingLinks: {},
  memberCountLabel: '1,243 listeners',
  atmosphereNotes: ['Film lovers', 'Soundtrack obsessives'],
  albumSample: [safeAlbum(ALBUMS.disintegrationLoops)],
  pastCycles: [],
  emotionalTags: ['Cinematic', 'Visual', 'Atmospheric'],
  sonicTags: ['Score', 'Orchestral', 'Ambient'],
  culture: {
    manifesto: 'Cinema listening, with Criterion care.',
    listeningRitual: 'We listen with eyes closed.',
    whatWeLookFor: ['Cinematic scores', 'Visual music'],
    whatWeAvoid: ['Generic soundtracks'],
    invitationText: 'For listeners who see with their ears.',
    entryPhrase: 'Enter Criterion Listening',
    associatedArchetypes: [{ name: 'The Cinematic Ear', description: 'Listeners who see through sound' }],
    relatedRooms: ['cathedral-hour'],
    seasonalMoods: {
      winter: { description: 'Award season.', moodShift: 'Prestige selections.' },
      spring: { description: 'Festival season.', moodShift: 'Discovery energy.' },
      summer: { description: 'Blockbuster scores.', moodShift: 'More expansive.' },
      autumn: { description: 'Art house return.', moodShift: 'Quieter, deeper.' },
    },
  },
  aesthetics: {
    themeClass: 'criterion-listening',
    primaryAccent: 'text-neutral-300/80',
    backgroundGradient: 'from-neutral-900/30 via-neutral-800/20 to-background',
    borderTint: 'border-neutral-700/30',
    typographyStyle: 'structured',
    transitionSpeed: 'deliberate',
    grainOpacity: 0.03,
    spacingRhythm: 'breathable',
  },
}

const PITCHFORK_DEEP_CUTS: Room = {
  id: 'pitchfork-deep-cuts',
  slug: 'pitchfork-deep-cuts',
  name: 'Deep Cuts',
  type: 'creator',
  description: 'Beyond the 10.0s. Curated by Pitchfork.',
  tagline: 'Beyond the 10.0s',
  atmosphere: 'Critical, exploratory, discovery',
  emotionalTemperature: 'neutral',
  currentAlbum: safeAlbum(ALBUMS.illinois),
  weeklyPhase: 'private',
  phaseDay: 'Wednesday',
  curator: {
    id: 'pitchfork',
    name: 'Pitchfork',
    role: 'Publication Partner',
    listeningPhilosophy: 'The albums that didn\'t get the score they deserved.',
    curatorStatement: 'Revisiting, reconsidering, rediscovering.',
    favoriteRecords: [],
    currentObsessions: ['Underrated gems', 'Score reconsiderations'],
    recurringThemes: ['Discovery', 'Criticism', 'Context'],
  },
  curatorNote: {
    title: 'Beyond Best New Music',
    excerpt: 'The albums that mattered even if we didn\'t always know it.',
    fullText: 'The albums that mattered even if we didn\'t always know it.',
  },
  prompts: [
    { question: 'What did critics miss?', hint: 'Find what the reviews couldn\'t hear.' },
  ],
  streamingLinks: {},
  memberCountLabel: '2,341 listeners',
  atmosphereNotes: ['Critics welcome', 'Discovery-focused'],
  albumSample: [safeAlbum(ALBUMS.illinois)],
  pastCycles: [],
  emotionalTags: ['Critical', 'Discovery', 'Reconsideration'],
  sonicTags: ['Varied', 'Eclectic'],
  culture: {
    manifesto: 'Beyond the headline scores.',
    listeningRitual: 'We listen critically but openly.',
    whatWeLookFor: ['Underrated albums', 'Overlooked gems'],
    whatWeAvoid: ['Obvious choices'],
    invitationText: 'For listeners who want to go deeper.',
    entryPhrase: 'Go Deeper',
    associatedArchetypes: [{ name: 'The Critical Ear', description: 'Listeners who hear context' }],
    relatedRooms: [],
    seasonalMoods: {
      winter: { description: 'Year-end reassessment.', moodShift: 'List energy.' },
      spring: { description: 'Spring discoveries.', moodShift: 'Fresh ears.' },
      summer: { description: 'Summer reading list.', moodShift: 'Deep dives.' },
      autumn: { description: 'Fall reappraisal.', moodShift: 'Looking back.' },
    },
  },
  aesthetics: {
    themeClass: 'pitchfork-deep',
    primaryAccent: 'text-red-400/70',
    backgroundGradient: 'from-red-950/20 via-rose-950/10 to-background',
    borderTint: 'border-red-900/20',
    typographyStyle: 'structured',
    transitionSpeed: 'medium',
    grainOpacity: 0.025,
    spacingRhythm: 'tight',
  },
}

// ============================================
// EXPORTS
// ============================================
export const EDITORIAL_ROOMS: Room[] = [
  NOCTURNAL_ROOM,
  ANALOG_FUTURES,
  CATHEDRAL_HOUR,
  BEAUTIFUL_DAMAGE,
]

export const GENRE_ROOMS: Room[] = [
  RECORDS_FOR_RAIN,
  WARM_STATIC,
  SPIRITUAL_JAZZ,
]

export const CREATOR_ROOMS: Room[] = [
  CRITERION_LISTENING,
  PITCHFORK_DEEP_CUTS,
]

export const ALL_ROOMS: Room[] = [
  ...EDITORIAL_ROOMS,
  ...GENRE_ROOMS,
  ...CREATOR_ROOMS,
]

// Helper functions
export function getRoomBySlug(slug: string): Room | undefined {
  return ALL_ROOMS.find(room => room.slug === slug)
}

export function getRoomsByType(type: RoomType): Room[] {
  return ALL_ROOMS.filter(room => room.type === type)
}

export function getRelatedRooms(room: Room): Room[] {
  return room.culture.relatedRooms
    .map(slug => getRoomBySlug(slug))
    .filter((r): r is Room => r !== undefined)
}

export function getRoomSeasonalMood(room: Room): { description: string; moodShift: string } {
  const month = new Date().getMonth()
  let season: Season
  if (month >= 2 && month <= 4) season = 'spring'
  else if (month >= 5 && month <= 7) season = 'summer'
  else if (month >= 8 && month <= 10) season = 'autumn'
  else season = 'winter'
  
  return room.culture.seasonalMoods[season]
}
