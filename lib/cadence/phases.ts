/**
 * lib/cadence/phases.ts — Phase 3C.1
 *
 * The canonical ritual-phase definitions. All editorial copy that is
 * driven by ritual phase lives here. If a new component wants to
 * surface phase-specific text, extend this data — do not hardcode in
 * the component.
 *
 * Tone discipline:
 *   - second-person or third-person observation only
 *   - never imperative, never marketing register
 *   - no LongPlay self-reference
 *   - no productivity / engagement framing
 *   - literary > clever
 */

import type { RitualPhase, RitualPhaseInfo } from './types'

type PhaseDefinition = Omit<RitualPhaseInfo, 'day' | 'dayOfWeek'>

export const PHASE_DEFINITIONS: Record<RitualPhase, PhaseDefinition> = {
  arrival: {
    phase: 'arrival',
    title: 'Arrival',
    ritual: 'Spend one uninterrupted listen with the record.',
    observation: 'Mondays are openings. The first impression is the truest one.',
    emotionalTone: 'anticipatory',
    listeningBehavior: 'first-listen',
    atmosphereClass: 'ritual-arrival',
    spacingRhythm: 'open',
  },

  'first-impressions': {
    phase: 'first-impressions',
    title: 'First Impressions',
    ritual: 'Hear something you noticed yesterday more clearly today.',
    observation: 'Tuesdays are for instinct. Trust what surfaces.',
    emotionalTone: 'instinctive',
    listeningBehavior: 'tonal-discovery',
    atmosphereClass: 'ritual-first-impressions',
    spacingRhythm: 'open',
  },

  'difficult-listening': {
    phase: 'difficult-listening',
    title: 'Difficult Listening',
    ritual: 'Return to the part you wanted to skip.',
    observation: 'The middle of the week is for patience. Difficult tracks reward returning.',
    emotionalTone: 'introspective',
    listeningBehavior: 'deep-attention',
    atmosphereClass: 'ritual-difficult-listening',
    spacingRhythm: 'dense',
  },

  reflection: {
    phase: 'reflection',
    title: 'Reflection',
    ritual: 'Write what the record is asking of you.',
    observation: 'Thursdays are for slow notes. The album begins to make sense.',
    emotionalTone: 'interpretive',
    listeningBehavior: 'meaning-making',
    atmosphereClass: 'ritual-reflection',
    spacingRhythm: 'flowing',
  },

  synthesis: {
    phase: 'synthesis',
    title: 'Synthesis',
    ritual: 'Let the album speak as one piece.',
    observation: 'Fridays are for the whole record. Themes return.',
    emotionalTone: 'consolidating',
    listeningBehavior: 'whole-album',
    atmosphereClass: 'ritual-synthesis',
    spacingRhythm: 'flowing',
  },

  'carry-forward': {
    phase: 'carry-forward',
    title: 'Carry Forward',
    ritual: 'Notice what stayed with you.',
    observation: 'Weekends are for residue. The album becomes memory.',
    emotionalTone: 'archival',
    listeningBehavior: 'memory',
    atmosphereClass: 'ritual-carry-forward',
    spacingRhythm: 'open',
  },
}
