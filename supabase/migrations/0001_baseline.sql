-- ============================================================
-- LONGPLAY DATABASE SCHEMA
-- ============================================================
-- 
-- This is the canonical Supabase/PostgreSQL schema for LongPlay.
-- 
-- Design Principles:
-- 1. UUID primary keys everywhere
-- 2. Timestamps on every table (created_at, updated_at)
-- 3. Soft deletes where appropriate (deleted_at)
-- 4. JSONB for flexible dimensional data
-- 5. Row Level Security on all user data
-- 6. Immutable tables clearly marked
--
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector"; -- For future AI embeddings

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE membership_tier AS ENUM ('explorer', 'member', 'patron');
CREATE TYPE membership_status AS ENUM ('active', 'past-due', 'canceled', 'free');
CREATE TYPE streaming_service AS ENUM ('spotify', 'apple-music', 'tidal', 'youtube-music', 'deezer', 'qobuz', 'bandcamp');
CREATE TYPE room_type AS ENUM ('editorial', 'genre', 'creator', 'private');
CREATE TYPE room_visibility AS ENUM ('public', 'member', 'patron', 'invite-only');
CREATE TYPE cycle_phase AS ENUM ('upcoming', 'arrival', 'private', 'discussion', 'curators-note', 'archived');
CREATE TYPE annotation_visibility AS ENUM ('private', 'room', 'public');
CREATE TYPE affinity_resonance AS ENUM ('deep', 'strong', 'emerging', 'peripheral');
CREATE TYPE affinity_type AS ENUM ('resonance', 'expansion');
CREATE TYPE affinity_trend AS ENUM ('drifting-toward', 'stable', 'drifting-away', 'returning');
CREATE TYPE snapshot_type AS ENUM ('quarterly', 'yearly', 'archetype-shift', 'manual');
CREATE TYPE artifact_type AS ENUM ('archetype-card', 'taste-portrait', 'year-in-review', 'listening-era', 'cycle-summary', 'emotional-map', 'room-journey');
CREATE TYPE event_type AS ENUM ('cycle-start', 'cycle-phase-change', 'cycle-end', 'curator-note-release', 'archetype-shift', 'room-drift', 'memory-resurfaced', 'year-in-review-ready', 'milestone-reached', 'compatibility-generated');
CREATE TYPE event_status AS ENUM ('pending', 'processed', 'failed');
CREATE TYPE ai_content_type AS ENUM ('archetype-assignment', 'taste-portrait', 'era-narrative', 'cycle-summary', 'year-in-review', 'compatibility-reading', 'room-alignment', 'identity-shift-explanation');

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_completed_at TIMESTAMPTZ,
  primary_streaming_service streaming_service,
  preferences JSONB DEFAULT '{}',
  notification_settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', 'Listener'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- STREAMING CONNECTIONS
-- ============================================================

CREATE TABLE streaming_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  service streaming_service NOT NULL,
  external_user_id TEXT,
  access_token_encrypted TEXT, -- Encrypted with pgcrypto
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  sync_status TEXT DEFAULT 'active',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, service)
);

-- ============================================================
-- MEMBERSHIP
-- ============================================================

CREATE TABLE user_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE UNIQUE,
  tier membership_tier DEFAULT 'explorer',
  status membership_status DEFAULT 'free',
  member_since TIMESTAMPTZ DEFAULT NOW(),
  billing_cycle_start TIMESTAMPTZ,
  billing_cycle_end TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  annotations_this_cycle INTEGER DEFAULT 0,
  saved_moments_total INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE membership_tier_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  from_tier membership_tier,
  to_tier membership_tier NOT NULL,
  reason TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ARCHETYPES (reference table)
-- ============================================================

CREATE TABLE archetypes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  tagline TEXT NOT NULL,
  description TEXT NOT NULL,
  emotional_core TEXT[] DEFAULT '{}',
  sonic_signatures TEXT[] DEFAULT '{}',
  associated_rooms TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed archetypes
