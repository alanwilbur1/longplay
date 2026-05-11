/**
 * LongPlay Room Affinity System
 * 
 * This is NOT a recommendation engine.
 * This is a CULTURAL PLACEMENT system.
 * 
 * The system should feel like:
 * - the platform slowly understands where the listener BELONGS
 * - emotionally intelligent interpretation, not algorithmic matching
 * - "These rooms understand how I listen"
 * 
 * Rooms are NOT genres or categories.
 * Rooms ARE listening philosophies, emotional terrains, cultural environments.
 */

import { EDITORIAL_ROOMS, GENRE_ROOMS, type Room } from './rooms'
import { ALBUMS, type Album } from './albums'

// ============================================
// EMOTIONAL DIMENSIONS — The core listening traits
// ============================================
export interface ListeningDimensions {
  // Sonic preferences
  warmth: number         // 0-100: cold ↔ warm
  density: number        // 0-100: sparse ↔ dense
  organicDigital: number // 0-100: organic ↔ synthetic
  pacing: number         // 0-100: restrained ↔ propulsive
  
  // Emotional tendencies
  melancholy: number     // 0-100: hopeful ↔ melancholic
  intimacy: number       // 0-100: expansive ↔ intimate
  transcendence: number  // 0-100: grounded ↔ transcendent
  ambiguity: number      // 0-100: direct ↔ ambiguous
  
  // Behavioral patterns
  nocturnal: number      // 0-100: daytime ↔ after-midnight
  immersive: number      // 0-100: casual ↔ deep-listening
  archival: number       // 0-100: discovery-focused ↔ return-to-favorites
  solitary: number       // 0-100: social ↔ solitary
}

// ============================================
// ROOM AFFINITY — Where the listener belongs
// ============================================
export interface RoomAffinity {
  roomSlug: string
  roomName: string
  
  // Affinity strength (not percentage - emotional resonance)
  resonance: 'deep' | 'strong' | 'emerging' | 'peripheral'
  
  // Why this room resonates (editorial language, not algorithmic)
  resonanceExplanation: string
  
  // Specific emotional threads that connect
  emotionalThreads: string[]
  
  // Sonic patterns that align
  sonicPatterns: string[]
  
  // Is this a 70% resonance (familiar) or 30% expansion (growth)?
  affinityType: 'resonance' | 'expansion'
  
  // Temporal state
  trend: 'drifting-toward' | 'stable' | 'drifting-away' | 'returning'
  trendNote?: string // e.g., "You've been spending more time here recently"
}

// ============================================
// ROOM DRIFT — Identity evolution over time
// ============================================
export interface RoomDrift {
  fromRoom: string
  toRoom: string
  period: string // e.g., "This winter"
  driftNote: string // e.g., "Your listening has moved from propulsion toward atmosphere"
  emotionalShift: string // e.g., "You're trusting silence more"
}

// ============================================
// LISTENING MEMORY — How rooms accumulate meaning
// ============================================
export interface RoomMemory {
  roomSlug: string
  firstVisit: string // Date
  totalCyclesParticipated: number
  mostRecentCycle: string
  seasonalPattern?: string // e.g., "You return here most often in winter"
  significantMoment?: {
    cycle: string
    note: string
  }
}

// ============================================
// SAMPLE DATA — A listener's room affinities
// ============================================
export const CURRENT_LISTENER_DIMENSIONS: ListeningDimensions = {
  // Sonic preferences
  warmth: 72,
  density: 38,
  organicDigital: 22,
  pacing: 25,
  
  // Emotional tendencies
  melancholy: 68,
  intimacy: 78,
  transcendence: 55,
  ambiguity: 62,
  
  // Behavioral patterns
  nocturnal: 82,
  immersive: 85,
  archival: 70,
  solitary: 75,
}

