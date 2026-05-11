'use client'

import { ALBUMS, type Album } from './albums'

/**
 * LongPlay Archive System
 * 
 * The emotional retention engine of the platform.
 * This is not analytics - it's a lifelong personal museum.
 */

// ============================================
// LISTENING PERIODS - Identifiable eras
// ============================================
export interface ListeningPeriod {
  id: string
  name: string
  timeRange: string
  description: string
  dominantEmotion: string
  albums: Album[]
  annotations: number
  archetype: string
}

export const LISTENING_PERIODS: ListeningPeriod[] = [
  {
    id: 'winter-isolation',
    name: 'The Winter Isolation',
    timeRange: 'December 2025 — February 2026',
    description: 'You retreated inward. Every album you chose had space in it—room to breathe, room to grieve, room to simply be alone without loneliness. The snow outside made the silence inside feel earned.',
    dominantEmotion: 'Solitude',
    albums: [ALBUMS.forEmma, ALBUMS.pinkMoon, ALBUMS.carrieAndLowell],
    annotations: 47,
    archetype: 'The Nostalgic Wanderer',
  },
  {
    id: 'spring-unraveling',
    name: 'The Spring Unraveling',
    timeRange: 'March — May 2026',
    description: 'Something shifted. You stopped reaching for comfort and started reaching for challenge. Albums that made demands. Music that refused to meet you halfway.',
    dominantEmotion: 'Restlessness',
    albums: [ALBUMS.spiritOfEden, ALBUMS.ys, ALBUMS.kidA],
    annotations: 34,
    archetype: 'The Deliberate Listener',
  },
  {
    id: 'summer-presence',
    name: 'The Summer of Presence',
    timeRange: 'June — August 2026',
    description: 'You stopped skipping tracks. Full albums became ritual. You listened to hear, not to fill silence. Somewhere in those long evenings, consumption became relationship.',
    dominantEmotion: 'Attention',
    albums: [ALBUMS.blue, ALBUMS.inRainbows, ALBUMS.kindOfBlue],
    annotations: 52,
    archetype: 'The Present Listener',
  },
  {
    id: 'autumn-intimacy',
    name: 'The Autumn Intimacy',
    timeRange: 'September 2026 — Present',
    description: 'Everything deepened. You returned to albums that knew you. The listening became conversation—you brought yourself to the music, and it answered back.',
    dominantEmotion: 'Intimacy',
    albums: [ALBUMS.punisher, ALBUMS.songs, ALBUMS.ruins],
    annotations: 41,
    archetype: 'The Nocturnal Romantic',
  },
]

// ============================================
// ARCHETYPE EVOLUTION
// ============================================
export interface ArchetypeShift {
  from: string
  to: string
  when: string
  insight: string
}

export const ARCHETYPE_EVOLUTION: ArchetypeShift[] = [
  {
    from: 'The Passive Consumer',
    to: 'The Nostalgic Wanderer',
    when: 'Winter 2025',
    insight: 'You stopped letting algorithms choose. For the first time in years, you asked yourself what you actually wanted to hear.',
  },
  {
    from: 'The Nostalgic Wanderer',
    to: 'The Deliberate Listener',
    when: 'Spring 2026',
    insight: 'Comfort stopped being enough. You wanted difficulty—albums that required attention, that refused to be background.',
  },
  {
    from: 'The Deliberate Listener',
    to: 'The Nocturnal Romantic',
    when: 'Autumn 2026',
    insight: 'You began listening late. Alone. With intention. The music became a conversation you looked forward to having.',
  },
]

// ============================================
// RECORDS THAT SHAPED YOU
// ============================================
export interface FormativeRecord {
  album: Album
  discoveredWhen: string
  returns: number
  annotations: number
  significance: string
  keyMoment: string
  lifeContext: string
}

