/**
 * ============================================================
 * LONGPLAY BACKEND ARCHITECTURE & TECHNICAL RECOMMENDATIONS
 * ============================================================
 * 
 * This file contains architectural decisions, system design patterns,
 * and technical recommendations for building the LongPlay platform.
 * 
 * LongPlay is a longitudinal listening identity platform.
 * The architecture must support:
 * - Years of listening history
 * - Identity evolution over time
 * - Synchronized room rituals
 * - Emotional memory preservation
 * - AI-powered interpretation
 * 
 * ============================================================
 */

// ============================================================
// 1. DATABASE ARCHITECTURE
// ============================================================
/**
 * RECOMMENDED: Supabase (PostgreSQL)
 * 
 * WHY SUPABASE:
 * - Native auth system (Supabase Auth)
 * - Real-time subscriptions for live cycle phase updates
 * - Row Level Security for user data isolation
 * - Built-in storage for artifacts/images
 * - PostgreSQL's JSONB for flexible dimensions storage
 * - Full-text search for annotations
 * - pgvector extension for AI embeddings (future)
 * 
 * SCHEMA ORGANIZATION:
 * 
 * Core Tables:
 * - users (auth managed by Supabase)
 * - identity_profiles (current identity state)
 * - identity_snapshots (immutable historical states)
 * - rooms
 * - room_affinities
 * - club_memberships
 * - curators
 * - curator_essays
 * - cycles
 * - albums
 * - annotations
 * - listening_moments
 * - listening_eras
 * - reflections
 * - saved_passages
 * - artifacts
 * - events
 * - ai_generations
 * 
 * Relationship Tables:
 * - user_streaming_connections
 * - user_memberships (billing)
 * - cycle_prompts
 * - album_streaming_urls
 */
export const DATABASE_SCHEMA_GUIDELINES = {
  // Use UUID for all IDs
  idGeneration: 'uuid_generate_v4()',
  
  // Timestamps on every table
  timestamps: {
    createdAt: 'timestamp with time zone default now()',
    updatedAt: 'timestamp with time zone',
    deletedAt: 'timestamp with time zone', // Soft delete
  },
  
  // JSONB for flexible dimensional data
  dimensionalData: 'jsonb',
  
  // Enum types for constrained values
  enums: [
    'membership_tier',
    'room_type',
    'room_visibility',
    'cycle_phase',
    'artifact_type',
    'event_type',
    'ai_content_type',
  ],
}

// ============================================================
// 2. ROW LEVEL SECURITY (RLS) POLICIES
// ============================================================
/**
 * RLS is CRITICAL for LongPlay.
 * User data must be strictly isolated.
 * Annotations marked 'private' must never leak.
 */
export const RLS_POLICIES = {
  // Users can only read/write their own data
  userOwnedTables: [
    'identity_profiles',
    'identity_snapshots',
    'room_affinities',
    'club_memberships',
    'annotations',
    'listening_moments',
    'listening_eras',
    'reflections',
    'saved_passages',
    'artifacts',
  ],
  
  // Public read, admin write
  platformTables: [
    'rooms',
    'cycles',
    'albums',
    'curators',
    'curator_essays',
  ],
  
  // Annotation visibility rules
  annotationRules: `
    -- Private annotations: only owner
    (visibility = 'private' AND user_id = auth.uid())
    OR
    -- Room annotations: owner + room members
    (visibility = 'room' AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM club_memberships
        WHERE user_id = auth.uid()
        AND room_id = annotations.room_id
        AND status = 'active'
      )
    ))
    OR
    -- Public annotations: anyone
    (visibility = 'public')
  `,
}

// ============================================================
// 3. AUTHENTICATION SYSTEM
// ============================================================
/**
 * RECOMMENDED: Supabase Auth
 * 
 * WHY:
 * - Native integration with Supabase database
 * - OAuth providers for streaming services
 * - JWT-based, works with Next.js middleware
 * - Built-in user management
 * 
 * OAUTH PROVIDERS TO IMPLEMENT:
 * - Spotify (for listening history sync)
 * - Apple Music (future)
 * - Google (for general auth)
 * - Email/Magic Link (for non-streaming users)
 * 
 * TOKEN STORAGE:
 * - Streaming service refresh tokens stored encrypted
 * - Use Supabase Vault or encrypted column
 */