INSERT INTO archetypes (name, tagline, description, emotional_core, sonic_signatures, associated_rooms) VALUES
  ('The Midnight Archivist', 'Collector of nocturnal moments', 'Listeners who treat their collection as a lifelong companion, finding meaning in the spaces between songs.', ARRAY['Solitude', 'Reverence', 'Patience'], ARRAY['Sparse', 'Atmospheric', 'Analog'], ARRAY['nocturnal-room', 'records-for-rain']),
  ('The Nocturnal Romantic', 'Finding truth after midnight', 'Those who believe the night reveals what day conceals. Drawn to intimate, confessional records.', ARRAY['Intimacy', 'Melancholy', 'Longing'], ARRAY['Intimate', 'Acoustic', 'Warm'], ARRAY['nocturnal-room', 'beautiful-damage']),
  ('The Deliberate Listener', 'Attention as practice', 'Listeners who approach each album as a complete experience, not background music.', ARRAY['Patience', 'Focus', 'Reverence'], ARRAY['Dense', 'Layered', 'Complex'], ARRAY['cathedral-hour', 'analog-futures']),
  ('The Cathedral Listener', 'Seeking transcendence through sound', 'Those who seek the spiritual in music, drawn to patience, architecture, and devotional attention.', ARRAY['Transcendence', 'Patience', 'Sacred'], ARRAY['Ambient', 'Orchestral', 'Expansive'], ARRAY['cathedral-hour', 'spiritual-jazz']),
  ('The Velvet Dissenter', 'Finding comfort in the shadows', 'Listeners who gravitate toward the experimental, the difficult, the beautiful-strange.', ARRAY['Ambiguity', 'Restlessness', 'Discovery'], ARRAY['Electronic', 'Textured', 'Unconventional'], ARRAY['analog-futures', 'beautiful-damage']);

-- ============================================================
-- IDENTITY PROFILES (current, mutable)
-- ============================================================

CREATE TABLE identity_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE UNIQUE,
  
  -- Current archetype
  archetype_id UUID REFERENCES archetypes(id),
  archetype_confidence INTEGER DEFAULT 0 CHECK (archetype_confidence >= 0 AND archetype_confidence <= 100),
  archetype_last_updated TIMESTAMPTZ,
  
  -- Dimensions (0-100 scales stored as JSONB)
  emotional_dimensions JSONB DEFAULT '{"melancholy": 50, "intimacy": 50, "transcendence": 50, "ambiguity": 50, "nostalgia": 50, "catharsis": 50}',
  sonic_dimensions JSONB DEFAULT '{"warmth": 50, "density": 50, "organicDigital": 50, "pacing": 50, "texture": 50, "atmosphere": 50}',
  behavioral_dimensions JSONB DEFAULT '{"nocturnal": 50, "immersive": 50, "archival": 50, "solitary": 50, "patient": 50, "annotative": 50}',
  
  -- AI-generated content
  taste_portrait JSONB DEFAULT '{}',
  editorial_description TEXT,
  
  -- Room affinities
  primary_room_slug TEXT,
  
  -- Evolution tracking
  last_major_shift_id UUID,
  shifts_this_year INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_ai_refresh_at TIMESTAMPTZ
);

-- ============================================================
-- IDENTITY SNAPSHOTS (historical, IMMUTABLE)
-- ============================================================

CREATE TABLE identity_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  -- Snapshot metadata
  snapshot_type snapshot_type NOT NULL,
  snapshot_date TIMESTAMPTZ NOT NULL,
  snapshot_label TEXT NOT NULL, -- e.g., "Q1 2026"
  
  -- Frozen state (copied from identity_profile at snapshot time)
  archetype_id UUID REFERENCES archetypes(id),
  emotional_dimensions JSONB NOT NULL,
  sonic_dimensions JSONB NOT NULL,
  behavioral_dimensions JSONB NOT NULL,
  taste_portrait JSONB NOT NULL,
  editorial_description TEXT,
  room_affinities JSONB NOT NULL, -- Snapshot of affinities
  primary_room_slug TEXT,
  
  -- Context
  cycles_completed_total INTEGER DEFAULT 0,
  annotations_total INTEGER DEFAULT 0,
  rooms_joined TEXT[] DEFAULT '{}',
  
  -- If archetype shift
  shift_from_archetype_id UUID REFERENCES archetypes(id),
  shift_to_archetype_id UUID REFERENCES archetypes(id),
  shift_explanation TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
  -- NO updated_at - this table is IMMUTABLE
);

