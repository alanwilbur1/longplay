export type StreamingService =
  | 'spotify'
  | 'apple-music'
  | 'tidal'
  | 'youtube-music'
  | 'deezer'
  | 'qobuz'
  | 'bandcamp'

export type MembershipTier = 'explorer' | 'member' | 'patron'
export type MembershipStatus = 'active' | 'past-due' | 'canceled' | 'free'

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          display_name: string
          avatar_url: string | null
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          primary_streaming_service: StreamingService | null
          preferences: Record<string, unknown>
          notification_settings: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string
          avatar_url?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          primary_streaming_service?: StreamingService | null
          preferences?: Record<string, unknown>
          notification_settings?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: {
          display_name?: string
          avatar_url?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          primary_streaming_service?: StreamingService | null
          preferences?: Record<string, unknown>
          notification_settings?: Record<string, unknown>
          updated_at?: string
        }
      }
      user_memberships: {
        Row: {
          id: string
          user_id: string
          tier: MembershipTier
          status: MembershipStatus
          member_since: string
          billing_cycle_start: string | null
          billing_cycle_end: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          annotations_this_cycle: number
          saved_moments_total: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          tier?: MembershipTier
          status?: MembershipStatus
          member_since?: string
          billing_cycle_start?: string | null
          billing_cycle_end?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          annotations_this_cycle?: number
          saved_moments_total?: number
        }
        Update: {
          tier?: MembershipTier
          status?: MembershipStatus
          billing_cycle_start?: string | null
          billing_cycle_end?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          annotations_this_cycle?: number
          saved_moments_total?: number
          updated_at?: string
        }
      }
      identity_profiles: {
        Row: {
          id: string
          user_id: string
          archetype_id: string | null
          archetype_confidence: number
          archetype_last_updated: string | null
          emotional_dimensions: Record<string, number>
          sonic_dimensions: Record<string, number>
          behavioral_dimensions: Record<string, number>
          taste_portrait: Record<string, unknown>
          editorial_description: string | null
          primary_room_slug: string | null
          last_major_shift_id: string | null
          shifts_this_year: number
          created_at: string
          updated_at: string
          last_ai_refresh_at: string | null
        }
        Insert: {
          user_id: string
          archetype_id?: string | null
          archetype_confidence?: number
          archetype_last_updated?: string | null
          emotional_dimensions?: Record<string, number>
          sonic_dimensions?: Record<string, number>
          behavioral_dimensions?: Record<string, number>
          taste_portrait?: Record<string, unknown>
          editorial_description?: string | null
          primary_room_slug?: string | null
          shifts_this_year?: number
        }
        Update: {
          archetype_id?: string | null
          archetype_confidence?: number
          archetype_last_updated?: string | null
          emotional_dimensions?: Record<string, number>
          sonic_dimensions?: Record<string, number>
          behavioral_dimensions?: Record<string, number>
          taste_portrait?: Record<string, unknown>
          editorial_description?: string | null
          primary_room_slug?: string | null
          shifts_this_year?: number
          updated_at?: string
          last_ai_refresh_at?: string | null
        }
      }
      streaming_connections: {
        Row: {
          id: string
          user_id: string
          service: StreamingService
          external_user_id: string | null
          access_token_encrypted: string | null
          refresh_token_encrypted: string | null
          token_expires_at: string | null
          scopes: string[] | null
          sync_status: string
          last_sync_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          service: StreamingService
          external_user_id?: string | null
          access_token_encrypted?: string | null
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          scopes?: string[] | null
          sync_status?: string
          last_sync_at?: string | null
        }
        Update: {
          external_user_id?: string | null
          access_token_encrypted?: string | null
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          scopes?: string[] | null
          sync_status?: string
          last_sync_at?: string | null
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      streaming_service: StreamingService
      membership_tier: MembershipTier
      membership_status: MembershipStatus
    }
  }
}
