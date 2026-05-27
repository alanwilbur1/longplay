/**
 * ============================================================
 * ⚠ DOCUMENTATION-ONLY MODULE — NOT IMPORTED BY PRODUCTION CODE
 * ============================================================
 *
 * Phase 6A.14 type-drift audit: nothing in /app, /components, or
 * /lib references this file. The exports here are an architectural
 * design document expressed as TypeScript, NOT the live type
 * surface. Changes here do NOT affect any compiled output.
 *
 * The LIVE Room interface that the room screens consume lives in:
 *   lib/rooms.ts          (Room, ARCHETYPES catalog)
 *   lib/data/rooms.ts     (DB adapter — adapts the Room shape from
 *                          rooms / cycles / albums Supabase tables)
 *
 * If you need to change a shape that the app actually uses, edit
 * lib/rooms.ts and lib/data/rooms.ts. Editing this file changes
 * nothing.
 *
 * Future cleanup option (deferred): collapse this file's stable
 * design content into a single .md document under /docs, then
 * delete this file. Out of scope for the durability hardening pass
 * — too aggressive a move for one phase.
 *
 * ============================================================
 * LONGPLAY CANONICAL PRODUCT ARCHITECTURE (design notes)
 * ============================================================
 *
 * LongPlay is NOT a streaming app.
 * LongPlay IS:
 * - a longitudinal listening identity platform
 * - a ritualized cultural product
 * - a time-based listening system
 * - an emotional archive
 * - a room-based listening culture ecosystem
 * 
 * This file defines the canonical object model for the entire platform.
 * All other lib files should reference these types.
 * 
 * Architecture Principles:
 * 1. Identity evolves over time (mutable current state, immutable snapshots)
 * 2. Rooms are cultures, not categories
 * 3. Cycles are ritual units, not playlist episodes
 * 4. Annotations are emotional artifacts, not comments
 * 5. Memory preservation is core infrastructure
 * 6. AI interpretation serves emotional intelligence, not engagement
 * 
 * ============================================================
 */

// ============================================================
// 1. USER — The listener's account and core identity anchor
// ============================================================
/**
 * USER
 * 
 * Purpose: The authenticated account with streaming connections and preferences
 * Lifecycle: Created on signup, persists indefinitely
 * Ownership: Self-owned
 * Mutability: Core profile is mutable; connected services can be added/removed
 * Archival: Never deleted; can be deactivated
 * 
 * Note: User is SEPARATE from IdentityProfile.
 * User = account/auth/preferences
 * IdentityProfile = who they are as a listener
 */
export interface User {
  id: string
  
  // Authentication
  email: string
  displayName: string
  avatar?: string
  
  // Account status
  createdAt: string // ISO date
  lastActiveAt: string
  onboardingCompleted: boolean
  onboardingCompletedAt?: string
  
  // Streaming connections (OAuth tokens stored separately)
  connectedServices: StreamingConnection[]
  primaryService?: StreamingServiceType
  
  // Membership
  membership: UserMembership
  
  // Preferences
  preferences: UserPreferences
  
  // Notification settings
  notificationSettings: NotificationSettings
}

export interface UserPreferences {
  // Listening preferences
  defaultListeningTime: 'morning' | 'afternoon' | 'evening' | 'night' | 'late-night'
  preferredAnnotationPrivacy: 'private' | 'room-only' | 'public'
  
  // Display preferences
  theme: 'dark' | 'after-midnight' | 'dawn'
  grainIntensity: 'subtle' | 'medium' | 'pronounced'
  
  // Notification cadence
  weeklyDigest: boolean
  cycleReminders: boolean
  resurfacedMemories: boolean
}

export interface NotificationSettings {
  email: {
    weeklyDigest: boolean
    newCycleStart: boolean
    curatorNoteRelease: boolean
    yearInReview: boolean
    resurfacedMemories: boolean
  }
  push: {
    cyclePhaseChange: boolean
    discussionHighlight: boolean
  }
}

// ============================================================
// 2. STREAMING CONNECTION — External service links
// ============================================================
export type StreamingServiceType = 
  | 'spotify' 
  | 'apple-music' 
  | 'tidal' 
  | 'youtube-music' 
  | 'deezer'
  | 'qobuz'
  | 'bandcamp'

