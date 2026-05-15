/**
 * lib/rooms-ui.ts
 *
 * UI-only helpers for room display. Re-exports getRoomSeasonalMood from the
 * canonical static definition so callers that only need the seasonal mood
 * helper don't have to import the entire lib/rooms module.
 */
export { getRoomSeasonalMood } from './rooms'