// The listener's current room affinities
export const ROOM_AFFINITIES: RoomAffinity[] = [
  {
    roomSlug: 'nocturnal-room',
    roomName: 'The Nocturnal Room',
    resonance: 'deep',
    resonanceExplanation: 'You consistently return to records built around atmosphere, restraint, and emotional accumulation. This room was practically designed for how you listen.',
    emotionalThreads: [
      'Solitude as creative space',
      'Music that rewards patience',
      'Intimacy over spectacle',
    ],
    sonicPatterns: [
      'Sparse, atmospheric arrangements',
      'Restrained vocal performances',
      'Analog warmth in production',
    ],
    affinityType: 'resonance',
    trend: 'stable',
  },
  {
    roomSlug: 'cathedral-hour',
    roomName: 'Cathedral Hour',
    resonance: 'strong',
    resonanceExplanation: 'Your affinity for transcendent, architecturally-paced records continues aligning with this room. You seem to trust music that creates space rather than fills it.',
    emotionalThreads: [
      'Patience as practice',
      'Sound as architecture',
      'Devotional attention',
    ],
    sonicPatterns: [
      'Expansive sonic spaces',
      'Slow-building compositions',
      'Ambient textures',
    ],
    affinityType: 'resonance',
    trend: 'drifting-toward',
    trendNote: 'Your listening has been moving toward this room recently.',
  },
  {
    roomSlug: 'beautiful-damage',
    roomName: 'Beautiful Damage',
    resonance: 'strong',
    resonanceExplanation: 'Your appreciation for emotional honesty and catharsis through restraint draws you here. You process pain through music that doesn\'t perform it.',
    emotionalThreads: [
      'Vulnerability as courage',
      'Pain as material',
      'Collective catharsis',
    ],
    sonicPatterns: [
      'Confessional vocals',
      'Emotional crescendos that earn their release',
      'Production that serves the wound',
    ],
    affinityType: 'resonance',
    trend: 'stable',
  },
  {
    roomSlug: 'records-for-rain',
    roomName: 'Records for Rain',
    resonance: 'emerging',
    resonanceExplanation: 'You\'re beginning to find shelter in music that matches inner weather. This room may feel increasingly familiar.',
    emotionalThreads: [
      'Melancholy as comfort',
      'Music as shelter',
      'Emotional matching',
    ],
    sonicPatterns: [
      'Soft, diffused production',
      'Piano and strings',
      'Rainy-day aesthetics',
    ],
    affinityType: 'resonance',
    trend: 'drifting-toward',
    trendNote: 'You\'ve spent more time here during grey afternoons.',
  },
  {
    roomSlug: 'analog-futures',
    roomName: 'Analog Futures',
    resonance: 'emerging',
    resonanceExplanation: 'Your preference for organic warmth meets electronic texture here. This room may expand how you think about technology and soul.',
    emotionalThreads: [
      'Human-machine dialogue',
      'Warmth in digital spaces',
    ],
    sonicPatterns: [
      'Organic synthesis',
      'Textural electronics',
      'Domestic sounds in production',
    ],
    affinityType: 'expansion',
    trend: 'stable',
    trendNote: 'A room that may gently expand your listening.',
  },
]

// The listener's room drift history
export const ROOM_DRIFT_HISTORY: RoomDrift[] = [
  {
    fromRoom: 'sonic-wandering',
    toRoom: 'nocturnal-room',
    period: 'Winter 2024',
    driftNote: 'Your listening moved from ambient exploration toward intimate, confessional records.',
    emotionalShift: 'You began trusting lyrics again after months of instrumental focus.',
  },
  {
    fromRoom: 'nocturnal-room',
    toRoom: 'cathedral-hour',
    period: 'This winter',
    driftNote: 'Your listening has recently drifted toward more expansive, transcendent sound.',
    emotionalShift: 'You\'re beginning to seek architecture over intimacy.',
  },
]

// The listener's room memories
export const ROOM_MEMORIES: RoomMemory[] = [
  {
    roomSlug: 'nocturnal-room',
    firstVisit: 'January 2024',
    totalCyclesParticipated: 47,
    mostRecentCycle: 'For Emma, Forever Ago',
    seasonalPattern: 'You return most intensely during winter months.',
    significantMoment: {
      cycle: 'Carrie & Lowell',
      note: 'The cycle where you wrote 23 annotations—your most active participation.',
    },
  },
  {
    roomSlug: 'cathedral-hour',
    firstVisit: 'August 2025',
    totalCyclesParticipated: 12,
    mostRecentCycle: 'Spirit of Eden',
    seasonalPattern: 'You visit here when seeking quiet.',
    significantMoment: {
      cycle: 'Music for Airports',
      note: 'Your first deep ambient experience. You called it "permission to be still."',
    },
  },
  {
    roomSlug: 'beautiful-damage',
    firstVisit: 'March 2024',
    totalCyclesParticipated: 28,
    mostRecentCycle: 'Punisher',
    significantMoment: {
      cycle: 'Blue',
      note: 'You listened to the entire album three times in one night.',
    },
  },
]

// ============================================
// AFFINITY INSIGHTS — Editorial observations
// ============================================
export interface AffinityInsight {
  id: string
  type: 'drift' | 'pattern' | 'seasonal' | 'resonance'
  observation: string // Editorial, emotionally intelligent
  context?: string
  actionable?: {
    label: string
    roomSlug: string
  }
}