export interface StreamingConnection {
  id: string
  userId: string
  service: StreamingServiceType
  
  // Connection status
  connectedAt: string
  lastSyncAt: string
  syncStatus: 'active' | 'error' | 'disconnected'
  
  // Permissions granted
  permissions: ('listening-history' | 'library' | 'playback')[]
  
  // Service-specific user ID (for linking)
  externalUserId?: string
}

// ============================================================
// 3. MEMBERSHIP — Tier and entitlements
// ============================================================
export type MembershipTier = 'explorer' | 'member' | 'patron'

export interface UserMembership {
  tier: MembershipTier
  
  // Billing
  status: 'active' | 'past-due' | 'canceled' | 'free'
  billingCycleStart?: string
  billingCycleEnd?: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  
  // History
  memberSince: string
  tierHistory: MembershipTierChange[]
  
  // Usage (for limits)
  annotationsThisCycle: number
  savedMomentsTotal: number
}

export interface MembershipTierChange {
  fromTier: MembershipTier
  toTier: MembershipTier
  changedAt: string
  reason?: 'upgrade' | 'downgrade' | 'cancellation' | 'reactivation'
}

// ============================================================
// 4. IDENTITY PROFILE — Current listening identity (MUTABLE)
// ============================================================
/**
 * IDENTITY PROFILE
 * 
 * Purpose: The listener's CURRENT evolving identity
 * Lifecycle: Created after onboarding, updated continuously
 * Ownership: Belongs to User
 * Mutability: MUTABLE — this is the living identity
 * Archival: Snapshots are taken and frozen separately
 * 
 * This is SEPARATE from IdentitySnapshot (frozen historical states)
 */
export interface IdentityProfile {
  id: string
  userId: string
  
  // Core archetype (evolves over time)
  currentArchetype: Archetype
  archetypeConfidence: number // 0-100
  archetypeLastUpdated: string
  
  // Emotional dimensions (the listener's tendencies)
  emotionalDimensions: EmotionalDimensions
  
  // Sonic dimensions (the listener's sonic preferences)
  sonicDimensions: SonicDimensions
  
  // Behavioral dimensions (how they listen)
  behavioralDimensions: BehavioralDimensions
  
  // AI-generated content (regenerated periodically)
  tastePortrait: TastePortrait
  editorialDescription: string // 2-3 paragraphs
  
  // Room affinities (where they belong)
  roomAffinities: RoomAffinity[]
  primaryRoom?: string // Room slug
  
  // Evolution tracking
  lastMajorShift?: IdentityShift
  shiftsThisYear: number
  
  // Timestamps
  createdAt: string
  lastUpdatedAt: string
  lastAIRefreshAt: string
}

export interface Archetype {
  id: string
  name: string // e.g., "The Midnight Archivist"
  tagline: string // e.g., "Collector of nocturnal moments"
  description: string // 2-3 sentences
  emotionalCore: string[]
  sonicSignatures: string[]
  associatedRooms: string[] // Room slugs
}

export interface EmotionalDimensions {
  // Each dimension is 0-100
  melancholy: number      // hopeful ↔ melancholic
  intimacy: number        // expansive ↔ intimate  
  transcendence: number   // grounded ↔ transcendent
  ambiguity: number       // direct ↔ ambiguous
  nostalgia: number       // present-focused ↔ nostalgic
  catharsis: number       // restrained ↔ cathartic
}

export interface SonicDimensions {
  warmth: number          // cold ↔ warm
  density: number         // sparse ↔ dense
  organicDigital: number  // organic ↔ synthetic
  pacing: number          // restrained ↔ propulsive
  texture: number         // smooth ↔ textured
  atmosphere: number      // dry ↔ atmospheric
}

export interface BehavioralDimensions {
  nocturnal: number       // daytime ↔ after-midnight
  immersive: number       // casual ↔ deep-listening
  archival: number        // discovery-focused ↔ return-to-favorites
  solitary: number        // social ↔ solitary
  patient: number         // impatient ↔ patient
  annotative: number      // passive ↔ reflective
}