export const AUTH_ARCHITECTURE = {
  provider: 'supabase-auth',
  
  sessionManagement: {
    // JWT in httpOnly cookie
    storage: 'httpOnly-cookie',
    
    // Session refresh on each request
    refreshStrategy: 'sliding-window',
    
    // Max session age
    maxAge: '7d',
  },
  
  oauthProviders: [
    {
      name: 'spotify',
      scopes: [
        'user-read-recently-played',
        'user-library-read',
        'user-top-read',
        'streaming', // For playback
      ],
    },
    {
      name: 'google',
      scopes: ['email', 'profile'],
    },
  ],
  
  // Streaming tokens stored separately
  tokenStorage: {
    table: 'user_streaming_connections',
    encryptedColumns: ['access_token', 'refresh_token'],
    refreshSchedule: '1h', // Background refresh
  },
}

// ============================================================
// 4. AI / LLM INFRASTRUCTURE
// ============================================================
/**
 * AI powers several core features:
 * - Archetype assignment
 * - Taste portraits
 * - Era narratives
 * - Cycle summaries
 * - Year-in-review essays
 * - Compatibility readings
 * - Room alignment language
 * 
 * ARCHITECTURE DECISIONS:
 */
export const AI_ARCHITECTURE = {
  // Primary model for editorial generation
  primaryModel: {
    provider: 'openai',
    model: 'gpt-4-turbo', // For nuanced editorial writing
    fallback: 'gpt-3.5-turbo',
  },
  
  // Generation patterns
  generationPatterns: {
    // Generated ONCE on creation
    onceDurableContent: [
      'archetype-assignment', // Initial onboarding
      'year-in-review',       // Annual, then frozen
      'identity-snapshot',    // Frozen after creation
    ],
    
    // Regenerated PERIODICALLY
    periodicRefresh: [
      {
        type: 'taste-portrait',
        schedule: 'after-4-cycles', // Every ~month
        trigger: 'cycle-completion',
      },
      {
        type: 'room-alignment',
        schedule: 'after-2-cycles',
        trigger: 'cycle-completion',
      },
    ],
    
    // Cached with TTL
    cachedContent: [
      {
        type: 'compatibility-reading',
        ttl: '7d',
        invalidateOn: 'archetype-shift',
      },
    ],
    
    // Generated on demand, no cache
    onDemandContent: [
      'cycle-summary', // Generated once per cycle end
    ],
  },
  
  // Prompt versioning
  promptVersioning: {
    // All prompts stored in database/config
    storage: 'database',
    
    // Track which version generated each piece
    tracking: true,
    
    // Allow A/B testing
    variants: true,
  },
  
  // Vector embeddings (future)
  embeddings: {
    // For semantic annotation search
    provider: 'openai',
    model: 'text-embedding-3-small',
    storage: 'supabase-pgvector',
    tables: ['annotations', 'albums'],
  },
}

// ============================================================
// 5. EVENT / SCHEDULING SYSTEM
// ============================================================
/**
 * LongPlay is fundamentally TIME-BASED.
 * Events must fire reliably:
 * - Cycle phase changes (daily)
 * - Curator note releases (Sundays)
 * - Identity updates (weekly)
 * - Memory resurfacing (random/scheduled)
 * - Year-in-review generation (annual)
 */
