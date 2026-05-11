'use client'

import { ALBUMS, type Album } from './albums'

/**
 * LongPlay Past Cycles Archive
 * 
 * Previous listening cycles are NOT expired content.
 * They are:
 * - preserved cultural artifacts
 * - emotional memory anchors
 * - identity-building eras
 * - chapters in the user's listening life
 * 
 * The archive of past cycles is core infrastructure,
 * not a secondary feature.
 */

// ============================================
// LISTENING CYCLE - A single week-long experience
// ============================================
export interface ListeningCycle {
  id: string
  week: number // Week number of the year
  year: number
  
  // Core content
  album: Album
  room: {
    id: string
    name: string
    curator: string
  }
  
  // Dates
  startDate: string // ISO date
  endDate: string // ISO date
  seasonLabel: string // "Winter 2026", "Spring 2026", etc.
  
  // Curator content
  curatorNote: {
    title: string
    excerpt: string
    fullText: string
    author: string
  }
  
  // Listening prompts from that week
  prompts: {
    question: string
    hint: string
  }[]
  
  // Emotional/sonic dimensions
  emotionalThemes: string[]
  sonicDimensions: {
    dimension: string
    value: number // 0-100
  }[]
  
  // User's engagement
  userEngagement: {
    listeningSessions: number
    annotations: number
    savedMoments: number
    discussionContributions: number
  }
  
  // Identity impact
  identityImpact: {
    archetypeBefore: string
    archetypeAfter: string
    shiftDescription: string
    dimensionsAffected: string[]
  }
  
  // Key moments preserved
  keyAnnotations: {
    timestamp: string
    trackNumber: number
    trackTitle: string
    content: string
    emotion?: string
    savedAt: string
  }[]
  
  // Still resonates
  stillResonates: {
    isTrue: boolean
    returnsSince: number
    lastReturn?: string
    resonanceNote?: string
  }
}

// ============================================
// LISTENING ERA - Grouped cycles by emotional theme
// ============================================
export interface ListeningEra {
  id: string
  name: string // "The Nocturnal Winter", "The Ambient Drift"
  timeRange: string
  description: string
  dominantThemes: string[]
  dominantSonic: string[]
  archetypeJourney: {
    start: string
    end: string
  }
  cycles: ListeningCycle[]
  totalAnnotations: number
  formativeRecord?: Album // The record that defined this era
}

