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
      rooms: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          type: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          type?: string | null
        }
        Update: {
          slug?: string
          name?: string
          description?: string | null
          type?: string | null
          updated_at?: string
        }
      }
      club_memberships: {
        Row: {
          id: string
          user_id: string
          room_id: string
          status: 'active' | 'left'
          role: string
          joined_at: string
          left_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          room_id: string
          status?: 'active' | 'left'
          role?: string
          joined_at?: string
          left_at?: string | null
        }
        Update: {
          status?: 'active' | 'left'
          role?: string
          joined_at?: string
          left_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'club_memberships_room_id_fkey'
            columns: ['room_id']
            referencedRelation: 'rooms'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'club_memberships_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
        ]
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
      moments: {
        Row: {
          id: string
          member_id: string
          type: 'mark' | 'annotation' | 'reflection' | 'prompt_response' | 'rating' | 'reply' | 'save'
          visibility: 'private' | 'club' | 'connection' | 'public'
          album_id: string
          content: string
          track_id: string | null
          timestamp_ms: number | null
          cycle_id: string | null
          prompt_id: string | null
          parent_moment_id: string | null
          deleted_at: string | null
          created_at: string
          created_local_time: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          member_id: string
          type: 'mark' | 'annotation' | 'reflection' | 'prompt_response' | 'rating' | 'reply' | 'save'
          visibility?: 'private' | 'club' | 'connection' | 'public'
          album_id: string
          content: string
          track_id?: string | null
          timestamp_ms?: number | null
          cycle_id?: string | null
          prompt_id?: string | null
          parent_moment_id?: string | null
          deleted_at?: string | null
          created_at?: string
          created_local_time?: string | null
        }
        Update: {
          visibility?: 'private' | 'club' | 'connection' | 'public'
          deleted_at?: string | null
          updated_at?: string
        }
      }
      moment_visibility_history: {
        Row: {
          id: string
          moment_id: string
          previous_visibility: 'private' | 'club' | 'connection' | 'public'
          new_visibility: 'private' | 'club' | 'connection' | 'public'
          changed_at: string
          changed_by: string
        }
        Insert: {
          id?: string
          moment_id: string
          previous_visibility: 'private' | 'club' | 'connection' | 'public'
          new_visibility: 'private' | 'club' | 'connection' | 'public'
          changed_at?: string
          changed_by: string
        }
        Update: Record<string, never>
      }
      participation_events: {
        Row: {
          id: string
          member_id: string
          event_type: 'listen_start' | 'listen_complete' | 'cycle_join' | 'moment_create' | 'annotation_add' | 'reflection_submit' | 'prompt_respond' | 'album_save'
          album_id: string | null
          cycle_id: string | null
          moment_id: string | null
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          member_id: string
          event_type: 'listen_start' | 'listen_complete' | 'cycle_join' | 'moment_create' | 'annotation_add' | 'reflection_submit' | 'prompt_respond' | 'album_save'
          album_id?: string | null
          cycle_id?: string | null
          moment_id?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Update: Record<string, never>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      streaming_service: StreamingService
      membership_tier: MembershipTier
      membership_status: MembershipStatus
      moment_type: 'mark' | 'annotation' | 'reflection' | 'prompt_response' | 'rating' | 'reply' | 'save'
      moment_visibility: 'private' | 'club' | 'connection' | 'public'
      participation_event_type: 'listen_start' | 'listen_complete' | 'cycle_join' | 'moment_create' | 'annotation_add' | 'reflection_submit' | 'prompt_respond' | 'album_save'
    }
  }
}