export interface TastePortrait {
  // AI-generated literary description
  essay: string // 3-4 paragraphs
  
  // Key phrases/themes extracted
  keyPhrases: string[]
  
  // Sample albums that exemplify this taste
  exemplarAlbums: string[] // Album IDs
  
  // Generation metadata
  generatedAt: string
  modelVersion: string
  inputCycles: number // How many cycles informed this
}

export interface IdentityShift {
  id: string
  fromArchetype: string
  toArchetype: string
  shiftedAt: string
  trigger: 'cycle' | 'time' | 'manual'
  triggerCycleId?: string
  explanation: string // AI-generated
}

// ============================================================
// 5. IDENTITY SNAPSHOT — Frozen historical states (IMMUTABLE)
// ============================================================
/**
 * IDENTITY SNAPSHOT
 * 
 * Purpose: Frozen point-in-time capture of identity
 * Lifecycle: Created automatically (quarterly, yearly, on major shifts)
 * Ownership: Belongs to User
 * Mutability: IMMUTABLE — never modified after creation
 * Archival: Preserved indefinitely as emotional records
 * 
 * Critical for: archive, evolution timeline, year-in-review
 */
export interface IdentitySnapshot {
  id: string
  userId: string
  
  // Snapshot metadata
  snapshotType: 'quarterly' | 'yearly' | 'archetype-shift' | 'manual'
  snapshotDate: string
  snapshotLabel: string // e.g., "Q1 2026", "Year-End 2026"
  
  // Frozen identity state
  archetype: Archetype
  emotionalDimensions: EmotionalDimensions
  sonicDimensions: SonicDimensions
  behavioralDimensions: BehavioralDimensions
  
  // Frozen AI content
  tastePortrait: TastePortrait
  editorialDescription: string
  
  // Frozen room affinities
  roomAffinities: RoomAffinity[]
  primaryRoom?: string
  
  // Context at time of snapshot
  cyclesCompletedTotal: number
  annotationsTotal: number
  roomsJoined: string[]
  
  // If archetype shift
  shiftFrom?: string
  shiftTo?: string
  shiftExplanation?: string
}

// ============================================================
// 6. ROOM — Listening culture/environment
// ============================================================
/**
 * ROOM
 * 
 * Purpose: A listening culture/philosophy/environment
 * Lifecycle: Created by curators/platform, persists indefinitely
 * Ownership: Platform-owned, curator-managed
 * Mutability: Core identity stable; cycles rotate weekly
 * Archival: Past cycles preserved; room itself persists
 * 
 * Rooms are NOT social groups.
 * Rooms ARE listening philosophies with synchronized rituals.
 */
export type RoomType = 'editorial' | 'genre' | 'creator' | 'private'
export type RoomVisibility = 'public' | 'member' | 'patron' | 'invite-only'

export interface Room {
  id: string
  slug: string
  name: string
  type: RoomType
  visibility: RoomVisibility
  
  // Cultural identity
  description: string
  tagline?: string
  atmosphere: string
  manifesto: string // 2-3 paragraphs
  
  // Curator
  curatorId: string
  
  // Visual identity
  aesthetics: RoomAesthetics
  
  // Listening philosophy
  listeningRitual: string
  whatWeLookFor: string[]
  whatWeAvoid: string[]
  
  // Associated archetypes
  associatedArchetypes: string[] // Archetype names
  
  // Seasonal states
  seasonalMoods: SeasonalMoods
  currentSeason?: Season
  
  // Current cycle
  currentCycleId?: string
  
  // Stats (soft, not gamified). Phase 6A.13: nullable — fabricated
  // values stripped; renderers skip surfaces when the field is empty.
  memberCountLabel: string | null
  atmosphereNotes: string[]
  
  // Related rooms
  relatedRooms: string[] // Room slugs
  