// ============================================
// SAMPLE PAST CYCLES DATA
// ============================================
export const PAST_CYCLES: ListeningCycle[] = [
  {
    id: 'cycle-2026-w1',
    week: 1,
    year: 2026,
    album: ALBUMS.forEmma,
    room: {
      id: 'nocturnal-room',
      name: 'The Nocturnal Room',
      curator: 'Eleanor Vance',
    },
    startDate: '2026-01-06',
    endDate: '2026-01-12',
    seasonLabel: 'Winter 2026',
    curatorNote: {
      title: 'On Winter Cabins and the Architecture of Solitude',
      excerpt: 'What makes For Emma, Forever Ago remarkable is not the mythology of its creation—though the Wisconsin cabin has become indie rock\'s most famous origin story—but rather how completely it captures the texture of isolation.',
      fullText: 'What makes For Emma, Forever Ago remarkable is not the mythology of its creation—though the Wisconsin cabin has become indie rock\'s most famous origin story—but rather how completely it captures the texture of isolation. This is not an album about being alone. It is an album that sounds alone.\n\nThe falsetto isn\'t a stylistic choice—it\'s a necessity. Vernon\'s voice has retreated so far inward that it can only emerge in its highest register, the register of private thought, of talking to oneself in an empty room. The production isn\'t lo-fi for aesthetic reasons; it\'s lo-fi because this music was never meant to be heard by anyone else.\n\nWe spent a week here. And what emerged from our listening was a collective recognition: solitude is not the opposite of connection. Sometimes, the most profound connection happens when we bring our solitude to the same room.',
      author: 'The Nocturnal Room',
    },
    prompts: [
      { question: 'What emotion arrives before the lyrics do?', hint: 'Notice the instrumental introduction. What does it prepare you to feel?' },
      { question: 'Where does the room seem to open?', hint: 'Find the moment where the sonic space expands.' },
      { question: 'What texture keeps returning?', hint: 'A guitar tone, a reverb, a particular way the voice is recorded.' },
    ],
    emotionalThemes: ['Solitude', 'Healing', 'Winter', 'Intimacy'],
    sonicDimensions: [
      { dimension: 'Atmospheric', value: 85 },
      { dimension: 'Intimate', value: 92 },
      { dimension: 'Sparse', value: 78 },
      { dimension: 'Melancholic', value: 88 },
    ],
    userEngagement: {
      listeningSessions: 12,
      annotations: 8,
      savedMoments: 5,
      discussionContributions: 3,
    },
    identityImpact: {
      archetypeBefore: 'The Passive Consumer',
      archetypeAfter: 'The Nostalgic Wanderer',
      shiftDescription: 'This cycle marked the beginning of your intentional listening. You stopped letting algorithms choose.',
      dimensionsAffected: ['Solitude Comfort', 'Atmospheric Preference', 'Patience'],
    },
    keyAnnotations: [
      {
        timestamp: '2:47',
        trackNumber: 3,
        trackTitle: 'Skinny Love',
        content: 'The voice doesn\'t just crack here—it shatters. And somehow that\'s where the beauty lives.',
        emotion: 'Melancholy',
        savedAt: '2026-01-08T01:13:00Z',
      },
      {
        timestamp: '1:23',
        trackNumber: 1,
        trackTitle: 'Flume',
        content: 'That opening guitar figure—it sounds like someone remembering how to breathe.',
        emotion: 'Stillness',
        savedAt: '2026-01-07T23:45:00Z',
      },
    ],
    stillResonates: {
      isTrue: true,
      returnsSince: 34,
      lastReturn: '2026-05-01',
      resonanceNote: 'You\'ve returned to this cycle more than any other. It appears in your late-night listening almost weekly.',
    },
  },
  {
    id: 'cycle-2026-w5',
    week: 5,
    year: 2026,
    album: ALBUMS.pinkMoon,
    room: {
      id: 'nocturnal-room',
      name: 'The Nocturnal Room',
      curator: 'Eleanor Vance',
    },
    startDate: '2026-02-03',
    endDate: '2026-02-09',
    seasonLabel: 'Winter 2026',
    curatorNote: {
      title: 'Twenty-Eight Minutes of Infinite Space',
      excerpt: 'Nick Drake recorded Pink Moon in two sessions. No overdubs. No second takes. What remains is perhaps the most distilled record ever made—twenty-eight minutes that somehow contain everything.',
      fullText: 'Nick Drake recorded Pink Moon in two sessions. No overdubs. No second takes. What remains is perhaps the most distilled record ever made—twenty-eight minutes that somehow contain everything.\n\nThe brevity is the point. Every note that isn\'t there creates space. Every silence is a choice. This is music pared down to its most essential elements: voice, guitar, occasionally piano. Nothing to hide behind.\n\nWhat we discovered this week: sometimes the most profound listening experiences are the shortest. Sometimes twenty-eight minutes is enough to change how you hear everything else.',
      author: 'The Nocturnal Room',
    },
    prompts: [
      { question: 'What lives in the silence between songs?', hint: 'The spaces are as composed as the notes.' },
      { question: 'How does brevity change intimacy?', hint: 'Consider what the short runtime does to your attention.' },
      { question: 'Where do you hear the room itself?', hint: 'This was recorded in one room. Can you hear its dimensions?' },
    ],
    emotionalThemes: ['Brevity', 'Intimacy', 'Silence', 'Presence'],
    sonicDimensions: [
      { dimension: 'Sparse', value: 95 },
      { dimension: 'Intimate', value: 98 },
      { dimension: 'Acoustic', value: 100 },
      { dimension: 'Nocturnal', value: 90 },
    ],
    userEngagement: {
      listeningSessions: 18,
      annotations: 6,
      savedMoments: 4,
      discussionContributions: 2,
    },
    identityImpact: {
      archetypeBefore: 'The Nostalgic Wanderer',
      archetypeAfter: 'The Nostalgic Wanderer',
      shiftDescription: 'This cycle deepened your appreciation for brevity. You began to trust albums that knew when to end.',
      dimensionsAffected: ['Brevity Appreciation', 'Silence Comfort'],
    },
    keyAnnotations: [
      {
        timestamp: '0:00',
        trackNumber: 1,
        trackTitle: 'Pink Moon',
        content: 'That opening chord. It\'s the center of gravity for the entire album. Everything falls toward it.',
        emotion: 'Gravity',
        savedAt: '2026-02-04T02:30:00Z',
      },
    ],
    stillResonates: {
      isTrue: true,
      returnsSince: 41,
      lastReturn: '2026-05-08',
      resonanceNote: 'Your most-returned-to cycle. Always late at night. Always alone.',
    },
  },
  {
    id: 'cycle-2026-w9',
    week: 9,
    year: 2026,
    album: ALBUMS.spiritOfEden,
    room: {
      id: 'cathedral-hour',
      name: 'Cathedral Hour',
      curator: 'Marcus Webb',
    },
    startDate: '2026-03-03',
    endDate: '2026-03-09',
    seasonLabel: 'Spring 2026',
    curatorNote: {
      title: 'The Birth of Patience',
      excerpt: 'Spirit of Eden is not an album you listen to. It\'s an album you inhabit. Mark Hollis and Tim Friese-Greene constructed a cathedral of sound—vast, echoing, sacred—and then stepped back to let you wander through it.',
      fullText: 'Spirit of Eden is not an album you listen to. It\'s an album you inhabit. Mark Hollis and Tim Friese-Greene constructed a cathedral of sound—vast, echoing, sacred—and then stepped back to let you wander through it.\n\nThe silence here is not absence. It\'s architecture. The moments of quiet are load-bearing walls. Remove them and the whole structure collapses.\n\nThis week we learned what patience sounds like when it becomes form. We learned that some albums don\'t reward attention—they require it. And we learned that the space between notes can contain more meaning than the notes themselves.',
      author: 'Cathedral Hour',
    },
    prompts: [
      { question: 'When does the silence become part of the song?', hint: 'Find the moment where absence becomes presence.' },
      { question: 'What architecture do you hear?', hint: 'This album was constructed like a building. What kind?' },
      { question: 'Where does trust enter the listening?', hint: 'At what moment do you stop waiting for something to happen?' },
    ],
    emotionalThemes: ['Patience', 'Architecture', 'Trust', 'Sacred'],
    sonicDimensions: [
      { dimension: 'Atmospheric', value: 98 },
      { dimension: 'Orchestral', value: 75 },
      { dimension: 'Sparse', value: 82 },
      { dimension: 'Transcendent', value: 90 },
    ],
    userEngagement: {
      listeningSessions: 8,
      annotations: 5,
      savedMoments: 3,
      discussionContributions: 4,
    },
    identityImpact: {
      archetypeBefore: 'The Nostalgic Wanderer',
      archetypeAfter: 'The Deliberate Listener',
      shiftDescription: 'This cycle taught you that patience is a form of trust. You stopped waiting for albums to give you something and started meeting them where they were.',
      dimensionsAffected: ['Patience', 'Atmospheric Tolerance', 'Trust'],
    },
    keyAnnotations: [
      {
        timestamp: '4:30',
        trackNumber: 1,
        trackTitle: 'The Rainbow',
        content: 'This is what patience sounds like when it becomes trust. The album isn\'t going to meet you halfway. You have to go to it.',
        emotion: 'Patience',
        savedAt: '2026-03-05T23:47:00Z',
      },
    ],
    stillResonates: {
      isTrue: true,
      returnsSince: 18,
      lastReturn: '2026-04-28',
      resonanceNote: 'The cycle that changed how you hear. You reference this album in annotations more than any other.',
    },
  },
  {
    id: 'cycle-2026-w13',
    week: 13,
    year: 2026,
    album: ALBUMS.blue,
    room: {
      id: 'beautiful-damage',
      name: 'Beautiful Damage',
      curator: 'Sarah Chen',
    },
    startDate: '2026-03-31',
    endDate: '2026-04-06',
    seasonLabel: 'Spring 2026',
    curatorNote: {
      title: 'The Most Vulnerable Album Ever Made',
      excerpt: 'Blue is not an album. It\'s an act of self-exposure so complete that fifty years later, it still feels dangerous to listen to. Joni Mitchell didn\'t just write about her feelings—she handed them to us, raw and unprocessed.',
      fullText: 'Blue is not an album. It\'s an act of self-exposure so complete that fifty years later, it still feels dangerous to listen to. Joni Mitchell didn\'t just write about her feelings—she handed them to us, raw and unprocessed, and trusted us to hold them carefully.\n\nThe production is famously spare. Kris Kristofferson reportedly told Mitchell she should keep her feelings to herself. She didn\'t listen. Thank god.\n\nThis week we witnessed what happens when vulnerability becomes art. We learned that confession, done right, isn\'t weakness—it\'s the bravest thing a songwriter can do. And we learned that some albums don\'t just reveal their creator. They reveal us.',
      author: 'Beautiful Damage',
    },
    prompts: [
      { question: 'Where does vulnerability become strength?', hint: 'Find the moment where exposure transforms into power.' },
      { question: 'What does the voice carry that the words don\'t?', hint: 'Listen to what she\'s saying underneath the lyrics.' },
      { question: 'How does confession change the room?', hint: 'Notice how your own defenses respond to hers.' },
    ],
    emotionalThemes: ['Vulnerability', 'Confession', 'Strength', 'Intimacy'],
    sonicDimensions: [
      { dimension: 'Intimate', value: 100 },
      { dimension: 'Acoustic', value: 95 },
      { dimension: 'Confessional', value: 98 },
      { dimension: 'Classic', value: 90 },
    ],
    userEngagement: {
      listeningSessions: 14,
      annotations: 11,
      savedMoments: 7,
      discussionContributions: 5,
    },
    identityImpact: {
      archetypeBefore: 'The Deliberate Listener',
      archetypeAfter: 'The Deliberate Listener',
      shiftDescription: 'This cycle connected you to your mother\'s listening. The inheritance you didn\'t know you were waiting for.',
      dimensionsAffected: ['Vulnerability Tolerance', 'Confessional Appreciation', 'Inheritance'],
    },
    keyAnnotations: [
      {
        timestamp: '3:12',
        trackNumber: 5,
        trackTitle: 'River',
        content: 'My mother\'s favorite song. I never understood until now. Now I carry her listening inside my own.',
        emotion: 'Inheritance',
        savedAt: '2026-04-02T22:15:00Z',
      },
      {
        timestamp: '0:45',
        trackNumber: 2,
        trackTitle: 'My Old Man',
        content: 'She\'s not singing about love. She\'s singing about the terror of needing someone.',
        emotion: 'Recognition',
        savedAt: '2026-04-03T01:30:00Z',
      },
    ],
    stillResonates: {
      isTrue: true,
      returnsSince: 27,
      lastReturn: '2026-05-07',
      resonanceNote: 'The cycle that became inheritance. You listen to this album differently now than you did before LongPlay.',
    },
  },
  {
    id: 'cycle-2026-w17',
    week: 17,
    year: 2026,
    album: ALBUMS.carrieAndLowell,
    room: {
      id: 'beautiful-damage',
      name: 'Beautiful Damage',
      curator: 'Sarah Chen',
    },
    startDate: '2026-04-28',
    endDate: '2026-05-04',
    seasonLabel: 'Spring 2026',
    curatorNote: {
      title: 'Grief That Doesn\'t Resolve',
      excerpt: 'Carrie & Lowell is not a healing album. It\'s a grieving album. Sufjan Stevens lost his mother—a woman who was largely absent from his life—and instead of finding closure, he found only more questions.',
      fullText: 'Carrie & Lowell is not a healing album. It\'s a grieving album. Sufjan Stevens lost his mother—a woman who was largely absent from his life—and instead of finding closure, he found only more questions.\n\nThe production is almost invisible. Stevens strips away the orchestral maximalism of his earlier work, leaving only voice, guitar, and ghost. The songs don\'t build. They haunt.\n\nThis week we learned that some grief doesn\'t have a resolution. Some loss doesn\'t transform into wisdom. Sometimes the most honest response to death is not acceptance, but bewilderment. And sometimes music doesn\'t heal us—it sits with us in the wound.',
      author: 'Beautiful Damage',
    },
    prompts: [
      { question: 'Where does grief live in the body of this music?', hint: 'Find the physical sensation the songs create.' },
      { question: 'What questions remain unanswered?', hint: 'Notice what the album refuses to resolve.' },
      { question: 'How does absence become presence?', hint: 'The album is about someone who wasn\'t there. How do you hear that?' },
    ],
    emotionalThemes: ['Grief', 'Absence', 'Memory', 'Bewilderment'],
    sonicDimensions: [
      { dimension: 'Sparse', value: 90 },
      { dimension: 'Intimate', value: 95 },
      { dimension: 'Melancholic', value: 98 },
      { dimension: 'Haunted', value: 92 },
    ],
    userEngagement: {
      listeningSessions: 10,
      annotations: 9,
      savedMoments: 6,
      discussionContributions: 4,
    },
    identityImpact: {
      archetypeBefore: 'The Deliberate Listener',
      archetypeAfter: 'The Nocturnal Romantic',
      shiftDescription: 'This cycle taught you that some albums don\'t heal. They accompany. You began listening late at night, alone, with intention.',
      dimensionsAffected: ['Grief Tolerance', 'Nocturnal Listening', 'Presence'],
    },
    keyAnnotations: [
      {
        timestamp: '2:15',
        trackNumber: 4,
        trackTitle: 'Fourth of July',
        content: '"I made a lot of mistakes." The pause before this line. That\'s what I keep returning to.',
        emotion: 'Regret',
        savedAt: '2026-04-30T02:45:00Z',
      },
    ],
    stillResonates: {
      isTrue: true,
      returnsSince: 22,
      lastReturn: '2026-05-06',
      resonanceNote: 'The cycle where you became a nocturnal listener. You return to this album when you need to feel accompanied.',
    },
  },
]