-- ============================================================
-- CURATORS
-- ============================================================

CREATE TABLE curators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id), -- If they have an account
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar_url TEXT,
  listening_philosophy TEXT NOT NULL,
  curator_statement TEXT NOT NULL,
  favorite_record_ids UUID[] DEFAULT '{}',
  current_obsessions TEXT[] DEFAULT '{}',
  recurring_themes TEXT[] DEFAULT '{}',
  credentials TEXT,
  publications TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROOMS
-- ============================================================

CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type room_type NOT NULL DEFAULT 'editorial',
  visibility room_visibility NOT NULL DEFAULT 'public',
  
  -- Cultural identity
  description TEXT NOT NULL,
  tagline TEXT,
  atmosphere TEXT,
  manifesto TEXT NOT NULL,
  
  -- Curator
  curator_id UUID NOT NULL REFERENCES curators(id),
  
  -- Visual identity
  aesthetics JSONB DEFAULT '{}',
  
  -- Listening philosophy
  listening_ritual TEXT,
  what_we_look_for TEXT[] DEFAULT '{}',
  what_we_avoid TEXT[] DEFAULT '{}',
  
  -- Associated archetypes
  associated_archetypes TEXT[] DEFAULT '{}',
  
  -- Seasonal moods
  seasonal_moods JSONB DEFAULT '{}',
  current_season TEXT,
  
  -- Current cycle
  current_cycle_id UUID, -- FK added after cycles table
  
  -- Stats
  member_count_label TEXT DEFAULT '0 listeners',
  atmosphere_notes TEXT[] DEFAULT '{}',
  
  -- Related rooms
  related_rooms TEXT[] DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ALBUMS
-- ============================================================

CREATE TABLE albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core metadata
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  year TEXT,
  
  -- Artwork
  cover_url TEXT,
  fallback_gradient TEXT DEFAULT 'from-slate-800 to-slate-900',
  artwork_source TEXT DEFAULT 'manual',
  artwork_verified_at TIMESTAMPTZ,
  
  -- Editorial content
  description TEXT,
  editorial_note TEXT,
  
  -- Tags
  emotional_tags TEXT[] DEFAULT '{}',
  sonic_tags TEXT[] DEFAULT '{}',
  room_associations TEXT[] DEFAULT '{}',
  
  -- External IDs
  spotify_id TEXT,
  apple_music_id TEXT,
  tidal_id TEXT,
  musicbrainz_id TEXT,
  discogs_id TEXT,
  
  -- Streaming URLs
  streaming_urls JSONB DEFAULT '{}',
  
  -- Stats
  cycles_featuring_this INTEGER DEFAULT 0,
  total_annotations INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CYCLES
-- ============================================================

CREATE TABLE cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  album_id UUID NOT NULL REFERENCES albums(id),
  
  -- Temporal
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  season_label TEXT NOT NULL,
  
  -- Phase
  current_phase cycle_phase DEFAULT 'upcoming',
  phase_changed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Curator content
  curator_essay_id UUID, -- FK added after curator_essays table
  
  -- Themes
  emotional_themes TEXT[] DEFAULT '{}',
  sonic_themes TEXT[] DEFAULT '{}',
  
  -- AI-generated summary (JSONB for flexibility)
  cycle_summary JSONB,
  
  -- Stats
  participant_count INTEGER DEFAULT 0,
  annotation_count INTEGER DEFAULT 0,
  discussion_contributions INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  
  UNIQUE(room_id, year, week_number)
);

-- Add FK to rooms
ALTER TABLE rooms ADD CONSTRAINT fk_rooms_current_cycle 
  FOREIGN KEY (current_cycle_id) REFERENCES cycles(id);