  // Timestamps
  createdAt: string
  lastCycleAt: string
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

export interface SeasonalMoods {
  winter: { description: string; moodShift: string }
  spring: { description: string; moodShift: string }
  summer: { description: string; moodShift: string }
  autumn: { description: string; moodShift: string }
}

export interface RoomAesthetics {
  themeClass: string
  primaryAccent: string
  backgroundGradient: string
  borderTint: string
  typographyStyle: 'intimate' | 'expansive' | 'structured' | 'organic' | 'restrained'
  transitionSpeed: 'slow' | 'medium' | 'deliberate'
  grainOpacity: number
  glowEffect?: string
  spacingRhythm: 'tight' | 'breathable' | 'expansive'
}

// ============================================================
// 7. ROOM AFFINITY — User's relationship to a room
// ============================================================
/**
 * ROOM AFFINITY
 * 
 * Purpose: Tracks a user's evolving relationship to a room
 * Lifecycle: Created when affinity is detected, evolves over time
 * Ownership: Belongs to User, references Room
 * Mutability: MUTABLE — resonance and drift change
 * Archival: Historical affinity states are captured in IdentitySnapshots
 */
export interface RoomAffinity {
  id: string
  userId: string
  roomSlug: string
  roomName: string
  
  // Affinity strength (NOT percentage — emotional resonance)
  resonance: 'deep' | 'strong' | 'emerging' | 'peripheral'
  
  // Why this room resonates (AI-generated editorial language)
  resonanceExplanation: string
  
  // Specific threads that connect
  emotionalThreads: string[]
  sonicPatterns: string[]
  
  // 70/30 split
  affinityType: 'resonance' | 'expansion'
  
  // Temporal drift
  trend: 'drifting-toward' | 'stable' | 'drifting-away' | 'returning'
  trendNote?: string
  
  // Engagement
  cyclesParticipated: number
  lastCycleAt?: string
  annotationsInRoom: number
  
  // Timestamps
  firstAffinityAt: string
  lastUpdatedAt: string
}

// ============================================================
// 8. CLUB MEMBERSHIP — User's membership in a room
// ============================================================
/**
 * CLUB MEMBERSHIP
 * 
 * Purpose: Explicit room membership (joined vs. affinity)
 * Lifecycle: Created when user joins, persists until leaving
 * Ownership: User-owned
 * Mutability: Status can change
 * Archival: Preserved in user history
 */
export interface ClubMembership {
  id: string
  userId: string
  roomId: string
  
  // Status
  status: 'active' | 'paused' | 'left'
  joinedAt: string
  leftAt?: string
  
  // Engagement
  cyclesCompleted: number
  annotationsCount: number
  discussionContributions: number
  
  // Role (for future curator features)
  role: 'member' | 'curator' | 'founding-member'
}

// ============================================================
// 9. CURATOR — Room curator identity
// ============================================================
/**
 * CURATOR
 * 
 * Purpose: The curatorial voice behind a room
 * Lifecycle: Created when curator onboards
 * Ownership: Platform-managed
 * Mutability: Profile can be updated
 * Archival: Curator essays are preserved
 */
export interface Curator {
  id: string
  userId?: string // If they have a LongPlay account
  
  // Identity
  name: string
  role: string // e.g., "Founding Curator, The Nocturnal Room"
  avatar?: string
  
  // Voice
  listeningPhilosophy: string
  curatorStatement: string
  
  // Taste markers
  favoriteRecordIds: string[] // Album IDs
  currentObsessions: string[]
  recurringThemes: string[]
  
  // Credentials
  credentials?: string
  publications?: string[]
  
  // Rooms curated
  roomIds: string[]
  
  // Timestamps
  createdAt: string
  lastActiveAt: string
}

// ============================================================
// 10. CURATOR ESSAY — Written content by curators
// ============================================================
/**
 * CURATOR ESSAY
 * 
 * Purpose: Long-form curator writing (cycle notes, seasonal essays)
 * Lifecycle: Created for each cycle, preserved indefinitely
 * Ownership: Curator-owned, room-associated
 * Mutability: IMMUTABLE after publication
 * Archival: Core archival content
 */
export interface CuratorEssay {
  id: string
  curatorId: string
  roomId: string
  cycleId?: string
  
  // Content
  title: string
  excerpt: string // First paragraph or custom excerpt
  fullText: string
  