// ============================================
// LISTENING ERAS - Grouped emotionally
// ============================================
export const LISTENING_ERAS: ListeningEra[] = [
  {
    id: 'era-nocturnal-winter',
    name: 'The Nocturnal Winter',
    timeRange: 'January — February 2026',
    description: 'You retreated inward. Every album you chose had space in it—room to breathe, room to grieve, room to simply be alone without loneliness. The listening happened late, always late, when the house was quiet.',
    dominantThemes: ['Solitude', 'Intimacy', 'Silence', 'Winter'],
    dominantSonic: ['Sparse', 'Acoustic', 'Atmospheric'],
    archetypeJourney: {
      start: 'The Passive Consumer',
      end: 'The Nostalgic Wanderer',
    },
    cycles: PAST_CYCLES.filter(c => c.seasonLabel === 'Winter 2026'),
    totalAnnotations: 14,
    formativeRecord: ALBUMS.forEmma,
  },
  {
    id: 'era-deliberate-spring',
    name: 'The Deliberate Spring',
    timeRange: 'March — May 2026',
    description: 'Something shifted. You stopped reaching for comfort and started reaching for challenge. Albums that made demands. Music that refused to meet you halfway. And in that refusal, you found something deeper than comfort—you found trust.',
    dominantThemes: ['Patience', 'Trust', 'Vulnerability', 'Grief'],
    dominantSonic: ['Atmospheric', 'Orchestral', 'Confessional'],
    archetypeJourney: {
      start: 'The Nostalgic Wanderer',
      end: 'The Nocturnal Romantic',
    },
    cycles: PAST_CYCLES.filter(c => c.seasonLabel === 'Spring 2026'),
    totalAnnotations: 25,
    formativeRecord: ALBUMS.spiritOfEden,
  },
]

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get cycles that still resonate
 */