export const EVENT_ARCHITECTURE = {
  // Event queue
  queue: {
    provider: 'inngest', // Or Trigger.dev, Vercel Cron
    
    // Scheduled events
    schedules: [
      {
        name: 'cycle-phase-change',
        cron: '0 0 * * *', // Daily at midnight
        handler: 'checkCyclePhases',
      },
      {
        name: 'sunday-curator-notes',
        cron: '0 10 * * 0', // Sunday 10am
        handler: 'releaseCuratorNotes',
      },
      {
        name: 'weekly-identity-update',
        cron: '0 4 * * 1', // Monday 4am
        handler: 'updateIdentityProfiles',
      },
      {
        name: 'quarterly-snapshot',
        cron: '0 0 1 1,4,7,10 *', // First of each quarter
        handler: 'generateQuarterlySnapshots',
      },
      {
        name: 'memory-resurfacing',
        cron: '0 18 * * *', // Daily 6pm
        handler: 'resurfaceMemories',
      },
      {
        name: 'year-in-review',
        cron: '0 0 28 12 *', // Dec 28
        handler: 'generateYearInReviews',
      },
    ],
  },
  
  // Event-driven triggers
  triggers: [
    {
      event: 'annotation.created',
      handlers: ['updateRoomAffinity', 'checkAnnotationMilestone'],
    },
    {
      event: 'cycle.completed',
      handlers: ['generateCycleSummary', 'updateIdentityDimensions', 'checkArchetypeShift'],
    },
    {
      event: 'archetype.shifted',
      handlers: ['createIdentitySnapshot', 'notifyUser', 'invalidateCompatibility'],
    },
  ],
  
  // Notification system
  notifications: {
    channels: ['email', 'push'],
    templates: 'database', // Stored in DB for editing
    throttling: true, // Prevent notification fatigue
  },
}

// ============================================================
// 6. CACHING STRATEGY
// ============================================================
/**
 * Different content has different cache needs:
 * - User identity: short cache, frequent updates
 * - Rooms: medium cache, weekly changes
 * - Albums: long cache, rarely changes
 * - AI content: varies by type
 */
export const CACHING_ARCHITECTURE = {
  // Cache layers
  layers: [
    {
      name: 'edge',
      provider: 'vercel-kv', // Or Upstash Redis
      ttl: '5m',
      use: ['public-room-data', 'public-album-data'],
    },
    {
      name: 'application',
      provider: 'react-query', // Or SWR
      staleTime: '30s',
      use: ['user-identity', 'room-affinity'],
    },
  ],
  
  // Invalidation
  invalidation: {
    // User-specific caches invalidate on write
    userCaches: 'write-through',
    
    // Room caches invalidate on cycle change
    roomCaches: 'event-driven',
    
    // Album caches rarely invalidate
    albumCaches: 'time-based-24h',
  },
}

// ============================================================
// 7. STORAGE SYSTEM
// ============================================================
/**
 * Storage needs:
 * - Album artwork (cached from streaming services)
 * - User artifacts (generated images/PDFs)
 * - Curator media (photos, etc.)
 */
export const STORAGE_ARCHITECTURE = {
  provider: 'vercel-blob', // Or Supabase Storage
  
  buckets: [
    {
      name: 'album-artwork',
      access: 'public',
      cacheControl: 'max-age=31536000', // 1 year
    },
    {
      name: 'user-artifacts',
      access: 'private',
      cacheControl: 'max-age=86400', // 1 day
    },
    {
      name: 'curator-media',
      access: 'public',
      cacheControl: 'max-age=604800', // 1 week
    },
  ],
  
  // Image optimization
  optimization: {
    provider: 'vercel-images',
    formats: ['webp', 'avif'],
    sizes: [64, 128, 256, 512, 1024],
  },
}

// ============================================================
// 8. SEARCH ARCHITECTURE
// ============================================================
/**
 * Search needs:
 * - User's own annotations
 * - Public annotations (with privacy)
 * - Albums
 * - Rooms
 */
export const SEARCH_ARCHITECTURE = {
  // Full-text search
  fullText: {
    provider: 'supabase-fts', // PostgreSQL FTS
    tables: ['annotations', 'albums', 'rooms', 'curator_essays'],
  },
  
  // Faceted search
  facets: {
    annotations: ['emotion', 'album', 'room', 'era', 'year'],
    albums: ['artist', 'year', 'emotionalTag', 'room'],
  },
  
  // Semantic search (future)
  semantic: {
    provider: 'supabase-pgvector',
    use: ['annotation-similarity', 'album-recommendations'],
  },
}