  // Type
  type: 'cycle-note' | 'seasonal-essay' | 'retrospective' | 'introduction'
  
  // Publishing
  publishedAt: string
  isPublished: boolean
  
  // Access
  visibleTo: 'public' | 'member' | 'patron'
}

// ============================================================
// 11. CYCLE — Weekly listening ritual unit
// ============================================================
/**
 * CYCLE
 * 
 * Purpose: A single week-long synchronized listening experience
 * Lifecycle: Created before week starts, progresses through phases, archived after
 * Ownership: Room-owned
 * Mutability: Phase changes during week; IMMUTABLE after completion
 * Archival: Preserved indefinitely with all user engagement data
 */
export type CyclePhase = 
  | 'upcoming'      // Before Monday
  | 'arrival'       // Monday
  | 'private'       // Tuesday-Thursday
  | 'discussion'    // Friday-Saturday
  | 'curators-note' // Sunday
  | 'archived'      // After Sunday

export interface Cycle {
  id: string
  roomId: string
  albumId: string
  
  // Temporal
  weekNumber: number
  year: number
  startDate: string // Monday
  endDate: string   // Sunday
  seasonLabel: string // e.g., "Winter 2026"
  
  // Phase
  currentPhase: CyclePhase
  phaseChangedAt: string
  
  // Curator content
  curatorEssayId?: string
  
  // Prompts (3 per cycle)
  prompts: CyclePrompt[]
  
  // Emotional/sonic framing
  emotionalThemes: string[]
  sonicThemes: string[]
  
  // AI-generated summary (created after cycle ends)
  cycleSummary?: CycleSummary
  
  // Engagement stats
  participantCount: number
  annotationCount: number
  discussionContributions: number
  
  // Timestamps
  createdAt: string
  archivedAt?: string
}

export interface CyclePrompt {
  id: string
  question: string
  hint: string
  order: number
  releasePhase: CyclePhase // When this prompt becomes visible
}

export interface CycleSummary {
  // AI-generated after cycle ends
  narrativeSummary: string // 2-3 paragraphs
  collectiveInsights: string[]
  emergentThemes: string[]
  standoutAnnotations: string[] // Annotation IDs
  
  // Generation metadata
  generatedAt: string
  modelVersion: string
}

// ============================================================
// 12. ALBUM — Canonical album representation
// ============================================================
/**
 * ALBUM
 * 
 * Purpose: Platform-canonical album data (NOT Spotify-coupled)
 * Lifecycle: Created when first referenced, enriched over time
 * Ownership: Platform-owned
 * Mutability: Metadata can be corrected/enriched
 * Archival: Persists indefinitely
 */
export interface Album {
  id: string
  
  // Core metadata
  title: string
  artist: string
  year: string
  
  // Artwork
  cover: string
  fallbackGradient: string
  artworkSource: 'spotify' | 'apple-music' | 'musicbrainz' | 'manual'
  artworkVerifiedAt?: string
  
  // Editorial content (LongPlay-authored)
  description?: string
  editorialNote?: string
  
  // Emotional/sonic dimensions
  emotionalTags: string[]
  sonicTags: string[]
  roomAssociations: string[] // Room slugs
  
  // External IDs (for linking, NOT dependency)
  spotifyId?: string
  appleMusicId?: string
  tidalId?: string
  musicBrainzId?: string
  discogsId?: string
  
  // Streaming URLs
  streamingUrls: StreamingUrls
  
  // Platform stats
  cyclesFeaturingThis: number
  totalAnnotations: number
  
  // Timestamps
  createdAt: string
  lastUpdatedAt: string
}

export interface StreamingUrls {
  spotify?: string
  appleMusic?: string
  tidal?: string
  youtube?: string
  bandcamp?: string
  qobuz?: string
}

// ============================================================
// 13. ANNOTATION — User's emotional reflections
// ============================================================
/**
 * ANNOTATION
 * 
 * Purpose: User's emotional/reflective notes on music
 * Lifecycle: Created during listening, preserved indefinitely
 * Ownership: User-owned
 * Mutability: Content can be edited; deletion soft-deletes
 * Archival: Core archival content — never truly deleted
 * 
 * Annotations are NOT comments.
 * Annotations ARE emotional artifacts, personal reflections.
 */
export interface Annotation {
  id: string
  userId: string
  
