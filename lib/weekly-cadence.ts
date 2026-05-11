/**
 * LongPlay Weekly Cadence System
 * 
 * The emotional operating system of LongPlay.
 * Each week unfolds as a listening ritual:
 * 
 * Monday    — The Album (first uninterrupted listen)
 * Tuesday   — The Prompts (editorial listening prompts revealed)
 * Wednesday — Annotation Room (private notebook phase)
 * Thursday  — Annotation Room (continued)
 * Friday    — Discussion Opens (reflections become visible)
 * Saturday  — Curator's Note (long-form editorial essay)
 * Sunday    — Identity Update (taste portrait evolution)
 */

export type WeeklyPhase = 
  | 'album'
  | 'prompts'
  | 'annotation'
  | 'discussion'
  | 'curators-note'
  | 'identity-update'

export interface PhaseInfo {
  phase: WeeklyPhase
  day: string
  dayOfWeek: number // 0 = Sunday, 1 = Monday, etc.
  title: string
  subtitle: string
  invitation: string
  description: string
  nextPhase: string
  nextPhaseTime: string
  isPrivate: boolean
  moodClass: string // CSS class for phase-based visual shifts
}

const PHASES: Record<WeeklyPhase, Omit<PhaseInfo, 'day' | 'dayOfWeek' | 'nextPhaseTime'>> = {
  'album': {
    phase: 'album',
    title: 'The Album',
    subtitle: 'First Listen',
    invitation: 'Spend one uninterrupted listen with the record before entering the room.',
    description: 'This is a day for immersion. Let the album find you without commentary, without expectation. Your first impressions are the truest ones.',
    nextPhase: 'Prompts arrive tomorrow',
    isPrivate: true,
    moodClass: 'phase-album',
  },
  'prompts': {
    phase: 'prompts',
    title: 'The Prompts',
    subtitle: 'Listening Questions',
    invitation: 'Three questions to guide your next listen.',
    description: 'Not assignments. Not tests. Just invitations to notice. Answer them in your own time, or let them shape how you hear.',
    nextPhase: 'Annotation room opens tomorrow',
    isPrivate: true,
    moodClass: 'phase-prompts',
  },
  'annotation': {
    phase: 'annotation',
    title: 'Annotation Room',
    subtitle: 'Your Notebook',
    invitation: 'Your notes remain private until discussion opens.',
    description: 'This is your notebook. Save the moments that stay with you. Mark the passages that mean something. Write what you hear.',
    nextPhase: 'Discussion opens Friday evening',
    isPrivate: true,
    moodClass: 'phase-annotation',
  },
  'discussion': {
    phase: 'discussion',
    title: 'Discussion Opens',
    subtitle: 'The Room Gathers',
    invitation: 'See how others heard the same record.',
    description: 'Private reflections are now visible. Read what others noticed. Find patterns. Discover what you missed.',
    nextPhase: "Curator's note arrives tomorrow",
    isPrivate: false,
    moodClass: 'phase-discussion',
  },
  'curators-note': {
    phase: 'curators-note',
    title: "Curator's Note",
    subtitle: 'The Essay',
    invitation: 'A reflection on this week of listening.',
    description: 'The liner note written after the listen. A synthesis of the week, the themes that emerged, the passages that moved us.',
    nextPhase: 'Identity update arrives tomorrow night',
    isPrivate: false,
    moodClass: 'phase-curators-note',
  },
  'identity-update': {
    phase: 'identity-update',
    title: 'Identity Update',
    subtitle: 'Your Listening Portrait',
    invitation: 'See how this week changed how you hear.',
    description: 'Your taste portrait has evolved. See the subtle shifts, the new dimensions, the emotional textures revealed by this week of listening.',
    nextPhase: 'New album arrives Monday',
    isPrivate: false,
    moodClass: 'phase-identity',
  },
}

/**
 * Get the current phase based on the day of the week
 */
export function getCurrentPhase(date: Date = new Date()): PhaseInfo {
  const dayOfWeek = date.getDay() // 0 = Sunday, 1 = Monday, etc.
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  
  let phase: WeeklyPhase
  
  switch (dayOfWeek) {
    case 1: // Monday
      phase = 'album'
      break
    case 2: // Tuesday
      phase = 'prompts'
      break
    case 3: // Wednesday
    case 4: // Thursday
      phase = 'annotation'
      break
    case 5: // Friday
      phase = 'discussion'
      break
    case 6: // Saturday
      phase = 'curators-note'
      break
    case 0: // Sunday
      phase = 'identity-update'
      break
    default:
      phase = 'album'
  }
  
  const phaseInfo = PHASES[phase]
  
  return {
    ...phaseInfo,
    day: dayNames[dayOfWeek],
    dayOfWeek,
    nextPhaseTime: getNextPhaseTime(dayOfWeek),
  }
}

/**
 * Get a human-readable time until the next phase
 */
function getNextPhaseTime(currentDay: number): string {
  const now = new Date()
  const hour = now.getHours()
  
  // If it's evening (after 6pm), say "tomorrow morning"
  if (hour >= 18) {
    return 'Tomorrow morning'
  }
  
  // If it's morning, say "this evening" for same-day transitions
  if (hour < 12) {
    if (currentDay === 4) { // Thursday evening -> Friday discussion
      return 'This evening'
    }
  }
  
  return 'Tomorrow'
}

/**
 * Get all phases with their day information
 */
export function getAllPhases(): PhaseInfo[] {
  const dayMapping: [number, WeeklyPhase][] = [
    [1, 'album'],
    [2, 'prompts'],
    [3, 'annotation'],
    [4, 'annotation'],
    [5, 'discussion'],
    [6, 'curators-note'],
    [0, 'identity-update'],
  ]
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  
  return dayMapping.map(([dayOfWeek, phase]) => ({
    ...PHASES[phase],
    day: dayNames[dayOfWeek],
    dayOfWeek,
    nextPhaseTime: getNextPhaseTime(dayOfWeek),
  }))
}

/**
 * Get the week progress (0-100) based on current day
 */
export function getWeekProgress(date: Date = new Date()): number {
  const dayOfWeek = date.getDay()
  // Convert Sunday (0) to 7 for end-of-week calculation
  const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek
  return Math.round((adjustedDay / 7) * 100)
}

/**
 * Sample listening prompts for the current cycle
 */
export const CURRENT_PROMPTS = [
  {
    id: 1,
    prompt: "What emotion arrives before the lyrics do?",
    hint: "Notice the instrumental introduction. What does it prepare you to feel?",
  },
  {
    id: 2,
    prompt: "Where does the room seem to open?",
    hint: "Find the moment where the sonic space expands, where there's suddenly more air.",
  },
  {
    id: 3,
    prompt: "What texture keeps returning?",
    hint: "A guitar tone, a reverb, a particular way the voice is recorded. What's the signature sound?",
  },
]

/**
 * Sample curator's note content
 */
export const CURATORS_NOTE = {
  title: "On Winter Cabins and the Architecture of Solitude",
  author: "The Nocturnal Room",
  excerpt: "What makes For Emma, Forever Ago remarkable is not the mythology of its creation—though the Wisconsin cabin has become indie rock's most famous origin story—but rather how completely it captures the texture of isolation. This is not an album about being alone. It is an album that sounds alone.",
  readingTime: "8 min read",
}