export function getResonatingCycles(): ListeningCycle[] {
  return PAST_CYCLES.filter(c => c.stillResonates.isTrue)
    .sort((a, b) => (b.stillResonates.returnsSince || 0) - (a.stillResonates.returnsSince || 0))
}

/**
 * Get cycles by room
 */
export function getCyclesByRoom(roomId: string): ListeningCycle[] {
  return PAST_CYCLES.filter(c => c.room.id === roomId)
}

/**
 * Get cycles by season
 */
export function getCyclesBySeason(season: string): ListeningCycle[] {
  return PAST_CYCLES.filter(c => c.seasonLabel === season)
}

/**
 * Get the most impactful cycles (those that changed archetype)
 */
export function getTransformativeCycles(): ListeningCycle[] {
  return PAST_CYCLES.filter(c => 
    c.identityImpact.archetypeBefore !== c.identityImpact.archetypeAfter
  )
}

/**
 * Get total engagement stats
 */
export function getTotalEngagement() {
  return PAST_CYCLES.reduce((acc, cycle) => ({
    listeningSessions: acc.listeningSessions + cycle.userEngagement.listeningSessions,
    annotations: acc.annotations + cycle.userEngagement.annotations,
    savedMoments: acc.savedMoments + cycle.userEngagement.savedMoments,
    discussionContributions: acc.discussionContributions + cycle.userEngagement.discussionContributions,
  }), { listeningSessions: 0, annotations: 0, savedMoments: 0, discussionContributions: 0 })
}