  // What it's about
  albumId: string
  cycleId?: string
  roomId?: string
  
  // Location in album
  trackNumber?: number
  trackTitle?: string
  timestamp?: string // e.g., "2:47"
  
  // Content
  content: string
  emotionTag?: string // e.g., "Melancholy", "Recognition"
  
  // Privacy
  visibility: 'private' | 'room' | 'public'
  
  // Engagement (soft, not social)
  resonanceCount: number // Others who marked "this resonates"
  
  // Cycle context
  cyclePhase?: CyclePhase
  promptId?: string // If responding to a prompt
  
  // Metadata
  createdAt: string
  updatedAt?: string
  deletedAt?: string // Soft delete
  
  // Resurfacing
  lastResurfacedAt?: string
  resurfaceCount: number
}

// ============================================================
// 14. LISTENING MOMENT — Specific saved passages
// ============================================================
/**
 * LISTENING MOMENT
 * 
 * Purpose: Specific timestamped moments the user wants to preserve
 * Lifecycle: Created when saved, preserved indefinitely
 * Ownership: User-owned
 * Mutability: Can be edited/removed
 * Archival: Preserved as part of emotional record
 */
export interface ListeningMoment {
  id: string
  userId: string
  albumId: string
  
  // Location
  trackNumber: number
  trackTitle: string
  timestamp: string // e.g., "2:47"
  endTimestamp?: string // For ranges
  
  // Context
  cycleId?: string
  roomId?: string
  annotationId?: string
  
  // Emotional tag
  emotionTag?: string
  note?: string // Brief note
  
  // Timestamps
  savedAt: string
  lastReturnedAt?: string
  returnCount: number
}

// ============================================================
// 15. LISTENING ERA — Longitudinal emotional period
// ============================================================
/**
 * LISTENING ERA
 * 
 * Purpose: AI-identified longitudinal emotional periods in listening
 * Lifecycle: Generated retrospectively, preserved indefinitely
 * Ownership: User-owned
 * Mutability: IMMUTABLE after generation
 * Archival: Core identity artifact
 * 
 * Examples: "The Nocturnal Winter", "The Ambient Drift Era"
 */
export interface ListeningEra {
  id: string
  userId: string
  
  // Identity
  name: string // e.g., "The Nocturnal Winter"
  timeRange: string // e.g., "January — February 2026"
  dateStart: string
  dateEnd: string
  
  // Narrative
  description: string // AI-generated 2-3 paragraph narrative
  
  // Themes
  dominantEmotionalThemes: string[]
  dominantSonicThemes: string[]
  
  // Archetype journey
  archetypeAtStart: string
  archetypeAtEnd: string
  
  // Content
  cycleIds: string[]
  formativeAlbumId?: string // The record that defined this era
  keyAnnotationIds: string[]
  
  // Stats
  totalCycles: number
  totalAnnotations: number
  
  // Generation
  generatedAt: string
  modelVersion: string
}

// ============================================================
// 16. COMPATIBILITY READING — Listening compatibility
// ============================================================
/**
 * COMPATIBILITY READING
 * 
 * Purpose: AI-generated comparison between two listeners
 * Lifecycle: Generated on request, cached
 * Ownership: Shared between two users
 * Mutability: Regenerated periodically
 * Archival: Can be saved/exported
 */
export interface CompatibilityReading {
  id: string
  userAId: string
  userBId: string
  
  // Overall reading
  compatibilityLabel: string // e.g., "Midnight Parallel"
  narrativeReading: string // 2-3 paragraph literary comparison
  
  // Dimensions
  emotionalOverlap: number // 0-100
  sonicOverlap: number
  behavioralOverlap: number
  
  // Specific insights
  sharedThreads: string[] // What they share
  complementaryDifferences: string[] // How they differ productively
  potentialTension: string[] // Where they might diverge
  
  // Shared content
  sharedRooms: string[]
  sharedAlbumAffinities: string[]
  