export const FORMATIVE_RECORDS: FormativeRecord[] = [
  {
    album: ALBUMS.forEmma,
    discoveredWhen: 'January 2026',
    returns: 34,
    annotations: 12,
    significance: 'This was the album that taught you what intentional listening could be. Before this, music was background. After this, music became presence.',
    keyMoment: '"Come on skinny love, just last the year" — You saved this moment 23 times. Each time felt like hearing it for the first.',
    lifeContext: 'Those three months when you walked home in the dark. This album became the walk itself.',
  },
  {
    album: ALBUMS.spiritOfEden,
    discoveredWhen: 'March 2026',
    returns: 18,
    annotations: 8,
    significance: 'Someone in the club mentioned Talk Talk. By midnight, you understood that an album could be architecture—built, not written.',
    keyMoment: 'The moment when the silence becomes part of the song. You finally understood why patience is a form of trust.',
    lifeContext: 'The week you stopped playing music while working. You realized some albums demand your full attention, or nothing at all.',
  },
  {
    album: ALBUMS.blue,
    discoveredWhen: 'July 2026',
    returns: 27,
    annotations: 15,
    significance: 'Your mother\'s favorite album. You never understood until that long drive in July. Now you carry her listening inside your own.',
    keyMoment: '"River, I\'ve come to you" — November 14th, 11:47pm. You finally understood.',
    lifeContext: 'Four hours alone in the car. By the time you arrived, you understood why people say certain albums become part of your biography.',
  },
  {
    album: ALBUMS.pinkMoon,
    discoveredWhen: 'October 2026',
    returns: 41,
    annotations: 9,
    significance: 'Twenty-eight minutes that taught you brevity could contain infinity. This album proved that what\'s left out matters as much as what remains.',
    keyMoment: 'The entire album is 28 minutes but the opening chord of "Pink Moon" is the center of gravity.',
    lifeContext: '3am listening sessions. Twice through, then silence. The album that proved the most profound listening happens when you should be sleeping.',
  },
  {
    album: ALBUMS.carrieAndLowell,
    discoveredWhen: 'April 2026',
    returns: 22,
    annotations: 11,
    significance: 'You learned that grief can be beautiful without being resolved. Some albums don\'t heal you—they sit with you in the wound.',
    keyMoment: '"I made a lot of mistakes" — The pause before this line. That\'s what you kept returning to.',
    lifeContext: 'That one month. You know which one.',
  },
]

// ============================================
// RESURFACED MOMENTS
// ============================================
export interface ResurfacedMoment {
  type: 'annotation' | 'listening-session' | 'club-memory' | 'return'
  when: string
  content: string
  album?: Album
  timestamp?: string
  context: string
}

export const RESURFACED_MOMENTS: ResurfacedMoment[] = [
  {
    type: 'annotation',
    when: 'Two years ago today',
    content: 'The voice doesn\'t just crack here—it shatters. And somehow that\'s where the beauty lives.',
    album: ALBUMS.forEmma,
    timestamp: '2:47',
    context: 'You wrote this at 1:13 AM. The timestamp tells its own story.',
  },
  {
    type: 'listening-session',
    when: 'One year ago this week',
    content: 'Three consecutive nights with Spirit of Eden',
    album: ALBUMS.spiritOfEden,
    context: 'You were learning to trust silence. The album was teaching you.',
  },
  {
    type: 'club-memory',
    when: 'Winter 2025',
    content: 'You first entered The Nocturnal Room',
    context: 'The week you realized you weren\'t the only one listening after midnight.',
  },
  {
    type: 'return',
    when: 'Throughout 2026',
    content: 'You returned to this album 14 times during your move to New York',
    album: ALBUMS.blue,
    context: 'Some albums become anchors when everything else is shifting.',
  },
]

// ============================================
// QUIET MILESTONES
// ============================================
export interface QuietMilestone {
  title: string
  when: string
  description: string
  reflection: string
}

export const QUIET_MILESTONES: QuietMilestone[] = [
  {
    title: 'First Full Album',
    when: 'January 2026',
    description: 'For Emma, Forever Ago. Start to finish. No interruptions.',
    reflection: 'You hadn\'t done that in years. It felt like remembering how to read.',
  },
  {
    title: '100th Annotation',
    when: 'June 2026',
    description: 'A quiet threshold crossed',
    reflection: 'You\'d written 100 thoughts about music. That\'s not consumption—that\'s conversation.',
  },
  {
    title: 'First Archetype Shift',
    when: 'Spring 2026',
    description: 'From The Nostalgic Wanderer to The Deliberate Listener',
    reflection: 'The platform noticed what you were becoming before you did.',
  },
  {
    title: 'One Year on LongPlay',
    when: 'December 2026',
    description: 'A year of intentional listening',
    reflection: 'Twelve months. 847 listening sessions. 174 annotations. A portrait emerged.',
  },
]

// ============================================
// SONIC THREADS - Recurring patterns
// ============================================
export interface SonicThread {
  name: string
  description: string
  frequency: string
  examples: Album[]
}

export const SONIC_THREADS: SonicThread[] = [
  {
    name: 'Solitude as Comfort',
    description: 'You gravitated toward artists who made loneliness feel less like absence and more like presence. Solo recordings. Sparse arrangements. One voice in an empty room.',
    frequency: 'Present in 67% of your listening',
    examples: [ALBUMS.pinkMoon, ALBUMS.songs, ALBUMS.ruins],
  },
  {
    name: 'Acoustic Intimacy',
    description: 'Stripped-down production. Close-mic\'d vocals. The sound of fingers on strings. You wanted to hear the room, not just the recording.',
    frequency: 'Present in 54% of your listening',
    examples: [ALBUMS.forEmma, ALBUMS.carrieAndLowell, ALBUMS.blue],
  },
  {
    name: 'Melancholy as Beauty',
    description: 'Not sadness for its own sake—but the recognition that some truths can only be sung in minor keys. Music that doesn\'t flinch.',
    frequency: 'Present in 71% of your listening',
    examples: [ALBUMS.punisher, ALBUMS.aMoonShapedPool, ALBUMS.eitherOr],
  },
  {
    name: 'Patience as Form',
    description: 'Albums that unfold slowly. Music that trusts you to wait. Compositions that breathe rather than rush.',
    frequency: 'Present in 48% of your listening',
    examples: [ALBUMS.spiritOfEden, ALBUMS.kindOfBlue, ALBUMS.vespertine],
  },
]