// ============================================================
// 9. STREAMING INTEGRATION ARCHITECTURE
// ============================================================
/**
 * LongPlay connects to streaming services but must NOT
 * be coupled to any single service.
 * 
 * The canonical Album object is PLATFORM-OWNED.
 * Streaming IDs are just links for playback/sync.
 */
export const STREAMING_ARCHITECTURE = {
  // Supported services
  services: ['spotify', 'apple-music', 'tidal', 'youtube-music', 'qobuz', 'bandcamp'],
  
  // Primary service for each user
  primaryService: 'user-selected',
  
  // Sync strategy
  sync: {
    // Background sync of listening history
    schedule: 'hourly',
    
    // What to sync
    data: ['recent-plays', 'library-additions'],
    
    // Rate limiting
    rateLimit: 'per-service-limits',
  },
  
  // Album resolution
  albumResolution: {
    // LongPlay has canonical album data
    canonical: true,
    
    // External IDs for linking
    externalIds: ['spotify', 'apple-music', 'musicbrainz', 'discogs'],
    
    // Fallback chain for artwork
    artworkPriority: ['spotify', 'apple-music', 'musicbrainz', 'manual'],
  },
  
  // Playback
  playback: {
    // Deep links to streaming apps
    linkFormat: 'streaming-service-deep-link',
    
    // In-app playback (future)
    embedded: false,
  },
}

// ============================================================
// 10. MODERATION / CULTURAL HEALTH
// ============================================================
/**
 * LongPlay must AVOID:
 * - Performative behavior
 * - Social media toxicity
 * - Engagement farming
 * - Internet-brain dynamics
 * 
 * This is INTENTIONAL PLATFORM ARCHITECTURE.
 */
export const CULTURAL_HEALTH_ARCHITECTURE = {
  // Anti-feed mechanics
  antiFeed: {
    // No infinite scroll
    pagination: 'discrete',
    
    // No algorithmic timeline
    chronological: true,
    
    // No public follower counts
    hiddenMetrics: ['followers', 'likes', 'views'],
    
    // Rate limit annotations
    annotationCooldown: '5m', // Prevent spam
  },
  
  // Pacing
  pacing: {
    // Weekly cycles, not daily
    cycleLength: '7d',
    
    // Phases force patience
    phaseProgression: 'time-locked',
    
    // Discussion only Friday-Saturday
    discussionWindow: 'limited',
  },
  
  // Friction (intentional)
  friction: {
    // Confirm before public annotation
    publicConfirmation: true,
    
    // No one-click social sharing
    sharingFriction: 'deliberate',
    
    // Membership, not virality
    growthModel: 'invitation',
  },
  
  // Curator authority
  curatorAuthority: {
    // Curators set room tone
    toneModeration: 'curator',
    
    // Curators can highlight/hide
    contentCuration: true,
    
    // No user-generated rooms (for now)
    roomCreation: 'curator-only',
  },
  
  // Emotional tone
  emotionalTone: {
    // AI content is warm, not clinical
    aiTone: 'editorial-literary',
    
    // Labels are poetic, not taxonomic
    labelStyle: 'evocative',
    
    // Numbers are ambient, not gamified
    metricsStyle: 'soft',
  },
}

// ============================================================
// 11. TECHNICAL STACK SUMMARY
// ============================================================
export const RECOMMENDED_STACK = {
  // Frontend
  frontend: {
    framework: 'Next.js 16 (App Router)',
    styling: 'Tailwind CSS v4',
    components: 'shadcn/ui',
    state: 'React Query / SWR',
    animations: 'Framer Motion',
  },
  
  // Backend
  backend: {
    database: 'Supabase (PostgreSQL)',
    auth: 'Supabase Auth',
    storage: 'Vercel Blob',
    cache: 'Vercel KV / Upstash Redis',
    search: 'Supabase FTS + pgvector',
  },
  
  // AI
  ai: {
    generation: 'OpenAI GPT-4',
    embeddings: 'OpenAI text-embedding-3-small',
    sdk: '@ai-sdk/openai',
  },
  
  // Events
  events: {
    queue: 'Inngest / Trigger.dev',
    cron: 'Vercel Cron',
    realtime: 'Supabase Realtime',
  },
  
  // Payments
  payments: {
    provider: 'Stripe',
    model: 'subscription',
  },
  
  // Deployment
  deployment: {
    platform: 'Vercel',
    regions: 'auto',
    edge: 'where-possible',
  },
}