  // Generation
  generatedAt: string
  expiresAt: string // For cache invalidation
  modelVersion: string
}

// ============================================================
// 17. REFLECTION — User's long-form reflections
// ============================================================
/**
 * REFLECTION
 * 
 * Purpose: User's longer-form writing about their listening
 * Lifecycle: Created by user, preserved indefinitely
 * Ownership: User-owned
 * Mutability: Can be edited
 * Archival: Core personal content
 */
export interface Reflection {
  id: string
  userId: string
  
  // What it's about
  type: 'era' | 'cycle' | 'album' | 'general'
  eraId?: string
  cycleId?: string
  albumId?: string
  
  // Content
  title?: string
  content: string // Markdown supported
  
  // Privacy
  visibility: 'private' | 'public'
  
  // Timestamps
  createdAt: string
  updatedAt?: string
}

// ============================================================
// 18. SAVED PASSAGE — Curated excerpts
// ============================================================
/**
 * SAVED PASSAGE
 * 
 * Purpose: User saves an annotation, curator note, or AI text
 * Lifecycle: Created when saved, preserved indefinitely
 * Ownership: User-owned
 * Mutability: Can be removed
 * Archival: Preserved
 */
export interface SavedPassage {
  id: string
  userId: string
  
  // Source
  sourceType: 'annotation' | 'curator-essay' | 'ai-generated' | 'external'
  sourceId?: string // If internal
  sourceUrl?: string // If external
  
  // Content (stored for permanence)
  content: string
  attribution: string
  
  // Context
  albumId?: string
  roomId?: string
  
  // Timestamps
  savedAt: string
}

// ============================================================
// 19. LISTENING ARTIFACT — Exportable identity artifacts
// ============================================================
/**
 * LISTENING ARTIFACT
 * 
 * Purpose: Generated visual/textual artifacts for export/sharing
 * Lifecycle: Generated on request, cached/stored
 * Ownership: User-owned
 * Mutability: Can be regenerated
 * Archival: Stored for re-download
 */
export type ArtifactType = 
  | 'archetype-card'
  | 'taste-portrait'
  | 'year-in-review'
  | 'listening-era'
  | 'cycle-summary'
  | 'emotional-map'
  | 'room-journey'

export interface ListeningArtifact {
  id: string
  userId: string
  
  // Type
  type: ArtifactType
  
  // Content reference
  sourceType: 'identity-snapshot' | 'era' | 'cycle' | 'year'
  sourceId: string
  
  // Generated content
  title: string
  previewText: string
  
  // Files (stored in blob storage)
  formats: ArtifactFormat[]
  
  // Generation
  generatedAt: string
  expiresAt?: string // For regeneration
}

export interface ArtifactFormat {
  format: 'png' | 'pdf' | 'jpg' | 'svg'
  variant: 'portrait' | 'story' | 'wallpaper' | 'poster' | 'square'
  url: string
  width: number
  height: number
}

// ============================================================
// 20. EVENT — Platform events and notifications
// ============================================================
/**
 * EVENT
 * 
 * Purpose: System events that trigger notifications/actions
 * Lifecycle: Created when event occurs, processed, archived
 * Ownership: Platform-owned
 * Mutability: Status changes
 * Archival: Preserved for audit
 */
export type EventType =
  | 'cycle-start'
  | 'cycle-phase-change'
  | 'cycle-end'
  | 'curator-note-release'
  | 'archetype-shift'
  | 'room-drift'
  | 'memory-resurfaced'
  | 'year-in-review-ready'
  | 'milestone-reached'
  | 'compatibility-generated'

export interface PlatformEvent {
  id: string
  type: EventType
  
  // Target
  userId?: string // If user-specific
  roomId?: string
  cycleId?: string
  
  // Payload
  payload: Record<string, unknown>
  
  // Processing
  status: 'pending' | 'processed' | 'failed'
  processedAt?: string
  
  // Notification
  notificationSent: boolean
  notificationSentAt?: string
  