-- ============================================================
-- CYCLE PROMPTS
-- ============================================================

CREATE TABLE cycle_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  hint TEXT,
  display_order INTEGER NOT NULL,
  release_phase cycle_phase DEFAULT 'private',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CURATOR ESSAYS
-- ============================================================

CREATE TABLE curator_essays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES curators(id),
  room_id UUID NOT NULL REFERENCES rooms(id),
  cycle_id UUID REFERENCES cycles(id),
  
  -- Content
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  full_text TEXT NOT NULL,
  
  -- Type
  essay_type TEXT NOT NULL DEFAULT 'cycle-note',
  
  -- Publishing
  published_at TIMESTAMPTZ,
  is_published BOOLEAN DEFAULT FALSE,
  
  -- Access
  visible_to room_visibility DEFAULT 'public',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
  -- NO updated_at after publication - IMMUTABLE once published
);

-- Add FK to cycles
ALTER TABLE cycles ADD CONSTRAINT fk_cycles_curator_essay 
  FOREIGN KEY (curator_essay_id) REFERENCES curator_essays(id);

-- ============================================================
-- CLUB MEMBERSHIPS (user joins room)
-- ============================================================

CREATE TABLE club_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  
  -- Status
  status TEXT DEFAULT 'active',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  
  -- Engagement
  cycles_completed INTEGER DEFAULT 0,
  annotations_count INTEGER DEFAULT 0,
  discussion_contributions INTEGER DEFAULT 0,
  
  -- Role
  role TEXT DEFAULT 'member',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, room_id)
);

-- ============================================================
-- ROOM AFFINITIES
-- ============================================================

CREATE TABLE room_affinities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  room_slug TEXT NOT NULL,
  room_name TEXT NOT NULL,
  
  -- Affinity
  resonance affinity_resonance DEFAULT 'emerging',
  resonance_explanation TEXT,
  emotional_threads TEXT[] DEFAULT '{}',
  sonic_patterns TEXT[] DEFAULT '{}',
  affinity_type affinity_type DEFAULT 'resonance',
  trend affinity_trend DEFAULT 'stable',
  trend_note TEXT,
  
  -- Engagement
  cycles_participated INTEGER DEFAULT 0,
  last_cycle_at TIMESTAMPTZ,
  annotations_in_room INTEGER DEFAULT 0,
  
  first_affinity_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, room_slug)
);

-- ============================================================
-- ANNOTATIONS
-- ============================================================

CREATE TABLE annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  -- What it's about
  album_id UUID NOT NULL REFERENCES albums(id),
  cycle_id UUID REFERENCES cycles(id),
  room_id UUID REFERENCES rooms(id),
  
  -- Location
  track_number INTEGER,
  track_title TEXT,
  timestamp TEXT, -- e.g., "2:47"
  
  -- Content
  content TEXT NOT NULL,
  emotion_tag TEXT,
  
  -- Privacy
  visibility annotation_visibility DEFAULT 'private',
  
  -- Engagement
  resonance_count INTEGER DEFAULT 0,
  
  -- Context
  cycle_phase cycle_phase,
  prompt_id UUID REFERENCES cycle_prompts(id),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ, -- Soft delete
  
  -- Resurfacing
  last_resurfaced_at TIMESTAMPTZ,
  resurface_count INTEGER DEFAULT 0
);

-- Index for user's annotations
CREATE INDEX idx_annotations_user ON annotations(user_id, created_at DESC);
CREATE INDEX idx_annotations_album ON annotations(album_id);
CREATE INDEX idx_annotations_visibility ON annotations(visibility);

-- ============================================================
-- LISTENING MOMENTS
-- ============================================================

CREATE TABLE listening_moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  album_id UUID NOT NULL REFERENCES albums(id),
  
  -- Location
  track_number INTEGER NOT NULL,
  track_title TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  end_timestamp TEXT,
  
  -- Context
  cycle_id UUID REFERENCES cycles(id),
  room_id UUID REFERENCES rooms(id),
  annotation_id UUID REFERENCES annotations(id),
  
  -- Tags
  emotion_tag TEXT,
  note TEXT,
  
  -- Timestamps
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  last_returned_at TIMESTAMPTZ,
  return_count INTEGER DEFAULT 0
);