// ============================================================
// 12. DATA FLOW DIAGRAMS
// ============================================================
export const DATA_FLOWS = {
  // Onboarding flow
  onboarding: `
    User Signs Up
    → Supabase Auth creates user
    → OAuth to Spotify (optional)
    → Fetch listening history
    → AI generates initial archetype
    → Create IdentityProfile
    → Match to Room affinities
    → User selects first room
    → Create ClubMembership
    → Onboarding complete
  `,
  
  // Weekly cycle flow
  weeklyCycle: `
    Monday (Arrival)
    → Cycle phase: 'arrival'
    → Album announced
    → Members notified
    
    Tuesday-Thursday (Private)
    → Cycle phase: 'private'
    → Users listen alone
    → Annotations are private
    
    Friday-Saturday (Discussion)
    → Cycle phase: 'discussion'
    → Annotations become visible (per privacy)
    → Prompts released
    → Discussion opens
    
    Sunday (Curator's Note)
    → Cycle phase: 'curators-note'
    → Essay published
    → Week wraps up
    
    Monday (New Cycle)
    → Cycle phase: 'archived'
    → CycleSummary generated
    → Identity dimensions updated
    → Archetype shift check
    → New cycle begins
  `,
  
  // Identity evolution flow
  identityEvolution: `
    After Each Cycle
    → Collect engagement data
    → Update emotional dimensions
    → Update sonic dimensions
    → Update behavioral dimensions
    → Update room affinities
    → Check for archetype shift
    
    If Archetype Shifts
    → Create IdentitySnapshot (immutable)
    → Generate shift explanation
    → Notify user
    → Update IdentityProfile
    
    Quarterly
    → Generate quarterly snapshot
    → Generate era if threshold met
    
    Yearly
    → Generate year-in-review (immutable)
    → Archive all snapshots
  `,
}

// ============================================================
// 13. MIGRATION STRATEGY
// ============================================================
/**
 * For migrating from prototype (static data) to production (database):
 */
export const MIGRATION_STRATEGY = {
  phases: [
    {
      phase: 1,
      name: 'Database Setup',
      tasks: [
        'Create Supabase project',
        'Define schema with migrations',
        'Set up RLS policies',
        'Create seed data from existing lib/*.ts',
      ],
    },
    {
      phase: 2,
      name: 'Auth Integration',
      tasks: [
        'Configure Supabase Auth',
        'Set up Spotify OAuth',
        'Create auth middleware',
        'Implement session management',
      ],
    },
    {
      phase: 3,
      name: 'API Layer',
      tasks: [
        'Create API routes for all entities',
        'Replace static imports with API calls',
        'Implement real-time subscriptions',
        'Add caching layer',
      ],
    },
    {
      phase: 4,
      name: 'AI Pipeline',
      tasks: [
        'Set up AI SDK',
        'Create generation pipelines',
        'Implement prompt versioning',
        'Add generation tracking',
      ],
    },
    {
      phase: 5,
      name: 'Events & Scheduling',
      tasks: [
        'Set up event queue',
        'Create scheduled jobs',
        'Implement notifications',
        'Test cycle automation',
      ],
    },
  ],
}

export default {
  DATABASE_SCHEMA_GUIDELINES,
  RLS_POLICIES,
  AUTH_ARCHITECTURE,
  AI_ARCHITECTURE,
  EVENT_ARCHITECTURE,
  CACHING_ARCHITECTURE,
  STORAGE_ARCHITECTURE,
  SEARCH_ARCHITECTURE,
  STREAMING_ARCHITECTURE,
  CULTURAL_HEALTH_ARCHITECTURE,
  RECOMMENDED_STACK,
  DATA_FLOWS,
  MIGRATION_STRATEGY,
}