  // Timestamps
  occurredAt: string
  createdAt: string
}

// ============================================================
// 21. AI GENERATION METADATA — Tracking AI content
// ============================================================
/**
 * AI content should be clearly tracked:
 * - What is generated once (onboarding archetype)
 * - What is regenerated periodically (taste portrait)
 * - What is frozen permanently (year-in-review)
 * - What is cached (compatibility readings)
 */
export type AIContentType =
  | 'archetype-assignment'
  | 'taste-portrait'
  | 'era-narrative'
  | 'cycle-summary'
  | 'year-in-review'
  | 'compatibility-reading'
  | 'room-alignment'
  | 'identity-shift-explanation'

export interface AIGeneration {
  id: string
  userId: string
  contentType: AIContentType
  
  // Output reference
  outputId: string // ID of the generated content
  
  // Input context
  inputCycleIds: string[]
  inputAnnotationCount: number
  inputTimeRange?: string
  
  // Model info
  modelName: string
  modelVersion: string
  promptVersion: string
  
  // Quality
  confidence?: number
  
  // Lifecycle
  generatedAt: string
  expiresAt?: string // When to regenerate
  regenerationTrigger?: 'time' | 'data-change' | 'manual'
  
  // Mutability
  isFrozen: boolean // If true, never regenerate
  frozenAt?: string
  frozenReason?: 'year-end' | 'archetype-shift' | 'user-request'
}

// ============================================================
// 22. IMMUTABILITY RULES — What must never change
// ============================================================
/**
 * CRITICAL: These objects are IMMUTABLE once created:
 * 
 * 1. IdentitySnapshot — Historical identity states
 * 2. Archived Cycle summaries — Past cycle content
 * 3. Year-in-Review essays — Annual reflections
 * 4. ListeningEra narratives — Era descriptions
 * 5. CuratorEssay (after publication) — Curator writing
 * 
 * These become PRESERVED EMOTIONAL RECORDS.
 * They must NEVER be overwritten or regenerated.
 */
export const IMMUTABLE_TYPES = [
  'IdentitySnapshot',
  'CycleSummary',
  'YearInReview',
  'ListeningEra',
  'CuratorEssay',
] as const

// ============================================================
// 23. PRODUCT STATE FLOW
// ============================================================
/**
 * The core LongPlay loop:
 * 
 * ONBOARDING
 * → Initial archetype assignment
 * → Streaming connection
 * → First room affinities
 * 
 * WEEKLY CYCLE
 * → Join room cycle
 * → Listen through week
 * → Annotate moments
 * → Participate in discussion
 * → Receive curator note
 * 
 * IDENTITY EVOLUTION
 * → Dimensions update after each cycle
 * → Archetype may shift
 * → Room affinities drift
 * 
 * ARCHIVE ACCUMULATION
 * → Cycles preserved
 * → Annotations preserved
 * → Eras generated
 * 
 * ARTIFACT GENERATION
 * → Taste portraits
 * → Year-in-review
 * → Shareable cards
 * 
 * LONG-TERM RETENTION
 * → Memories resurface
 * → Identity timeline grows
 * → Archive becomes richer
 */

// ============================================================
// TYPE EXPORTS
// ============================================================
export type {
  User,
  UserPreferences,
  NotificationSettings,
  StreamingConnection,
  StreamingServiceType,
  MembershipTier,
  UserMembership,
  MembershipTierChange,
  IdentityProfile,
  Archetype,
  EmotionalDimensions,
  SonicDimensions,
  BehavioralDimensions,
  TastePortrait,
  IdentityShift,
  IdentitySnapshot,
  Room,
  RoomType,
  RoomVisibility,
  Season,
  SeasonalMoods,
  RoomAesthetics,
  RoomAffinity,
  ClubMembership,
  Curator,
  CuratorEssay,
  Cycle,
  CyclePhase,
  CyclePrompt,
  CycleSummary,
  Album,
  StreamingUrls,
  Annotation,
  ListeningMoment,
  ListeningEra,
  CompatibilityReading,
  Reflection,
  SavedPassage,
  ListeningArtifact,
  ArtifactType,
  ArtifactFormat,
  PlatformEvent,
  EventType,
  AIGeneration,
  AIContentType,
}