-- ============================================================
-- LISTENING ERAS (IMMUTABLE after generation)
-- ============================================================

CREATE TABLE listening_eras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  -- Identity
  name TEXT NOT NULL,
  time_range TEXT NOT NULL,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  
  -- Narrative (AI-generated)
  description TEXT NOT NULL,
  
  -- Themes
  dominant_emotional_themes TEXT[] DEFAULT '{}',
  dominant_sonic_themes TEXT[] DEFAULT '{}',
  
  -- Archetype journey
  archetype_at_start TEXT,
  archetype_at_end TEXT,
  
  -- Content
  cycle_ids UUID[] DEFAULT '{}',
  formative_album_id UUID REFERENCES albums(id),
  key_annotation_ids UUID[] DEFAULT '{}',
  
  -- Stats
  total_cycles INTEGER DEFAULT 0,
  total_annotations INTEGER DEFAULT 0,
  
  -- Generation
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  model_version TEXT
  -- NO updated_at - IMMUTABLE
);

-- ============================================================
-- COMPATIBILITY READINGS
-- ============================================================

CREATE TABLE compatibility_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  -- Reading
  compatibility_label TEXT NOT NULL,
  narrative_reading TEXT NOT NULL,
  
  -- Dimensions
  emotional_overlap INTEGER CHECK (emotional_overlap >= 0 AND emotional_overlap <= 100),
  sonic_overlap INTEGER CHECK (sonic_overlap >= 0 AND sonic_overlap <= 100),
  behavioral_overlap INTEGER CHECK (behavioral_overlap >= 0 AND behavioral_overlap <= 100),
  
  -- Insights
  shared_threads TEXT[] DEFAULT '{}',
  complementary_differences TEXT[] DEFAULT '{}',
  potential_tension TEXT[] DEFAULT '{}',
  
  -- Shared content
  shared_rooms TEXT[] DEFAULT '{}',
  shared_album_affinities TEXT[] DEFAULT '{}',
  
  -- Generation
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  model_version TEXT,
  
  UNIQUE(user_a_id, user_b_id)
);

-- ============================================================
-- REFLECTIONS
-- ============================================================

CREATE TABLE reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  -- Type
  reflection_type TEXT NOT NULL,
  era_id UUID REFERENCES listening_eras(id),
  cycle_id UUID REFERENCES cycles(id),
  album_id UUID REFERENCES albums(id),
  
  -- Content
  title TEXT,
  content TEXT NOT NULL,
  
  -- Privacy
  visibility annotation_visibility DEFAULT 'private',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- ============================================================
-- SAVED PASSAGES
-- ============================================================

CREATE TABLE saved_passages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  -- Source
  source_type TEXT NOT NULL,
  source_id UUID,
  source_url TEXT,
  
  -- Content
  content TEXT NOT NULL,
  attribution TEXT NOT NULL,
  
  -- Context
  album_id UUID REFERENCES albums(id),
  room_id UUID REFERENCES rooms(id),
  
  saved_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LISTENING ARTIFACTS
-- ============================================================

CREATE TABLE listening_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  
  -- Type
  artifact_type artifact_type NOT NULL,
  
  -- Source
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  
  -- Content
  title TEXT NOT NULL,
  preview_text TEXT,
  
  -- Formats (stored as JSONB array)
  formats JSONB DEFAULT '[]',
  
  -- Generation
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- ============================================================
-- PLATFORM EVENTS
-- ============================================================

CREATE TABLE platform_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type event_type NOT NULL,
  
  -- Target
  user_id UUID REFERENCES user_profiles(id),
  room_id UUID REFERENCES rooms(id),
  cycle_id UUID REFERENCES cycles(id),
  
  -- Payload
  payload JSONB DEFAULT '{}',
  
  -- Processing
  status event_status DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  
  -- Notification
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_sent_at TIMESTAMPTZ,
  
  -- Timestamps
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for event processing
CREATE INDEX idx_events_status ON platform_events(status, created_at);
CREATE INDEX idx_events_user ON platform_events(user_id, occurred_at DESC);