export const CURRENT_INSIGHTS: AffinityInsight[] = [
  {
    id: 'drift-cathedral',
    type: 'drift',
    observation: 'Your listening identity has recently drifted toward Cathedral Hour.',
    context: 'You\'re beginning to move away from intimacy and toward transcendence.',
    actionable: {
      label: 'Visit Cathedral Hour',
      roomSlug: 'cathedral-hour',
    },
  },
  {
    id: 'pattern-nocturnal',
    type: 'pattern',
    observation: 'You consistently return to records built around atmosphere, restraint, and emotional accumulation.',
    context: 'The Nocturnal Room continues feeling like home.',
  },
  {
    id: 'seasonal-winter',
    type: 'seasonal',
    observation: 'Your listening intensifies during winter months.',
    context: 'You tend toward deeper immersion and longer annotation sessions when daylight fades.',
  },
  {
    id: 'resonance-rain',
    type: 'resonance',
    observation: 'You\'ve spent more time recently in rooms centered around emotional restraint.',
    context: 'Records for Rain may feel increasingly familiar.',
    actionable: {
      label: 'Explore Records for Rain',
      roomSlug: 'records-for-rain',
    },
  },
]

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get rooms that resonate with the listener (70% resonance)
 */
export function getResonatingRooms(): RoomAffinity[] {
  return ROOM_AFFINITIES.filter(a => a.affinityType === 'resonance')
}

/**
 * Get rooms that might expand the listener (30% expansion)
 */
export function getExpansionRooms(): RoomAffinity[] {
  return ROOM_AFFINITIES.filter(a => a.affinityType === 'expansion')
}

/**
 * Get rooms the listener is drifting toward
 */
export function getDriftingTowardRooms(): RoomAffinity[] {
  return ROOM_AFFINITIES.filter(a => a.trend === 'drifting-toward')
}

/**
 * Get the listener's primary room (deepest resonance)
 */
export function getPrimaryRoom(): RoomAffinity | undefined {
  return ROOM_AFFINITIES.find(a => a.resonance === 'deep')
}

/**
 * Get recent room drift
 */
export function getRecentDrift(): RoomDrift | undefined {
  return ROOM_DRIFT_HISTORY[ROOM_DRIFT_HISTORY.length - 1]
}

/**
 * Get room memory by slug
 */
export function getRoomMemory(slug: string): RoomMemory | undefined {
  return ROOM_MEMORIES.find(m => m.roomSlug === slug)
}

/**
 * Get current insights
 */
export function getAffinityInsights(): AffinityInsight[] {
  return CURRENT_INSIGHTS
}

/**
 * Get affinity visualization data
 * Returns an abstract representation for elegant visualization
 * (NOT percentages or charts)
 */
export interface AffinityField {
  roomSlug: string
  roomName: string
  distance: 'center' | 'inner' | 'outer' | 'peripheral'
  drift: 'approaching' | 'stable' | 'receding'
}

export function getAffinityField(): AffinityField[] {
  return ROOM_AFFINITIES.map(a => ({
    roomSlug: a.roomSlug,
    roomName: a.roomName,
    distance: a.resonance === 'deep' ? 'center' 
            : a.resonance === 'strong' ? 'inner'
            : a.resonance === 'emerging' ? 'outer'
            : 'peripheral',
    drift: a.trend === 'drifting-toward' ? 'approaching'
         : a.trend === 'drifting-away' ? 'receding'
         : 'stable',
  }))
}

// ============================================
// ARCHETYPE → ROOM MAPPING
// ============================================
export const ARCHETYPE_ROOM_ALIGNMENTS: Record<string, string[]> = {
  'The Midnight Archivist': ['nocturnal-room', 'records-for-rain', 'warm-static'],
  'The Nocturnal Romantic': ['nocturnal-room', 'beautiful-damage', 'records-for-rain'],
  'The Cathedral Listener': ['cathedral-hour', 'nocturnal-room', 'spiritual-jazz'],
  'The Sonic Wanderer': ['analog-futures', 'cathedral-hour', 'japanese-ambient'],
  'The Velvet Dissenter': ['nocturnal-room', 'beautiful-damage', 'analog-futures'],
  'The Seasonal Listener': ['records-for-rain', 'nocturnal-room', 'beautiful-damage'],
  'The Warm Static Seeker': ['warm-static', 'analog-futures', 'records-for-rain'],
  'The Deep Immersionist': ['cathedral-hour', 'nocturnal-room', 'japanese-ambient'],
}

/**
 * Get aligned rooms for an archetype
 */
export function getRoomsForArchetype(archetype: string): string[] {
  return ARCHETYPE_ROOM_ALIGNMENTS[archetype] || []
}