// ============================================
// ARCHIVE SEARCH FACETS
// ============================================
export const SEARCH_FACETS = {
  emotions: ['Longing', 'Solitude', 'Intimacy', 'Restlessness', 'Grief', 'Joy', 'Contemplation'],
  textures: ['Sparse', 'Lush', 'Electronic', 'Acoustic', 'Orchestral', 'Ambient'],
  periods: LISTENING_PERIODS.map(p => p.name),
  archetypes: ['The Nostalgic Wanderer', 'The Deliberate Listener', 'The Nocturnal Romantic', 'The Cathedral Listener'],
  rooms: ['The Nocturnal Room', 'Beautiful Damage', 'Records for Rain', 'Cathedral Hour'],
  years: ['2024', '2025', '2026'],
}

// ============================================
// YEAR IN REVIEW DATA
// ============================================
export interface YearInReview {
  year: string
  openingReflection: string
  archetypeJourney: {
    start: string
    end: string
    narrative: string
  }
  emotionalThemes: {
    theme: string
    description: string
  }[]
  recordsRevisited: {
    album: Album
    times: number
    significance: string
  }[]
  annotationsThatMattered: {
    quote: string
    album: Album
    when: string
    reflection: string
  }[]
  closingReflection: string
}

export const YEAR_IN_REVIEW_2026: YearInReview = {
  year: '2026',
  openingReflection: 'This year, you stopped consuming music and started conversing with it. The shift was gradual—you might not have noticed when background became foreground, when sound became presence. But looking back, the evidence is everywhere: in the albums you returned to, the moments you saved, the annotations that became a kind of diary.',
  archetypeJourney: {
    start: 'The Nostalgic Wanderer',
    end: 'The Nocturnal Romantic',
    narrative: 'You began the year reaching backward—finding comfort in albums that reminded you of who you used to be. By autumn, you were reaching inward instead. The nostalgia became intimacy. The wandering became arrival.',
  },
  emotionalThemes: [
    {
      theme: 'Solitude Transformed',
      description: 'Early in the year, you sought music to fill silence. By summer, you sought music that honored silence. The albums you chose began to breathe more—space between notes, room for your own thoughts to enter.',
    },
    {
      theme: 'Attention as Practice',
      description: 'You started finishing albums. Full listens became ritual. Somewhere in those uninterrupted forty minutes, you remembered what sustained attention felt like.',
    },
    {
      theme: 'Grief Without Resolution',
      description: 'You gravitated toward artists who sat with pain rather than solved it. Sufjan Stevens. Phoebe Bridgers. Nick Drake. Music that didn\'t promise healing, only presence.',
    },
  ],
  recordsRevisited: [
    {
      album: ALBUMS.forEmma,
      times: 34,
      significance: 'The album that opened the year—and the album you kept returning to. Each listen revealed something new, which is to say: you kept changing, and the album met you there.',
    },
    {
      album: ALBUMS.pinkMoon,
      times: 41,
      significance: 'Your most-returned-to album. Always late at night. Always alone. Twenty-eight minutes that somehow contained everything.',
    },
    {
      album: ALBUMS.blue,
      times: 27,
      significance: 'Your mother\'s album became yours this year. The inheritance you didn\'t know you were waiting for.',
    },
  ],
  annotationsThatMattered: [
    {
      quote: 'The voice doesn\'t just crack here—it shatters. And somehow that\'s where the beauty lives.',
      album: ALBUMS.forEmma,
      when: 'January 14, 1:13 AM',
      reflection: 'Your first annotation that felt like more than a note. This was when you realized you were writing to understand, not to remember.',
    },
    {
      quote: 'This is what patience sounds like when it becomes trust.',
      album: ALBUMS.spiritOfEden,
      when: 'March 28, 11:47 PM',
      reflection: 'The moment you understood why some albums ask you to wait.',
    },
  ],
  closingReflection: 'This year, 847 listening sessions. 174 annotations. 4 listening periods. 3 archetype shifts. But numbers don\'t capture what actually happened. What happened was: you started paying attention. You started trusting your own taste. You started treating music not as content to be consumed, but as presence to be honored. The archive holds the evidence, but you lived the transformation.',
}