-- ============================================================
-- AI GENERATIONS (tracking)
-- ============================================================

CREATE TABLE ai_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content_type ai_content_type NOT NULL,
  
  -- Output
  output_id UUID NOT NULL,
  
  -- Input context
  input_cycle_ids UUID[] DEFAULT '{}',
  input_annotation_count INTEGER DEFAULT 0,
  input_time_range TEXT,
  
  -- Model info
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  prompt_version TEXT,
  
  -- Quality
  confidence INTEGER,
  
  -- Lifecycle
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  regeneration_trigger TEXT,
  
  -- Immutability
  is_frozen BOOLEAN DEFAULT FALSE,
  frozen_at TIMESTAMPTZ,
  frozen_reason TEXT
);

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on all user-owned tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaming_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_affinities ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_eras ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE compatibility_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;

-- User can only access their own data
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);
  
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own streaming connections" ON streaming_connections
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own membership" ON user_memberships
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own identity" ON identity_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own snapshots" ON identity_snapshots
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own club memberships" ON club_memberships
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own room affinities" ON room_affinities
  FOR ALL USING (auth.uid() = user_id);

-- Annotations have complex visibility rules
CREATE POLICY "Users can view own annotations" ON annotations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view public annotations" ON annotations
  FOR SELECT USING (visibility = 'public');

CREATE POLICY "Users can view room annotations if member" ON annotations
  FOR SELECT USING (
    visibility = 'room' 
    AND EXISTS (
      SELECT 1 FROM club_memberships 
      WHERE user_id = auth.uid() 
      AND room_id = annotations.room_id 
      AND status = 'active'
    )
  );

CREATE POLICY "Users can create own annotations" ON annotations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own annotations" ON annotations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own annotations" ON annotations
  FOR DELETE USING (auth.uid() = user_id);

-- Other user-owned tables
CREATE POLICY "Users can manage own listening moments" ON listening_moments
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own eras" ON listening_eras
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own reflections" ON reflections
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own saved passages" ON saved_passages
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own artifacts" ON listening_artifacts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own compatibility readings" ON compatibility_readings
  FOR SELECT USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "Users can view own AI generations" ON ai_generations
  FOR SELECT USING (auth.uid() = user_id);

-- Public read for platform tables
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE curators ENABLE ROW LEVEL SECURITY;
ALTER TABLE curator_essays ENABLE ROW LEVEL SECURITY;
ALTER TABLE archetypes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rooms" ON rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can view albums" ON albums FOR SELECT USING (true);
CREATE POLICY "Anyone can view cycles" ON cycles FOR SELECT USING (true);
CREATE POLICY "Anyone can view curators" ON curators FOR SELECT USING (true);
CREATE POLICY "Anyone can view published essays" ON curator_essays 
  FOR SELECT USING (is_published = true);
CREATE POLICY "Anyone can view archetypes" ON archetypes FOR SELECT USING (true);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_user_profiles
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_identity_profiles
  BEFORE UPDATE ON identity_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_rooms
  BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_albums
  BEFORE UPDATE ON albums
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_club_memberships
  BEFORE UPDATE ON club_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_room_affinities
  BEFORE UPDATE ON room_affinities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_annotations
  BEFORE UPDATE ON annotations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_reflections
  BEFORE UPDATE ON reflections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FULL-TEXT SEARCH
-- ============================================================

-- Add tsvector columns for search
ALTER TABLE annotations ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

ALTER TABLE albums ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || artist || ' ' || COALESCE(description, ''))) STORED;

ALTER TABLE curator_essays ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || full_text)) STORED;

-- Indexes for search
CREATE INDEX idx_annotations_search ON annotations USING GIN(search_vector);
CREATE INDEX idx_albums_search ON albums USING GIN(search_vector);
CREATE INDEX idx_curator_essays_search ON curator_essays USING GIN(search_vector);

-- ============================================================
-- END OF SCHEMA
-- ============================================================
