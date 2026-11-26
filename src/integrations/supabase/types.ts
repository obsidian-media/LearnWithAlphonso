export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      achievements: {
        Row: {
          category: string;
          description: string;
          icon: string;
          id: string;
          sort_order: number;
          threshold: number;
          tier: string;
          title: string;
        };
        Insert: {
          category: string;
          description: string;
          icon: string;
          id: string;
          sort_order?: number;
          threshold: number;
          tier: string;
          title: string;
        };
        Update: {
          category?: string;
          description?: string;
          icon?: string;
          id?: string;
          sort_order?: number;
          threshold?: number;
          tier?: string;
          title?: string;
        };
        Relationships: [];
      };
      activity_days: {
        Row: {
          day: string;
          user_id: string;
          xp_earned: number;
        };
        Insert: {
          day: string;
          user_id: string;
          xp_earned?: number;
        };
        Update: {
          day?: string;
          user_id?: string;
          xp_earned?: number;
        };
        Relationships: [];
      };
      admin_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: NonNullable<Json>;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      admin_users: {
        Row: {
          added_at: string;
          added_by: string | null;
          note: string | null;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          added_by?: string | null;
          note?: string | null;
          user_id: string;
        };
        Update: {
          added_at?: string;
          added_by?: string | null;
          note?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_cost_alert_days: {
        Row: {
          day: string;
          evaluated_at: string;
        };
        Insert: {
          day: string;
          evaluated_at?: string;
        };
        Update: {
          day?: string;
          evaluated_at?: string;
        };
        Relationships: [];
      };
      ai_cost_daily: {
        Row: {
          cache_hits: number;
          calls: number;
          cost_micro_usd: number;
          day: string;
          input_tokens: number;
          kind: string;
          output_tokens: number;
          stt_seconds: number;
          tts_chars: number;
          unpriced_calls: number;
          user_id: string;
          vendor: string;
        };
        Insert: {
          cache_hits?: number;
          calls: number;
          cost_micro_usd?: number;
          day: string;
          input_tokens?: number;
          kind: string;
          output_tokens?: number;
          stt_seconds?: number;
          tts_chars?: number;
          unpriced_calls?: number;
          user_id: string;
          vendor: string;
        };
        Update: {
          cache_hits?: number;
          calls?: number;
          cost_micro_usd?: number;
          day?: string;
          input_tokens?: number;
          kind?: string;
          output_tokens?: number;
          stt_seconds?: number;
          tts_chars?: number;
          unpriced_calls?: number;
          user_id?: string;
          vendor?: string;
        };
        Relationships: [];
      };
      ai_cost_log: {
        Row: {
          cache_hit: boolean;
          cost_micro_usd: number | null;
          cost_source: string;
          created_at: string;
          id: number;
          input_tokens: number | null;
          kind: string;
          model: string;
          output_tokens: number | null;
          stt_seconds: number | null;
          tts_chars: number | null;
          user_id: string;
          vendor: string;
        };
        Insert: {
          cache_hit?: boolean;
          cost_micro_usd?: number | null;
          cost_source: string;
          created_at?: string;
          id?: never;
          input_tokens?: number | null;
          kind: string;
          model: string;
          output_tokens?: number | null;
          stt_seconds?: number | null;
          tts_chars?: number | null;
          user_id: string;
          vendor: string;
        };
        Update: {
          cache_hit?: boolean;
          cost_micro_usd?: number | null;
          cost_source?: string;
          created_at?: string;
          id?: never;
          input_tokens?: number | null;
          kind?: string;
          model?: string;
          output_tokens?: number | null;
          stt_seconds?: number | null;
          tts_chars?: number | null;
          user_id?: string;
          vendor?: string;
        };
        Relationships: [];
      };
      ai_rate_limits: {
        Row: {
          count: number;
          kind: string;
          minute_bucket: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          count?: number;
          kind: string;
          minute_bucket: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          count?: number;
          kind?: string;
          minute_bucket?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_usage: {
        Row: {
          count: number;
          day: string;
          kind: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          count?: number;
          day?: string;
          kind: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          count?: number;
          day?: string;
          kind?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      app_switches: {
        Row: {
          enabled: boolean;
          key: string;
          note: string | null;
          updated_at: string;
        };
        Insert: {
          enabled?: boolean;
          key: string;
          note?: string | null;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          key?: string;
          note?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      apple_auth_tokens: {
        Row: {
          created_at: string;
          refresh_token: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          refresh_token: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          refresh_token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      apple_revocation_pending: {
        Row: {
          attempts: number;
          created_at: string;
          id: string;
          last_attempt_at: string | null;
          refresh_token: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          id?: string;
          last_attempt_at?: string | null;
          refresh_token: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          id?: string;
          last_attempt_at?: string | null;
          refresh_token?: string;
        };
        Relationships: [];
      };
      blocked_users: {
        Row: {
          blocked: string;
          blocker: string;
          created_at: string;
        };
        Insert: {
          blocked: string;
          blocker: string;
          created_at?: string;
        };
        Update: {
          blocked?: string;
          blocker?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      buddy_age_confirmations: {
        Row: {
          confirmations: number;
          first_confirmed_at: string;
          last_confirmed_at: string;
          user_id: string;
        };
        Insert: {
          confirmations?: number;
          first_confirmed_at?: string;
          last_confirmed_at?: string;
          user_id: string;
        };
        Update: {
          confirmations?: number;
          first_confirmed_at?: string;
          last_confirmed_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      buddy_members: {
        Row: {
          pair_id: string;
          user_id: string;
        };
        Insert: {
          pair_id: string;
          user_id: string;
        };
        Update: {
          pair_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buddy_members_pair_id_fkey";
            columns: ["pair_id"];
            isOneToOne: false;
            referencedRelation: "buddy_pairs";
            referencedColumns: ["id"];
          },
        ];
      };
      buddy_messages: {
        Row: {
          created_at: string;
          id: string;
          pair_id: string;
          preset_id: string;
          sender_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          pair_id: string;
          preset_id: string;
          sender_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          pair_id?: string;
          preset_id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buddy_messages_pair_id_fkey";
            columns: ["pair_id"];
            isOneToOne: false;
            referencedRelation: "buddy_pairs";
            referencedColumns: ["id"];
          },
        ];
      };
      buddy_pairs: {
        Row: {
          created_at: string;
          ended_at: string | null;
          ended_reason: string | null;
          grace_available: boolean;
          id: string;
          resolved_through: string | null;
          source: string;
          streak_weeks: number;
          user_a: string;
          user_b: string;
        };
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          ended_reason?: string | null;
          grace_available?: boolean;
          id?: string;
          resolved_through?: string | null;
          source: string;
          streak_weeks?: number;
          user_a: string;
          user_b: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          ended_reason?: string | null;
          grace_available?: boolean;
          id?: string;
          resolved_through?: string | null;
          source?: string;
          streak_weeks?: number;
          user_a?: string;
          user_b?: string;
        };
        Relationships: [];
      };
      buddy_pool: {
        Row: {
          age_confirmed_at: string;
          cefr_level: string;
          course: string;
          joined_at: string;
          user_id: string;
        };
        Insert: {
          age_confirmed_at: string;
          cefr_level: string;
          course: string;
          joined_at?: string;
          user_id: string;
        };
        Update: {
          age_confirmed_at?: string;
          cefr_level?: string;
          course?: string;
          joined_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      buddy_pool_attempts: {
        Row: {
          attempted_at: string;
          user_id: string;
        };
        Insert: {
          attempted_at?: string;
          user_id: string;
        };
        Update: {
          attempted_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      buddy_pool_exclusions: {
        Row: {
          created_at: string;
          reason: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          reason?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          reason?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      buddy_requests: {
        Row: {
          created_at: string;
          from_user: string;
          id: string;
          responded_at: string | null;
          status: string;
          to_user: string;
        };
        Insert: {
          created_at?: string;
          from_user: string;
          id?: string;
          responded_at?: string | null;
          status?: string;
          to_user: string;
        };
        Update: {
          created_at?: string;
          from_user?: string;
          id?: string;
          responded_at?: string | null;
          status?: string;
          to_user?: string;
        };
        Relationships: [];
      };
      buddy_settings: {
        Row: {
          id: boolean;
          matching_enabled: boolean;
          open_duels_enabled: boolean;
        };
        Insert: {
          id?: boolean;
          matching_enabled?: boolean;
          open_duels_enabled?: boolean;
        };
        Update: {
          id?: boolean;
          matching_enabled?: boolean;
          open_duels_enabled?: boolean;
        };
        Relationships: [];
      };
      buddy_weeks: {
        Row: {
          a_count: number;
          b_count: number;
          outcome: string;
          pair_id: string;
          week_start: string;
        };
        Insert: {
          a_count: number;
          b_count: number;
          outcome: string;
          pair_id: string;
          week_start: string;
        };
        Update: {
          a_count?: number;
          b_count?: number;
          outcome?: string;
          pair_id?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buddy_weeks_pair_id_fkey";
            columns: ["pair_id"];
            isOneToOne: false;
            referencedRelation: "buddy_pairs";
            referencedColumns: ["id"];
          },
        ];
      };
      challenge_completions: {
        Row: {
          completed_at: string;
          template_id: string;
          user_id: string;
          week_start: string;
        };
        Insert: {
          completed_at?: string;
          template_id: string;
          user_id: string;
          week_start: string;
        };
        Update: {
          completed_at?: string;
          template_id?: string;
          user_id?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "challenge_completions_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "challenge_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      challenge_templates: {
        Row: {
          description: string;
          id: string;
          threshold: number;
          title: string;
          type: string;
        };
        Insert: {
          description: string;
          id: string;
          threshold: number;
          title: string;
          type: string;
        };
        Update: {
          description?: string;
          id?: string;
          threshold?: number;
          title?: string;
          type?: string;
        };
        Relationships: [];
      };
      content_report_delivery: {
        Row: {
          attempts: number;
          escalated_at: string | null;
          notified_at: string | null;
          report_id: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          escalated_at?: string | null;
          notified_at?: string | null;
          report_id: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          escalated_at?: string | null;
          notified_at?: string | null;
          report_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_report_delivery_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: true;
            referencedRelation: "content_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      content_reports: {
        Row: {
          account_deleted_at: string | null;
          context: Json | null;
          created_at: string;
          id: string;
          kind: string;
          reason: string;
          reported: string | null;
          reporter: string | null;
        };
        Insert: {
          account_deleted_at?: string | null;
          context?: Json | null;
          created_at?: string;
          id?: string;
          kind?: string;
          reason: string;
          reported?: string | null;
          reporter?: string | null;
        };
        Update: {
          account_deleted_at?: string | null;
          context?: Json | null;
          created_at?: string;
          id?: string;
          kind?: string;
          reason?: string;
          reported?: string | null;
          reporter?: string | null;
        };
        Relationships: [];
      };
      device_tokens: {
        Row: {
          created_at: string;
          id: string;
          platform: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          platform?: string;
          token: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          platform?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      display_name_migration_backup: {
        Row: {
          migrated_at: string;
          new_display_name: string;
          old_display_name: string;
          user_id: string;
        };
        Insert: {
          migrated_at?: string;
          new_display_name: string;
          old_display_name: string;
          user_id: string;
        };
        Update: {
          migrated_at?: string;
          new_display_name?: string;
          old_display_name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      duel_queue: {
        Row: {
          cefr_level: string;
          course: string;
          match_by_level: boolean;
          queued_at: string;
          user_id: string;
        };
        Insert: {
          cefr_level: string;
          course: string;
          match_by_level?: boolean;
          queued_at?: string;
          user_id: string;
        };
        Update: {
          cefr_level?: string;
          course?: string;
          match_by_level?: boolean;
          queued_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      duels: {
        Row: {
          challenger_id: string;
          challenger_xp_start: number | null;
          course: string;
          created_at: string;
          ends_at: string | null;
          id: string;
          opponent_id: string;
          opponent_xp_start: number | null;
          status: string;
          winner_id: string | null;
        };
        Insert: {
          challenger_id: string;
          challenger_xp_start?: number | null;
          course?: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          opponent_id: string;
          opponent_xp_start?: number | null;
          status?: string;
          winner_id?: string | null;
        };
        Update: {
          challenger_id?: string;
          challenger_xp_start?: number | null;
          course?: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          opponent_id?: string;
          opponent_xp_start?: number | null;
          status?: string;
          winner_id?: string | null;
        };
        Relationships: [];
      };
      explanation_cache: {
        Row: {
          cache_key: string;
          course: string;
          created_at: string;
          explanation: string;
          kind: string;
          native_language: string;
        };
        Insert: {
          cache_key: string;
          course: string;
          created_at?: string;
          explanation: string;
          kind: string;
          native_language: string;
        };
        Update: {
          cache_key?: string;
          course?: string;
          created_at?: string;
          explanation?: string;
          kind?: string;
          native_language?: string;
        };
        Relationships: [];
      };
      friend_activity_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          payload: NonNullable<Json>;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          payload?: NonNullable<Json>;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          payload?: NonNullable<Json>;
          user_id?: string;
        };
        Relationships: [];
      };
      friend_invite_codes: {
        Row: {
          code: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          created_at: string;
          friend_id: string;
          id: string;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          friend_id: string;
          id?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          friend_id?: string;
          id?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      heart_loss_reports: {
        Row: {
          at: string;
          claimed: boolean;
          id: number;
          user_id: string;
        };
        Insert: {
          at?: string;
          claimed?: boolean;
          id?: never;
          user_id: string;
        };
        Update: {
          at?: string;
          claimed?: boolean;
          id?: never;
          user_id?: string;
        };
        Relationships: [];
      };
      hearts_pro_status: {
        Row: {
          checked_at: string;
          pro: boolean;
          user_id: string;
        };
        Insert: {
          checked_at?: string;
          pro: boolean;
          user_id: string;
        };
        Update: {
          checked_at?: string;
          pro?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
      hector_call_ends: {
        Row: {
          call_id: string;
          claimed_at: string;
          completed_at: string | null;
          user_id: string;
        };
        Insert: {
          call_id: string;
          claimed_at?: string;
          completed_at?: string | null;
          user_id: string;
        };
        Update: {
          call_id?: string;
          claimed_at?: string;
          completed_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      hector_turn_token_uses: {
        Row: {
          expires_at: string;
          part: number;
          sig_hash: string;
          uses: number;
        };
        Insert: {
          expires_at: string;
          part: number;
          sig_hash: string;
          uses?: number;
        };
        Update: {
          expires_at?: string;
          part?: number;
          sig_hash?: string;
          uses?: number;
        };
        Relationships: [];
      };
      language_progress: {
        Row: {
          cefr_level: string;
          created_at: string;
          language: string;
          league_tier: string;
          placement_level: string | null;
          placement_score: number | null;
          placement_taken_at: string | null;
          updated_at: string;
          user_id: string;
          xp: number;
        };
        Insert: {
          cefr_level?: string;
          created_at?: string;
          language: string;
          league_tier?: string;
          placement_level?: string | null;
          placement_score?: number | null;
          placement_taken_at?: string | null;
          updated_at?: string;
          user_id: string;
          xp?: number;
        };
        Update: {
          cefr_level?: string;
          created_at?: string;
          language?: string;
          league_tier?: string;
          placement_level?: string | null;
          placement_score?: number | null;
          placement_taken_at?: string | null;
          updated_at?: string;
          user_id?: string;
          xp?: number;
        };
        Relationships: [];
      };
      learner_time_zones: {
        Row: {
          time_zone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          time_zone: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          time_zone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      learning_days: {
        Row: {
          day: string;
          lesson_seconds: number;
          practice_seconds: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          day: string;
          lesson_seconds?: number;
          practice_seconds?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          day?: string;
          lesson_seconds?: number;
          practice_seconds?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      learning_goals: {
        Row: {
          created_at: string;
          language: string;
          target_date: string;
          target_level: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          language: string;
          target_date: string;
          target_level: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          language?: string;
          target_date?: string;
          target_level?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      lesson_completion_hits: {
        Row: {
          at: string;
          user_id: string;
        };
        Insert: {
          at: string;
          user_id: string;
        };
        Update: {
          at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      lesson_completions: {
        Row: {
          completed_at: string;
          correct: number;
          id: string;
          language: string;
          lesson_id: string;
          total: number;
          user_id: string;
          xp_earned: number;
        };
        Insert: {
          completed_at?: string;
          correct: number;
          id?: string;
          language?: string;
          lesson_id: string;
          total: number;
          user_id: string;
          xp_earned: number;
        };
        Update: {
          completed_at?: string;
          correct?: number;
          id?: string;
          language?: string;
          lesson_id?: string;
          total?: number;
          user_id?: string;
          xp_earned?: number;
        };
        Relationships: [];
      };
      lesson_heart_settlements: {
        Row: {
          charged: number;
          client_reported: number;
          credits_left: number;
          enforced: boolean;
          misses: number;
          pro: boolean;
          settled_at: string;
          token_hash: string;
          user_id: string;
          would_charge: number;
        };
        Insert: {
          charged: number;
          client_reported: number;
          credits_left: number;
          enforced: boolean;
          misses: number;
          pro: boolean;
          settled_at?: string;
          token_hash: string;
          user_id: string;
          would_charge: number;
        };
        Update: {
          charged?: number;
          client_reported?: number;
          credits_left?: number;
          enforced?: boolean;
          misses?: number;
          pro?: boolean;
          settled_at?: string;
          token_hash?: string;
          user_id?: string;
          would_charge?: number;
        };
        Relationships: [];
      };
      lesson_session_redemptions: {
        Row: {
          course: string;
          created_at: string;
          lesson_id: string;
          misses: number;
          result: NonNullable<Json>;
          settle_since: string;
          token_hash: string;
          user_id: string;
        };
        Insert: {
          course: string;
          created_at?: string;
          lesson_id: string;
          misses: number;
          result: NonNullable<Json>;
          settle_since: string;
          token_hash: string;
          user_id: string;
        };
        Update: {
          course?: string;
          created_at?: string;
          lesson_id?: string;
          misses?: number;
          result?: NonNullable<Json>;
          settle_since?: string;
          token_hash?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      lessons: {
        Row: {
          id: string;
          sort_order: number;
          subtitle: string;
          title: string;
          unit_id: string;
        };
        Insert: {
          id: string;
          sort_order: number;
          subtitle: string;
          title: string;
          unit_id: string;
        };
        Update: {
          id?: string;
          sort_order?: number;
          subtitle?: string;
          title?: string;
          unit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      levels: {
        Row: {
          blurb: string;
          id: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          blurb: string;
          id: string;
          name: string;
          sort_order: number;
        };
        Update: {
          blurb?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      listen_progress: {
        Row: {
          completed_at: string | null;
          episode_id: string;
          position_s: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          episode_id: string;
          position_s?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          episode_id?: string;
          position_s?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listen_progress_episode_id_fkey";
            columns: ["episode_id"];
            isOneToOne: false;
            referencedRelation: "podcast_episodes";
            referencedColumns: ["id"];
          },
        ];
      };
      mastered_words: {
        Row: {
          item_key: string;
          language: string;
          mastered_at: string;
          user_id: string;
        };
        Insert: {
          item_key: string;
          language: string;
          mastered_at?: string;
          user_id: string;
        };
        Update: {
          item_key?: string;
          language?: string;
          mastered_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      nudges: {
        Row: {
          created_at: string;
          id: string;
          read_at: string | null;
          recipient_id: string;
          sender_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          read_at?: string | null;
          recipient_id: string;
          sender_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          read_at?: string | null;
          recipient_id?: string;
          sender_id?: string;
        };
        Relationships: [];
      };
      ops_event_alerts: {
        Row: {
          event: string;
          last_alert_at: string;
        };
        Insert: {
          event: string;
          last_alert_at: string;
        };
        Update: {
          event?: string;
          last_alert_at?: string;
        };
        Relationships: [];
      };
      ops_events: {
        Row: {
          created_at: string;
          detail: NonNullable<Json>;
          event: string;
          id: number;
          source: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          detail?: NonNullable<Json>;
          event: string;
          id?: number;
          source: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          detail?: NonNullable<Json>;
          event?: string;
          id?: number;
          source?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      ops_health_checks: {
        Row: {
          at: string;
          latency_ms: number | null;
          ok: boolean;
          service: string;
        };
        Insert: {
          at?: string;
          latency_ms?: number | null;
          ok: boolean;
          service: string;
        };
        Update: {
          at?: string;
          latency_ms?: number | null;
          ok?: boolean;
          service?: string;
        };
        Relationships: [];
      };
      placement_questions: {
        Row: {
          answer_index: number | null;
          answer_text: string | null;
          audio_text: string | null;
          bank: Json | null;
          choices: Json | null;
          course: string;
          id: string;
          level_id: string;
          prompt: string;
          type: string;
        };
        Insert: {
          answer_index?: number | null;
          answer_text?: string | null;
          audio_text?: string | null;
          bank?: Json | null;
          choices?: Json | null;
          course: string;
          id: string;
          level_id: string;
          prompt: string;
          type?: string;
        };
        Update: {
          answer_index?: number | null;
          answer_text?: string | null;
          audio_text?: string | null;
          bank?: Json | null;
          choices?: Json | null;
          course?: string;
          id?: string;
          level_id?: string;
          prompt?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "placement_questions_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["id"];
          },
        ];
      };
      podcast_episodes: {
        Row: {
          audio_path: string;
          course: string | null;
          created_at: string;
          description: string | null;
          duration_seconds: number;
          folder_id: string;
          id: string;
          level_id: string | null;
          published: boolean;
          published_at: string | null;
          slug: string;
          sort_order: number;
          source: string;
          title: string;
          voice_model: string | null;
          voice_provider: string;
        };
        Insert: {
          audio_path: string;
          course?: string | null;
          created_at?: string;
          description?: string | null;
          duration_seconds: number;
          folder_id: string;
          id?: string;
          level_id?: string | null;
          published?: boolean;
          published_at?: string | null;
          slug: string;
          sort_order?: number;
          source: string;
          title: string;
          voice_model?: string | null;
          voice_provider?: string;
        };
        Update: {
          audio_path?: string;
          course?: string | null;
          created_at?: string;
          description?: string | null;
          duration_seconds?: number;
          folder_id?: string;
          id?: string;
          level_id?: string | null;
          published?: boolean;
          published_at?: string | null;
          slug?: string;
          sort_order?: number;
          source?: string;
          title?: string;
          voice_model?: string | null;
          voice_provider?: string;
        };
        Relationships: [
          {
            foreignKeyName: "podcast_episodes_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "podcast_folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "podcast_episodes_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["id"];
          },
        ];
      };
      podcast_folders: {
        Row: {
          course: string | null;
          cover_image_url: string | null;
          created_at: string;
          description: string | null;
          id: string;
          level_id: string | null;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          title: string;
        };
        Insert: {
          course?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          level_id?: string | null;
          parent_id?: string | null;
          slug: string;
          sort_order?: number;
          title: string;
        };
        Update: {
          course?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          level_id?: string | null;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "podcast_folders_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "podcast_folders_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "podcast_folders";
            referencedColumns: ["id"];
          },
        ];
      };
      podcast_play_events: {
        Row: {
          episode_id: string;
          id: string;
          seconds_listened: number;
          started_at: string;
          user_id: string;
        };
        Insert: {
          episode_id: string;
          id?: string;
          seconds_listened?: number;
          started_at?: string;
          user_id: string;
        };
        Update: {
          episode_id?: string;
          id?: string;
          seconds_listened?: number;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "podcast_play_events_episode_id_fkey";
            columns: ["episode_id"];
            isOneToOne: false;
            referencedRelation: "podcast_episodes";
            referencedColumns: ["id"];
          },
        ];
      };
      podcast_playback: {
        Row: {
          completed_at: string | null;
          episode_id: string;
          position_seconds: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          episode_id: string;
          position_seconds?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          completed_at?: string | null;
          episode_id?: string;
          position_seconds?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "podcast_playback_episode_id_fkey";
            columns: ["episode_id"];
            isOneToOne: false;
            referencedRelation: "podcast_episodes";
            referencedColumns: ["id"];
          },
        ];
      };
      podcast_quiz_awards: {
        Row: {
          best_correct: number;
          best_xp: number;
          episode_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          best_correct: number;
          best_xp: number;
          episode_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          best_correct?: number;
          best_xp?: number;
          episode_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "podcast_quiz_awards_episode_id_fkey";
            columns: ["episode_id"];
            isOneToOne: false;
            referencedRelation: "podcast_episodes";
            referencedColumns: ["id"];
          },
        ];
      };
      podcast_quiz_questions: {
        Row: {
          answer_index: number;
          choices: NonNullable<Json>;
          episode_id: string;
          id: string;
          prompt: string;
          sort_order: number;
        };
        Insert: {
          answer_index: number;
          choices: NonNullable<Json>;
          episode_id: string;
          id: string;
          prompt: string;
          sort_order: number;
        };
        Update: {
          answer_index?: number;
          choices?: NonNullable<Json>;
          episode_id?: string;
          id?: string;
          prompt?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "podcast_quiz_questions_episode_id_fkey";
            columns: ["episode_id"];
            isOneToOne: false;
            referencedRelation: "podcast_episodes";
            referencedColumns: ["id"];
          },
        ];
      };
      podcast_transcripts: {
        Row: {
          created_at: string;
          episode_id: string;
          text: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          episode_id: string;
          text: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          episode_id?: string;
          text?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "podcast_transcripts_episode_id_fkey";
            columns: ["episode_id"];
            isOneToOne: true;
            referencedRelation: "podcast_episodes";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_calls: {
        Row: {
          course: string;
          english_replies: number;
          finished_at: string | null;
          id: string;
          item_key: string;
          kind: string;
          last_reply_at: string;
          recap_at: string | null;
          recap_claimed_at: string | null;
          replies: number;
          right_replies: number;
          short_replies: number;
          stars: number | null;
          started_at: string;
          user_id: string;
        };
        Insert: {
          course: string;
          english_replies?: number;
          finished_at?: string | null;
          id: string;
          item_key: string;
          kind: string;
          last_reply_at?: string;
          recap_at?: string | null;
          recap_claimed_at?: string | null;
          replies?: number;
          right_replies?: number;
          short_replies?: number;
          stars?: number | null;
          started_at?: string;
          user_id: string;
        };
        Update: {
          course?: string;
          english_replies?: number;
          finished_at?: string | null;
          id?: string;
          item_key?: string;
          kind?: string;
          last_reply_at?: string;
          recap_at?: string | null;
          recap_claimed_at?: string | null;
          replies?: number;
          right_replies?: number;
          short_replies?: number;
          stars?: number | null;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      practice_stars: {
        Row: {
          best_stars: number;
          course: string;
          item_key: string;
          kind: string;
          last_played_at: string;
          plays: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          best_stars: number;
          course: string;
          item_key: string;
          kind: string;
          last_played_at?: string;
          plays?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          best_stars?: number;
          course?: string;
          item_key?: string;
          kind?: string;
          last_played_at?: string;
          plays?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      pro_grants: {
        Row: {
          ends_at: string;
          granted_by: string | null;
          id: string;
          reason: string;
          revoked_at: string | null;
          revoked_by: string | null;
          starts_at: string;
          user_id: string;
        };
        Insert: {
          ends_at: string;
          granted_by?: string | null;
          id?: string;
          reason: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          starts_at?: string;
          user_id: string;
        };
        Update: {
          ends_at?: string;
          granted_by?: string | null;
          id?: string;
          reason?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          starts_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          ai_consent_at: string | null;
          avatar_seed: string;
          country: string | null;
          created_at: string;
          display_name: string;
          id: string;
          name_confirmed_at: string | null;
          theme: string | null;
          updated_at: string;
        };
        Insert: {
          ai_consent_at?: string | null;
          avatar_seed?: string;
          country?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          name_confirmed_at?: string | null;
          theme?: string | null;
          updated_at?: string;
        };
        Update: {
          ai_consent_at?: string | null;
          avatar_seed?: string;
          country?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          name_confirmed_at?: string | null;
          theme?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          answer_index: number | null;
          answer_text: string | null;
          bank: Json | null;
          choices: Json | null;
          explanation: string;
          goal_variants: Json | null;
          id: string;
          lesson_id: string;
          prompt: string;
          sort_order: number;
          type: string;
        };
        Insert: {
          answer_index?: number | null;
          answer_text?: string | null;
          bank?: Json | null;
          choices?: Json | null;
          explanation: string;
          goal_variants?: Json | null;
          id: string;
          lesson_id: string;
          prompt: string;
          sort_order: number;
          type: string;
        };
        Update: {
          answer_index?: number | null;
          answer_text?: string | null;
          bank?: Json | null;
          choices?: Json | null;
          explanation?: string;
          goal_variants?: Json | null;
          id?: string;
          lesson_id?: string;
          prompt?: string;
          sort_order?: number;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      referrals: {
        Row: {
          capped: boolean;
          completed_at: string | null;
          created_at: string;
          id: string;
          note: string | null;
          referee_id: string;
          referrer_id: string;
          reward_granted: boolean;
          reward_kind: string;
          status: string;
        };
        Insert: {
          capped?: boolean;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          referee_id: string;
          referrer_id: string;
          reward_granted?: boolean;
          reward_kind?: string;
          status?: string;
        };
        Update: {
          capped?: boolean;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          referee_id?: string;
          referrer_id?: string;
          reward_granted?: boolean;
          reward_kind?: string;
          status?: string;
        };
        Relationships: [];
      };
      rehearsal_free_used: {
        Row: {
          used_at: string;
          user_id: string;
        };
        Insert: {
          used_at?: string;
          user_id: string;
        };
        Update: {
          used_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      rehearsal_runs: {
        Row: {
          corrections: string[];
          finished_at: string;
          id: string;
          moments_shown: string[];
          practice_call_id: string | null;
          rehearsal_id: string;
          stage: string;
          user_id: string;
          went_well: string[];
        };
        Insert: {
          corrections?: string[];
          finished_at?: string;
          id?: string;
          moments_shown?: string[];
          practice_call_id?: string | null;
          rehearsal_id: string;
          stage: string;
          user_id: string;
          went_well?: string[];
        };
        Update: {
          corrections?: string[];
          finished_at?: string;
          id?: string;
          moments_shown?: string[];
          practice_call_id?: string | null;
          rehearsal_id?: string;
          stage?: string;
          user_id?: string;
          went_well?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "rehearsal_runs_practice_call_id_fkey";
            columns: ["practice_call_id"];
            isOneToOne: false;
            referencedRelation: "practice_calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rehearsal_runs_rehearsal_id_fkey";
            columns: ["rehearsal_id"];
            isOneToOne: false;
            referencedRelation: "rehearsals";
            referencedColumns: ["id"];
          },
        ];
      };
      rehearsals: {
        Row: {
          brief: NonNullable<Json>;
          closed_at: string | null;
          counterpart: string;
          course: string;
          created_at: string;
          event_date: string | null;
          event_kind: string;
          free: boolean;
          id: string;
          outcome: Json | null;
          status: string;
          user_id: string;
          worries: string | null;
        };
        Insert: {
          brief: NonNullable<Json>;
          closed_at?: string | null;
          counterpart: string;
          course: string;
          created_at?: string;
          event_date?: string | null;
          event_kind: string;
          free: boolean;
          id?: string;
          outcome?: Json | null;
          status?: string;
          user_id: string;
          worries?: string | null;
        };
        Update: {
          brief?: NonNullable<Json>;
          closed_at?: string | null;
          counterpart?: string;
          course?: string;
          created_at?: string;
          event_date?: string | null;
          event_kind?: string;
          free?: boolean;
          id?: string;
          outcome?: Json | null;
          status?: string;
          user_id?: string;
          worries?: string | null;
        };
        Relationships: [];
      };
      revenuecat_erasure_pending: {
        Row: {
          app_user_id: string;
          attempts: number;
          created_at: string;
          last_attempt_at: string | null;
        };
        Insert: {
          app_user_id: string;
          attempts?: number;
          created_at?: string;
          last_attempt_at?: string | null;
        };
        Update: {
          app_user_id?: string;
          attempts?: number;
          created_at?: string;
          last_attempt_at?: string | null;
        };
        Relationships: [];
      };
      review_grade_attempts: {
        Row: {
          attempt_id: string;
          created_at: string;
          item_key: string;
          language: string;
          result: NonNullable<Json>;
          user_id: string;
        };
        Insert: {
          attempt_id: string;
          created_at?: string;
          item_key: string;
          language: string;
          result: NonNullable<Json>;
          user_id: string;
        };
        Update: {
          attempt_id?: string;
          created_at?: string;
          item_key?: string;
          language?: string;
          result?: NonNullable<Json>;
          user_id?: string;
        };
        Relationships: [];
      };
      review_items: {
        Row: {
          answer_index: number | null;
          choices: Json | null;
          created_at: string;
          due_on: string;
          ease: number;
          explanation: string | null;
          id: string;
          interval_days: number;
          item_key: string;
          language: string;
          lapses: number;
          last_reviewed_at: string | null;
          lesson_id: string;
          level: string;
          prompt: string | null;
          repetitions: number;
          saved_context: string | null;
          saved_word: string | null;
          source: string;
          updated_at: string;
          user_id: string;
          weakness_display: string | null;
          weakness_label: string | null;
        };
        Insert: {
          answer_index?: number | null;
          choices?: Json | null;
          created_at?: string;
          due_on?: string;
          ease?: number;
          explanation?: string | null;
          id?: string;
          interval_days?: number;
          item_key: string;
          language?: string;
          lapses?: number;
          last_reviewed_at?: string | null;
          lesson_id: string;
          level?: string;
          prompt?: string | null;
          repetitions?: number;
          saved_context?: string | null;
          saved_word?: string | null;
          source?: string;
          updated_at?: string;
          user_id: string;
          weakness_display?: string | null;
          weakness_label?: string | null;
        };
        Update: {
          answer_index?: number | null;
          choices?: Json | null;
          created_at?: string;
          due_on?: string;
          ease?: number;
          explanation?: string | null;
          id?: string;
          interval_days?: number;
          item_key?: string;
          language?: string;
          lapses?: number;
          last_reviewed_at?: string | null;
          lesson_id?: string;
          level?: string;
          prompt?: string | null;
          repetitions?: number;
          saved_context?: string | null;
          saved_word?: string | null;
          source?: string;
          updated_at?: string;
          user_id?: string;
          weakness_display?: string | null;
          weakness_label?: string | null;
        };
        Relationships: [];
      };
      scenarios: {
        Row: {
          blurb: string;
          emoji: string;
          id: string;
          level: string;
          opener: string;
          system_prompt: string;
          title: string;
        };
        Insert: {
          blurb: string;
          emoji: string;
          id: string;
          level: string;
          opener: string;
          system_prompt: string;
          title: string;
        };
        Update: {
          blurb?: string;
          emoji?: string;
          id?: string;
          level?: string;
          opener?: string;
          system_prompt?: string;
          title?: string;
        };
        Relationships: [];
      };
      season_cohort_members: {
        Row: {
          cohort_id: string;
          user_id: string;
        };
        Insert: {
          cohort_id: string;
          user_id: string;
        };
        Update: {
          cohort_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "season_cohort_members_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "season_cohorts";
            referencedColumns: ["id"];
          },
        ];
      };
      season_cohorts: {
        Row: {
          division: number;
          id: string;
          resolved_at: string | null;
          week_start: string;
        };
        Insert: {
          division: number;
          id?: string;
          resolved_at?: string | null;
          week_start: string;
        };
        Update: {
          division?: number;
          id?: string;
          resolved_at?: string | null;
          week_start?: string;
        };
        Relationships: [];
      };
      season_placements: {
        Row: {
          cohort_size: number;
          division: number;
          rank_in_cohort: number;
          user_id: string;
          week_start: string;
        };
        Insert: {
          cohort_size: number;
          division: number;
          rank_in_cohort: number;
          user_id: string;
          week_start: string;
        };
        Update: {
          cohort_size?: number;
          division?: number;
          rank_in_cohort?: number;
          user_id?: string;
          week_start?: string;
        };
        Relationships: [];
      };
      signup_attribution: {
        Row: {
          created_at: string;
          landed_at: string | null;
          user_id: string;
          utm_campaign: string | null;
          utm_medium: string | null;
          utm_source: string | null;
        };
        Insert: {
          created_at?: string;
          landed_at?: string | null;
          user_id: string;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
        };
        Update: {
          created_at?: string;
          landed_at?: string | null;
          user_id?: string;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
        };
        Relationships: [];
      };
      skill_days: {
        Row: {
          day: string;
          right_answers: number;
          skill: string;
          total_answers: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          day: string;
          right_answers?: number;
          skill: string;
          total_answers?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          day?: string;
          right_answers?: number;
          skill?: string;
          total_answers?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      speech_days: {
        Row: {
          day: string;
          speech_seconds: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          day: string;
          speech_seconds?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          day?: string;
          speech_seconds?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      staff_audit_log: {
        Row: {
          action: string;
          actor_role: string;
          actor_user_id: string | null;
          after: Json | null;
          at: string;
          before: Json | null;
          id: number;
          ip_hash: string | null;
          reason: string | null;
          request_id: string | null;
          target_user_id: string | null;
        };
        Insert: {
          action: string;
          actor_role: string;
          actor_user_id?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          id?: never;
          ip_hash?: string | null;
          reason?: string | null;
          request_id?: string | null;
          target_user_id?: string | null;
        };
        Update: {
          action?: string;
          actor_role?: string;
          actor_user_id?: string | null;
          after?: Json | null;
          at?: string;
          before?: Json | null;
          id?: never;
          ip_hash?: string | null;
          reason?: string | null;
          request_id?: string | null;
          target_user_id?: string | null;
        };
        Relationships: [];
      };
      staff_notes: {
        Row: {
          author_id: string | null;
          body: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          author_id?: string | null;
          body: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      staff_rate_limits: {
        Row: {
          actor_user_id: string;
          bucket: string;
          count: number;
          window_start: string;
        };
        Insert: {
          actor_user_id: string;
          bucket: string;
          count?: number;
          window_start: string;
        };
        Update: {
          actor_user_id?: string;
          bucket?: string;
          count?: number;
          window_start?: string;
        };
        Relationships: [];
      };
      staff_roles: {
        Row: {
          added_at: string;
          added_by: string | null;
          disabled_at: string | null;
          role: string;
          scopes: string[];
          user_id: string;
        };
        Insert: {
          added_at?: string;
          added_by?: string | null;
          disabled_at?: string | null;
          role: string;
          scopes?: string[];
          user_id: string;
        };
        Update: {
          added_at?: string;
          added_by?: string | null;
          disabled_at?: string | null;
          role?: string;
          scopes?: string[];
          user_id?: string;
        };
        Relationships: [];
      };
      stories: {
        Row: {
          audio_path: string | null;
          branching: boolean;
          course: string;
          created_at: string;
          id: string;
          level_id: string;
          needs_review: boolean;
          nodes: Json | null;
          published: boolean;
          published_at: string | null;
          segments: NonNullable<Json>;
          slug: string;
          sort_order: number;
          title: string;
        };
        Insert: {
          audio_path?: string | null;
          branching?: boolean;
          course: string;
          created_at?: string;
          id?: string;
          level_id: string;
          needs_review?: boolean;
          nodes?: Json | null;
          published?: boolean;
          published_at?: string | null;
          segments: NonNullable<Json>;
          slug: string;
          sort_order?: number;
          title: string;
        };
        Update: {
          audio_path?: string | null;
          branching?: boolean;
          course?: string;
          created_at?: string;
          id?: string;
          level_id?: string;
          needs_review?: boolean;
          nodes?: Json | null;
          published?: boolean;
          published_at?: string | null;
          segments?: NonNullable<Json>;
          slug?: string;
          sort_order?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stories_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["id"];
          },
        ];
      };
      story_progress: {
        Row: {
          best_correct: number | null;
          check_total: number | null;
          completed_at: string | null;
          endings_found: NonNullable<Json>;
          reading_credited: boolean;
          segment_index: number;
          story_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          best_correct?: number | null;
          check_total?: number | null;
          completed_at?: string | null;
          endings_found?: NonNullable<Json>;
          reading_credited?: boolean;
          segment_index?: number;
          story_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          best_correct?: number | null;
          check_total?: number | null;
          completed_at?: string | null;
          endings_found?: NonNullable<Json>;
          reading_credited?: boolean;
          segment_index?: number;
          story_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "story_progress_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
        ];
      };
      story_quiz_questions: {
        Row: {
          answer_index: number;
          choices: NonNullable<Json>;
          id: string;
          position: number;
          prompt: string;
          story_id: string;
        };
        Insert: {
          answer_index: number;
          choices: NonNullable<Json>;
          id?: string;
          position: number;
          prompt: string;
          story_id: string;
        };
        Update: {
          answer_index?: number;
          choices?: NonNullable<Json>;
          id?: string;
          position?: number;
          prompt?: string;
          story_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "story_quiz_questions_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
        ];
      };
      streak_freeze_gifts: {
        Row: {
          created_at: string;
          gift_day: string;
          id: string;
          read_at: string | null;
          recipient_id: string;
          sender_id: string;
        };
        Insert: {
          created_at?: string;
          gift_day?: string;
          id?: string;
          read_at?: string | null;
          recipient_id: string;
          sender_id: string;
        };
        Update: {
          created_at?: string;
          gift_day?: string;
          id?: string;
          read_at?: string | null;
          recipient_id?: string;
          sender_id?: string;
        };
        Relationships: [];
      };
      support_conversations: {
        Row: {
          ai_summary: string | null;
          assigned_to: string | null;
          channel: string;
          created_at: string;
          handed_off_at: string | null;
          handoff_reason: string | null;
          id: string;
          learner_last_read_at: string | null;
          solved_at: string | null;
          status: string;
          ticket_no: number | null;
          topic: string | null;
          updated_at: string;
          urgent: boolean;
          user_id: string;
        };
        Insert: {
          ai_summary?: string | null;
          assigned_to?: string | null;
          channel?: string;
          created_at?: string;
          handed_off_at?: string | null;
          handoff_reason?: string | null;
          id?: string;
          learner_last_read_at?: string | null;
          solved_at?: string | null;
          status?: string;
          ticket_no?: number | null;
          topic?: string | null;
          updated_at?: string;
          urgent?: boolean;
          user_id: string;
        };
        Update: {
          ai_summary?: string | null;
          assigned_to?: string | null;
          channel?: string;
          created_at?: string;
          handed_off_at?: string | null;
          handoff_reason?: string | null;
          id?: string;
          learner_last_read_at?: string | null;
          solved_at?: string | null;
          status?: string;
          ticket_no?: number | null;
          topic?: string | null;
          updated_at?: string;
          urgent?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
      support_digest_seen: {
        Row: {
          conversation_id: string;
          seen_at: string;
        };
        Insert: {
          conversation_id: string;
          seen_at?: string;
        };
        Update: {
          conversation_id?: string;
          seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_digest_seen_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: true;
            referencedRelation: "support_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      support_messages: {
        Row: {
          ai_facts: Json | null;
          author_id: string | null;
          author_kind: string;
          body: string;
          client_id: string | null;
          conversation_id: string;
          created_at: string;
          id: number;
          user_id: string;
        };
        Insert: {
          ai_facts?: Json | null;
          author_id?: string | null;
          author_kind: string;
          body: string;
          client_id?: string | null;
          conversation_id: string;
          created_at?: string;
          id?: never;
          user_id: string;
        };
        Update: {
          ai_facts?: Json | null;
          author_id?: string | null;
          author_kind?: string;
          body?: string;
          client_id?: string | null;
          conversation_id?: string;
          created_at?: string;
          id?: never;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "support_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      support_notes: {
        Row: {
          author_id: string;
          body: string;
          conversation_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          author_id: string;
          body: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_notes_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "support_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      support_notify_queue: {
        Row: {
          attempts: number;
          conversation_id: string;
          delivered_at: string | null;
          email_sent_at: string | null;
          gave_up_at: string | null;
          id: number;
          last_attempt_at: string | null;
          message_id: number;
          push_sent_at: string | null;
          queued_at: string;
        };
        Insert: {
          attempts?: number;
          conversation_id: string;
          delivered_at?: string | null;
          email_sent_at?: string | null;
          gave_up_at?: string | null;
          id?: never;
          last_attempt_at?: string | null;
          message_id: number;
          push_sent_at?: string | null;
          queued_at?: string;
        };
        Update: {
          attempts?: number;
          conversation_id?: string;
          delivered_at?: string | null;
          email_sent_at?: string | null;
          gave_up_at?: string | null;
          id?: never;
          last_attempt_at?: string | null;
          message_id?: number;
          push_sent_at?: string | null;
          queued_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_notify_queue_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "support_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_notify_queue_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "support_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      team_kicks: {
        Row: {
          kicked_at: string;
          team_id: string;
          user_id: string;
        };
        Insert: {
          kicked_at?: string;
          team_id: string;
          user_id: string;
        };
        Update: {
          kicked_at?: string;
          team_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_kicks_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_members: {
        Row: {
          joined_at: string;
          team_id: string;
          user_id: string;
        };
        Insert: {
          joined_at?: string;
          team_id: string;
          user_id: string;
        };
        Update: {
          joined_at?: string;
          team_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_mission_rewards: {
        Row: {
          granted_at: string;
          team_id: string;
          user_id: string;
          week_start: string;
          xp: number;
        };
        Insert: {
          granted_at?: string;
          team_id: string;
          user_id: string;
          week_start: string;
          xp: number;
        };
        Update: {
          granted_at?: string;
          team_id?: string;
          user_id?: string;
          week_start?: string;
          xp?: number;
        };
        Relationships: [
          {
            foreignKeyName: "team_mission_rewards_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_missions: {
        Row: {
          created_at: string;
          member_count: number;
          rewarded_at: string | null;
          target: number;
          team_id: string;
          week_start: string;
        };
        Insert: {
          created_at?: string;
          member_count: number;
          rewarded_at?: string | null;
          target: number;
          team_id: string;
          week_start: string;
        };
        Update: {
          created_at?: string;
          member_count?: number;
          rewarded_at?: string | null;
          target?: number;
          team_id?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_missions_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_name_migration_backup: {
        Row: {
          migrated_at: string;
          new_name: string;
          old_name: string;
          team_id: string;
        };
        Insert: {
          migrated_at?: string;
          new_name: string;
          old_name: string;
          team_id: string;
        };
        Update: {
          migrated_at?: string;
          new_name?: string;
          old_name?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_name_migration_backup_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: true;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_weekly_rewards: {
        Row: {
          resolved_at: string | null;
          team_id: string;
          week_start: string;
        };
        Insert: {
          resolved_at?: string | null;
          team_id: string;
          week_start: string;
        };
        Update: {
          resolved_at?: string | null;
          team_id?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_weekly_rewards_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          join_code: string;
          member_cap: number;
          name: string;
          visibility: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          join_code: string;
          member_cap?: number;
          name: string;
          visibility: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          join_code?: string;
          member_cap?: number;
          name?: string;
          visibility?: string;
        };
        Relationships: [];
      };
      trial_reminder_checked: {
        Row: {
          checked_at: string;
          user_id: string;
        };
        Insert: {
          checked_at: string;
          user_id: string;
        };
        Update: {
          checked_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      trial_reminders: {
        Row: {
          claimed_at: string;
          trial_ends_at: string;
          user_id: string;
        };
        Insert: {
          claimed_at?: string;
          trial_ends_at: string;
          user_id: string;
        };
        Update: {
          claimed_at?: string;
          trial_ends_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      tutor_memory: {
        Row: {
          call_id: string | null;
          course: string;
          created_at: string;
          detail: string | null;
          id: string;
          kind: string;
          last_seen_at: string;
          memory_key: string;
          review_key: string | null;
          seen_count: number;
          text: string;
          user_id: string;
        };
        Insert: {
          call_id?: string | null;
          course: string;
          created_at?: string;
          detail?: string | null;
          id?: string;
          kind: string;
          last_seen_at?: string;
          memory_key: string;
          review_key?: string | null;
          seen_count?: number;
          text: string;
          user_id: string;
        };
        Update: {
          call_id?: string | null;
          course?: string;
          created_at?: string;
          detail?: string | null;
          id?: string;
          kind?: string;
          last_seen_at?: string;
          memory_key?: string;
          review_key?: string | null;
          seen_count?: number;
          text?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      units: {
        Row: {
          course: string;
          description: string;
          eyebrow: string;
          id: string;
          level_id: string;
          sort_order: number;
          title: string;
        };
        Insert: {
          course: string;
          description: string;
          eyebrow: string;
          id: string;
          level_id: string;
          sort_order: number;
          title: string;
        };
        Update: {
          course?: string;
          description?: string;
          eyebrow?: string;
          id?: string;
          level_id?: string;
          sort_order?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "units_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["id"];
          },
        ];
      };
      user_achievements: {
        Row: {
          achievement_id: string;
          progress: number;
          unlocked_at: string;
          user_id: string;
        };
        Insert: {
          achievement_id: string;
          progress?: number;
          unlocked_at?: string;
          user_id: string;
        };
        Update: {
          achievement_id?: string;
          progress?: number;
          unlocked_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
        ];
      };
      user_progress: {
        Row: {
          cefr_level: string;
          day_basis: string;
          hearts: number;
          hearts_refill_at: string | null;
          last_active_date: string | null;
          last_review_bonus_date: string | null;
          league_tier: string;
          longest_streak: number;
          placement_level: string | null;
          placement_score: number | null;
          placement_taken_at: string | null;
          streak: number;
          streak_freezes: number;
          updated_at: string;
          user_id: string;
          xp: number;
        };
        Insert: {
          cefr_level?: string;
          day_basis?: string;
          hearts?: number;
          hearts_refill_at?: string | null;
          last_active_date?: string | null;
          last_review_bonus_date?: string | null;
          league_tier?: string;
          longest_streak?: number;
          placement_level?: string | null;
          placement_score?: number | null;
          placement_taken_at?: string | null;
          streak?: number;
          streak_freezes?: number;
          updated_at?: string;
          user_id: string;
          xp?: number;
        };
        Update: {
          cefr_level?: string;
          day_basis?: string;
          hearts?: number;
          hearts_refill_at?: string | null;
          last_active_date?: string | null;
          last_review_bonus_date?: string | null;
          league_tier?: string;
          longest_streak?: number;
          placement_level?: string | null;
          placement_score?: number | null;
          placement_taken_at?: string | null;
          streak?: number;
          streak_freezes?: number;
          updated_at?: string;
          user_id?: string;
          xp?: number;
        };
        Relationships: [];
      };
      user_restrictions: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          kind: string;
          lifted_at: string | null;
          lifted_by: string | null;
          reason: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind: string;
          lifted_at?: string | null;
          lifted_by?: string | null;
          reason: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind?: string;
          lifted_at?: string | null;
          lifted_by?: string | null;
          reason?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_weekly_quest_claims: {
        Row: {
          claimed_at: string;
          course: string | null;
          quest_id: string;
          user_id: string;
          week_start: string;
        };
        Insert: {
          claimed_at?: string;
          course?: string | null;
          quest_id: string;
          user_id: string;
          week_start: string;
        };
        Update: {
          claimed_at?: string;
          course?: string | null;
          quest_id?: string;
          user_id?: string;
          week_start?: string;
        };
        Relationships: [];
      };
      video_watches: {
        Row: {
          completed_at: string | null;
          progress_seconds: number;
          updated_at: string;
          user_id: string;
          video_id: string;
        };
        Insert: {
          completed_at?: string | null;
          progress_seconds?: number;
          updated_at?: string;
          user_id: string;
          video_id: string;
        };
        Update: {
          completed_at?: string | null;
          progress_seconds?: number;
          updated_at?: string;
          user_id?: string;
          video_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "video_watches_video_id_fkey";
            columns: ["video_id"];
            isOneToOne: false;
            referencedRelation: "videos";
            referencedColumns: ["id"];
          },
        ];
      };
      videos: {
        Row: {
          captions_path: string | null;
          course: string;
          created_at: string;
          description: string | null;
          duration_seconds: number;
          id: string;
          level_id: string | null;
          poster_path: string | null;
          practice_id: string | null;
          practice_kind: string | null;
          published: boolean;
          published_at: string | null;
          slug: string;
          sort_order: number;
          tags: string[];
          title: string;
          video_path: string;
        };
        Insert: {
          captions_path?: string | null;
          course: string;
          created_at?: string;
          description?: string | null;
          duration_seconds: number;
          id?: string;
          level_id?: string | null;
          poster_path?: string | null;
          practice_id?: string | null;
          practice_kind?: string | null;
          published?: boolean;
          published_at?: string | null;
          slug: string;
          sort_order?: number;
          tags?: string[];
          title: string;
          video_path: string;
        };
        Update: {
          captions_path?: string | null;
          course?: string;
          created_at?: string;
          description?: string | null;
          duration_seconds?: number;
          id?: string;
          level_id?: string | null;
          poster_path?: string | null;
          practice_id?: string | null;
          practice_kind?: string | null;
          published?: boolean;
          published_at?: string | null;
          slug?: string;
          sort_order?: number;
          tags?: string[];
          title?: string;
          video_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "videos_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["id"];
          },
        ];
      };
      vocab_images: {
        Row: {
          alt: string;
          credit: string;
          term: string;
          url: string;
        };
        Insert: {
          alt: string;
          credit: string;
          term: string;
          url: string;
        };
        Update: {
          alt?: string;
          credit?: string;
          term?: string;
          url?: string;
        };
        Relationships: [];
      };
      weakness_events: {
        Row: {
          category: string;
          course: string;
          created_at: string;
          event_type: string;
          id: string;
          user_id: string;
        };
        Insert: {
          category: string;
          course?: string;
          created_at?: string;
          event_type: string;
          id?: string;
          user_id: string;
        };
        Update: {
          category?: string;
          course?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      weekly_quests: {
        Row: {
          description: string;
          icon: string;
          id: string;
          metric: string;
          sort_order: number;
          target: number;
          title: string;
          xp_reward: number;
        };
        Insert: {
          description: string;
          icon: string;
          id: string;
          metric: string;
          sort_order?: number;
          target: number;
          title: string;
          xp_reward: number;
        };
        Update: {
          description?: string;
          icon?: string;
          id?: string;
          metric?: string;
          sort_order?: number;
          target?: number;
          title?: string;
          xp_reward?: number;
        };
        Relationships: [];
      };
      weekly_xp_totals: {
        Row: {
          user_id: string;
          week_start: string;
          xp: number;
        };
        Insert: {
          user_id: string;
          week_start: string;
          xp?: number;
        };
        Update: {
          user_id?: string;
          week_start?: string;
          xp?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _buddy_count: { Args: { _from: string; _to: string; _user: string }; Returns: number };
      _cefr_rank: { Args: { _level: string }; Returns: number };
      _create_buddy_pair: { Args: { _source: string; _x: string; _y: string }; Returns: string };
      _end_buddy_pair_between: {
        Args: { _reason: string; _x: string; _y: string };
        Returns: undefined;
      };
      _join_team_impl: {
        Args: { _me: string; _team_id: string };
        Returns: {
          ok: boolean;
          reason: string;
          team_id: string;
        }[];
      };
      _lock_buddy_users: { Args: { _x: string; _y: string }; Returns: undefined };
      _my_team_id: { Args: Record<PropertyKey, never>; Returns: string };
      _new_join_code: { Args: Record<PropertyKey, never>; Returns: string };
      _pay_weekly_challenge: {
        Args: { _language: string; _template_id: string; _user_id: string; _week_start: string };
        Returns: boolean;
      };
      _random_team_name: { Args: Record<PropertyKey, never>; Returns: string };
      _reset_failing_public_names: {
        Args: { _approved_names: number; _approved_teams: number };
        Returns: {
          names_reset: number;
          teams_reset: number;
        }[];
      };
      _resolve_buddy_pair: { Args: { _pair: string }; Returns: undefined };
      _resolve_team_mission: { Args: { _team: string; _wk: string }; Returns: undefined };
      _safe_random_team_name: { Args: Record<PropertyKey, never>; Returns: string };
      _settle_challenge_week: { Args: { _cap: number; _week: string }; Returns: number };
      _team_mission_count: {
        Args: { _team: string; _user?: string; _wk: string };
        Returns: number;
      };
      accept_friend_invite: {
        Args: { _code: string };
        Returns: {
          message: string;
          ok: boolean;
        }[];
      };
      add_learning_seconds: {
        Args: { _lesson_seconds: number; _practice_seconds: number; _user_id: string };
        Returns: string;
      };
      add_skill_results: { Args: { _results: Json; _user_id: string }; Returns: number };
      add_speech_seconds: { Args: { _seconds: number; _user_id: string }; Returns: string };
      adjust_rehearsal: {
        Args: {
          _brief: Json;
          _counterpart: string;
          _event_date: string;
          _event_kind: string;
          _id: string;
          _user_id: string;
          _worries: string;
        };
        Returns: {
          brief: NonNullable<Json>;
          closed_at: string | null;
          counterpart: string;
          course: string;
          created_at: string;
          event_date: string | null;
          event_kind: string;
          free: boolean;
          id: string;
          outcome: Json | null;
          status: string;
          user_id: string;
          worries: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "rehearsals";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_ai_cost: { Args: { p_days: number; p_heavy_micro: number }; Returns: Json };
      admin_ai_cost_capped: { Args: { p_free_micro: number; p_pro_micro: number }; Returns: Json };
      admin_numbers_growth: { Args: { p_days: number }; Returns: Json };
      admin_numbers_own: { Args: { p_days: number }; Returns: Json };
      admin_rename_team: { Args: { _name: string; _team_id: string }; Returns: string };
      admin_reset_display_name: { Args: { _user_id: string }; Returns: string };
      ai_cost_day_report: { Args: { p_day: string; p_user_micro: number }; Returns: Json };
      ai_cost_union: {
        Args: { p_since: string };
        Returns: {
          u_calls: number;
          u_day: string;
          u_hits: number;
          u_kind: string;
          u_micro: number;
          u_unpriced: number;
          u_user: string;
          u_vendor: string;
        }[];
      };
      ai_output_blocked: { Args: { _texts: string[] }; Returns: boolean[] };
      apply_lesson_completion: {
        Args: {
          _activity_events: Json;
          _course: string;
          _expected: Json;
          _lesson_id: string;
          _level: string;
          _missed_question_ids: Json;
          _next: Json;
          _today: string;
          _user_id: string;
        };
        Returns: Json;
      };
      apply_lesson_completion_once: {
        Args: {
          _activity_events: Json;
          _course: string;
          _expected: Json;
          _lesson_id: string;
          _level: string;
          _missed_question_ids: Json;
          _misses: number;
          _next: Json;
          _result: Json;
          _settle_since: string;
          _today: string;
          _token_hash: string;
          _user_id: string;
        };
        Returns: Json;
      };
      apply_review_grade: {
        Args: {
          _attempt_id: string;
          _correct: boolean;
          _ease: number;
          _expected_due_on: string;
          _expected_last_reviewed_at: string;
          _interval_days: number;
          _item_key: string;
          _language: string;
          _lapses: number;
          _new_due_on: string;
          _repetitions: number;
          _retired: boolean;
          _user_id: string;
        };
        Returns: Json;
      };
      auto_join_team: {
        Args: Record<PropertyKey, never>;
        Returns: {
          ok: boolean;
          reason: string;
          team_id: string;
        }[];
      };
      block_user: {
        Args: { _target: string };
        Returns: {
          message: string;
          ok: boolean;
        }[];
      };
      blocked_moderation_terms: { Args: Record<PropertyKey, never>; Returns: string[] };
      buy_heart_with_xp: {
        Args: { _course: string };
        Returns: {
          hearts: number;
          ok: boolean;
          reason: string;
          xp: number;
        }[];
      };
      buy_streak_freeze_with_xp: {
        Args: { _course: string };
        Returns: {
          ok: boolean;
          reason: string;
          streak_freezes: number;
          xp: number;
        }[];
      };
      cancel_buddy_request: {
        Args: { _request: string };
        Returns: {
          status: string;
        }[];
      };
      cancel_rehearsal: {
        Args: { _id: string; _user_id: string };
        Returns: {
          brief: NonNullable<Json>;
          closed_at: string | null;
          counterpart: string;
          course: string;
          created_at: string;
          event_date: string | null;
          event_kind: string;
          free: boolean;
          id: string;
          outcome: Json | null;
          status: string;
          user_id: string;
          worries: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "rehearsals";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      claim_ai_cost_alert_day: { Args: { p_day: string }; Returns: boolean };
      claim_call_recap: { Args: { _call_id: string; _user_id: string }; Returns: boolean };
      claim_device_token: { Args: { _platform: string; _token: string }; Returns: undefined };
      claim_hector_call: { Args: { _call_id: string; _user_id: string }; Returns: string };
      claim_referral: {
        Args: { _code: string };
        Returns: {
          ok: boolean;
          reason: string;
        }[];
      };
      claim_review_clear_bonus: {
        Args: { _course: string };
        Returns: {
          granted: boolean;
          hearts: number;
        }[];
      };
      claim_weekly_quest: {
        Args: { _course: string; _quest_id: string; _week_start: string };
        Returns: {
          ok: boolean;
          reason: string;
          xp: number;
        }[];
      };
      close_rehearsal: {
        Args: { _id: string; _memory_text: string; _outcome: Json; _user_id: string };
        Returns: {
          brief: NonNullable<Json>;
          closed_at: string | null;
          counterpart: string;
          course: string;
          created_at: string;
          event_date: string | null;
          event_kind: string;
          free: boolean;
          id: string;
          outcome: Json | null;
          status: string;
          user_id: string;
          worries: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "rehearsals";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      complete_hector_call: { Args: { _call_id: string; _user_id: string }; Returns: boolean };
      confirm_display_name: { Args: { _name: string }; Returns: string };
      consume_ai_quota: {
        Args: { _kind: string };
        Returns: {
          allowed: boolean;
          quota: number;
          used: number;
        }[];
      };
      consume_ai_rate_limit: {
        Args: { _kind: string };
        Returns: {
          allowed: boolean;
          count: number;
          per_minute_limit: number;
        }[];
      };
      consume_hector_turn_use: {
        Args: { p_expires_at: string; p_max: number; p_part: number; p_sig_hash: string };
        Returns: boolean;
      };
      consume_lesson_completion_slot: {
        Args: { _at: string; _limit?: number; _user_id: string };
        Returns: boolean;
      };
      consume_staff_rate_limit: {
        Args: { p_actor: string; p_bucket: string; p_max: number; p_window_seconds: number };
        Returns: boolean;
      };
      contains_blocked_term: { Args: { input: string }; Returns: boolean };
      create_duel: {
        Args: { _course?: string; _opponent_id: string };
        Returns: {
          duel_id: string;
          ok: boolean;
          reason: string;
        }[];
      };
      create_rehearsal: {
        Args: {
          _brief: Json;
          _counterpart: string;
          _course: string;
          _event_date: string;
          _event_kind: string;
          _free: boolean;
          _user_id: string;
          _worries: string;
        };
        Returns: {
          brief: NonNullable<Json>;
          closed_at: string | null;
          counterpart: string;
          course: string;
          created_at: string;
          event_date: string | null;
          event_kind: string;
          free: boolean;
          id: string;
          outcome: Json | null;
          status: string;
          user_id: string;
          worries: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "rehearsals";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_team: {
        Args: { _member_cap?: number; _name: string; _visibility?: string };
        Returns: {
          join_code: string;
          ok: boolean;
          reason: string;
          team_id: string;
        }[];
      };
      delete_tutor_memory_line: { Args: { _id: string; _user_id: string }; Returns: Json };
      display_name_problem: { Args: { _name: string }; Returns: string };
      end_buddy: {
        Args: Record<PropertyKey, never>;
        Returns: {
          status: string;
        }[];
      };
      finalize_lesson_session_result: {
        Args: { _result: Json; _token_hash: string; _user_id: string };
        Returns: undefined;
      };
      finish_branching_story: {
        Args: { _path: Json; _story_id: string; _user_id: string };
        Returns: Json;
      };
      finish_call_recap: {
        Args: {
          _call_id: string;
          _course: string;
          _mistakes: Json;
          _save: boolean;
          _topics: string[];
          _user_id: string;
        };
        Returns: number;
      };
      finish_practice_call: {
        Args: { _call_id: string; _replies: number; _stars: number; _user_id: string };
        Returns: {
          best_after: number;
          best_before: number;
          call_stars: number;
        }[];
      };
      finish_rehearsal_recap: {
        Args: {
          _call_id: string;
          _corrections: string[];
          _course: string;
          _mistakes: Json;
          _moments: string[];
          _save: boolean;
          _topics: string[];
          _user_id: string;
          _went_well: string[];
        };
        Returns: number;
      };
      forget_tutor_memory: { Args: { _user_id: string }; Returns: Json };
      generate_learner_handle: { Args: Record<PropertyKey, never>; Returns: string };
      get_ai_consent: { Args: Record<PropertyKey, never>; Returns: string };
      get_buddy_messages: {
        Args: { _since?: string };
        Returns: {
          is_mine: boolean;
          message_id: string;
          preset_id: string;
          sender_id: string;
          sent_at: string;
        }[];
      };
      get_buddy_pool: {
        Args: Record<PropertyKey, never>;
        Returns: {
          course: string;
          courses: string[];
          matching_enabled: boolean;
          waiting: boolean;
        }[];
      };
      get_buddy_requests: {
        Args: Record<PropertyKey, never>;
        Returns: {
          direction: string;
          other_avatar_seed: string;
          other_id: string;
          other_name: string;
          request_id: string;
          requested_at: string;
        }[];
      };
      get_cohort_weekly_xp: {
        Args: { _cohort_id: string; _week_start: string };
        Returns: {
          user_id: string;
          xp: number;
        }[];
      };
      get_friend_invite_preview: {
        Args: { _code: string };
        Returns: {
          avatar_seed: string;
          display_name: string;
          is_self: boolean;
          ok: boolean;
        }[];
      };
      get_friends_progress: {
        Args: Record<PropertyKey, never>;
        Returns: {
          avatar_seed: string;
          display_name: string;
          streak: number;
          user_id: string;
          week_xp: number;
        }[];
      };
      get_leaderboard: {
        Args: { _period: string; _scope: string };
        Returns: {
          avatar_seed: string;
          country: string;
          display_name: string;
          user_id: string;
          xp: number;
        }[];
      };
      get_my_buddy: {
        Args: Record<PropertyKey, never>;
        Returns: {
          buddy_avatar_seed: string;
          buddy_count: number;
          buddy_id: string;
          buddy_name: string;
          goal: number;
          grace_available: boolean;
          is_match: boolean;
          last_outcome: string;
          matching_enabled: boolean;
          my_count: number;
          pair_id: string;
          paired_at: string;
          streak_weeks: number;
          week_start: string;
        }[];
      };
      get_my_duels: {
        Args: Record<PropertyKey, never>;
        Returns: {
          challenger_id: string;
          challenger_xp_now: number;
          challenger_xp_start: number;
          course: string;
          duel_id: string;
          ends_at: string;
          opponent_id: string;
          opponent_xp_now: number;
          opponent_xp_start: number;
          status: string;
          winner_id: string;
        }[];
      };
      get_my_league_standing: {
        Args: { _course: string };
        Returns: {
          league_tier: string;
          rank: number;
          size: number;
          week_end: string;
          week_start: string;
          week_xp: number;
        }[];
      };
      get_my_name_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          display_name: string;
          name_confirmed_at: string;
        }[];
      };
      get_my_team: {
        Args: Record<PropertyKey, never>;
        Returns: {
          is_owner: boolean;
          join_code: string;
          joined_at: string;
          name: string;
          switch_locked_until: string;
          team_id: string;
          this_week_xp: number;
        }[];
      };
      get_or_create_my_friend_code: {
        Args: Record<PropertyKey, never>;
        Returns: {
          code: string;
        }[];
      };
      get_team_leaderboard: {
        Args: Record<PropertyKey, never>;
        Returns: {
          name: string;
          team_id: string;
          weekly_xp: number;
        }[];
      };
      get_team_members: {
        Args: Record<PropertyKey, never>;
        Returns: {
          avatar_seed: string;
          blocked: boolean;
          display_name: string;
          is_owner: boolean;
          joined_at: string;
          user_id: string;
        }[];
      };
      get_team_mission: {
        Args: Record<PropertyKey, never>;
        Returns: {
          member_count: number;
          my_count: number;
          reward_xp: number;
          rewarded: boolean;
          status: string;
          target: number;
          team_id: string;
          total: number;
          week_end: string;
          week_start: string;
        }[];
      };
      get_weekly_challenges: {
        Args: Record<PropertyKey, never>;
        Returns: {
          completed: boolean;
          description: string;
          progress: number;
          template_id: string;
          threshold: number;
          title: string;
          type: string;
        }[];
      };
      gift_streak_freeze: {
        Args: { _recipient: string };
        Returns: {
          freezes: number;
          ok: boolean;
          reason: string;
        }[];
      };
      grant_referral_reward: { Args: { _referee: string; _referrer_pro: boolean }; Returns: Json };
      hearts_refill_resolve: {
        Args: { _hearts: number; _now: string; _refill: string };
        Returns: {
          out_hearts: number;
          out_refill: string;
        }[];
      };
      hearts_unlimited: { Args: { _user_id: string }; Returns: boolean };
      is_restricted: { Args: { p_kind: string; p_user: string }; Returns: boolean };
      is_social_restricted: { Args: { p_user: string }; Returns: boolean };
      join_buddy_pool: {
        Args: { _age_confirmed: boolean; _course: string };
        Returns: {
          status: string;
        }[];
      };
      join_open_duel_queue: {
        Args: { _course: string; _match_by_level?: boolean };
        Returns: {
          duel_id: string;
          matched: boolean;
        }[];
      };
      join_public_team: {
        Args: { _team_id: string };
        Returns: {
          ok: boolean;
          reason: string;
          team_id: string;
        }[];
      };
      join_team: {
        Args: { _code: string };
        Returns: {
          ok: boolean;
          reason: string;
          team_id: string;
        }[];
      };
      kick_team_member: {
        Args: { _user_id: string };
        Returns: {
          ok: boolean;
          reason: string;
        }[];
      };
      learner_local_date: { Args: { _at: string; _user_id: string }; Returns: string };
      leave_buddy_pool: {
        Args: Record<PropertyKey, never>;
        Returns: {
          status: string;
        }[];
      };
      leave_duel_queue: { Args: Record<PropertyKey, never>; Returns: undefined };
      leave_team: {
        Args: Record<PropertyKey, never>;
        Returns: {
          ok: boolean;
          reason: string;
        }[];
      };
      lose_heart: {
        Args: Record<PropertyKey, never>;
        Returns: {
          hearts: number;
          hearts_refill_at: string;
        }[];
      };
      moderation_accented_allowlist_pattern: { Args: Record<PropertyKey, never>; Returns: string };
      moderation_allowlist_pattern: { Args: Record<PropertyKey, never>; Returns: string };
      moderation_anatomy_markers: { Args: Record<PropertyKey, never>; Returns: string[] };
      moderation_anatomy_terms: { Args: Record<PropertyKey, never>; Returns: string[] };
      moderation_anywhere_patterns: { Args: Record<PropertyKey, never>; Returns: string[] };
      moderation_clean_text: { Args: { input: string }; Returns: string };
      moderation_context_markers: { Args: Record<PropertyKey, never>; Returns: string[] };
      moderation_contextual_terms: { Args: Record<PropertyKey, never>; Returns: string[] };
      moderation_edge_patterns: { Args: Record<PropertyKey, never>; Returns: string[] };
      moderation_fold: { Args: { input: string }; Returns: string };
      move_rehearsal: {
        Args: { _event_date: string; _id: string; _user_id: string };
        Returns: {
          brief: NonNullable<Json>;
          closed_at: string | null;
          counterpart: string;
          course: string;
          created_at: string;
          event_date: string | null;
          event_kind: string;
          free: boolean;
          id: string;
          outcome: Json | null;
          status: string;
          user_id: string;
          worries: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "rehearsals";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      my_ai_cost_month: {
        Args: Record<PropertyKey, never>;
        Returns: {
          month_micro: number;
          uid: string;
        }[];
      };
      name_policy_bare_brand_terms: { Args: Record<PropertyKey, never>; Returns: string[] };
      name_policy_blocked: { Args: { input: string }; Returns: boolean };
      name_policy_brand_roles: { Args: Record<PropertyKey, never>; Returns: string[] };
      name_policy_brand_terms: { Args: Record<PropertyKey, never>; Returns: string[] };
      name_policy_edge_patterns: { Args: Record<PropertyKey, never>; Returns: string[] };
      name_policy_staff_terms: { Args: Record<PropertyKey, never>; Returns: string[] };
      name_policy_terms: { Args: Record<PropertyKey, never>; Returns: string[] };
      normalize_for_moderation: { Args: { input: string }; Returns: string };
      ops_events_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          count_1h: number;
          count_24h: number;
          count_7d: number;
          event: string;
          last_at: string;
        }[];
      };
      policy_social_restricted: { Args: { p_user: string }; Returns: boolean };
      record_podcast_play_event: {
        Args: { _episode_id: string; _seconds_listened: number };
        Returns: undefined;
      };
      record_practice_reply: {
        Args: {
          _call_id: string;
          _course: string;
          _english: boolean;
          _item_key: string;
          _kind: string;
          _right: boolean;
          _short: boolean;
          _user_id: string;
        };
        Returns: number;
      };
      record_signup_attribution: {
        Args: { p_campaign: string; p_landed_at: string; p_medium: string; p_source: string };
        Returns: string;
      };
      rehearsal_text_array_ok: { Args: { items: string[] }; Returns: boolean };
      release_ai_cost_alert_day: { Args: { p_day: string }; Returns: undefined };
      release_call_recap: { Args: { _call_id: string; _user_id: string }; Returns: boolean };
      release_hector_call: { Args: { _call_id: string; _user_id: string }; Returns: boolean };
      release_lesson_completion_slot: {
        Args: { _at: string; _user_id: string };
        Returns: undefined;
      };
      remember_call_recap: {
        Args: {
          _call_id: string;
          _course: string;
          _mistakes: Json;
          _save: boolean;
          _topics: string[];
          _user_id: string;
        };
        Returns: number;
      };
      remember_recap_phrase: {
        Args: {
          _call_id: string;
          _course: string;
          _meaning: string;
          _review_key: string;
          _text: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      remove_friend: {
        Args: { _friend_id: string };
        Returns: {
          message: string;
          ok: boolean;
        }[];
      };
      request_buddy: {
        Args: { _friend: string };
        Returns: {
          status: string;
        }[];
      };
      reserve_stt_audio_seconds: {
        Args: { _budget: number; _seconds: number; _user_id: string };
        Returns: string;
      };
      resolve_closed_season_cohorts: { Args: Record<PropertyKey, never>; Returns: number };
      resolve_season_cohort: { Args: { _cohort_id: string }; Returns: boolean };
      respond_buddy_request: {
        Args: { _accept: boolean; _request: string };
        Returns: {
          status: string;
        }[];
      };
      respond_to_duel: {
        Args: { _accept: boolean; _duel_id: string; _duration_days?: number };
        Returns: {
          ok: boolean;
          reason: string;
        }[];
      };
      restore_hearts_if_due: {
        Args: Record<PropertyKey, never>;
        Returns: {
          hearts: number;
          hearts_refill_at: string;
        }[];
      };
      rollup_ai_cost_log: { Args: { p_keep_days?: number }; Returns: number };
      run_maintenance_sweep: { Args: Record<PropertyKey, never>; Returns: undefined };
      save_listen_progress: {
        Args: { p_episode_id: string; p_position_s: number };
        Returns: {
          completed_at: string;
          position_s: number;
        }[];
      };
      save_placement_result: {
        Args: { _language: string; _level: string; _score: number };
        Returns: string;
      };
      save_story_progress: {
        Args: { p_segment_index: number; p_story_id: string };
        Returns: {
          completed_at: string;
          segment_index: number;
        }[];
      };
      save_video_progress: {
        Args: { p_progress_s: number; p_video_id: string };
        Returns: {
          completed_at: string;
          progress_seconds: number;
        }[];
      };
      send_buddy_message: {
        Args: { _preset: string };
        Returns: {
          status: string;
        }[];
      };
      set_ai_consent: { Args: { _granted: boolean }; Returns: string };
      set_cefr_level: { Args: { _language: string; _level: string }; Returns: undefined };
      set_learner_time_zone: { Args: { _time_zone: string; _user_id: string }; Returns: string };
      set_my_time_zone: { Args: { _time_zone: string }; Returns: string };
      settle_closed_weekly_challenges: { Args: Record<PropertyKey, never>; Returns: number };
      settle_lesson_hearts: {
        Args: {
          _enforce: boolean;
          _misses: number;
          _pro: boolean;
          _since: string;
          _token_hash: string;
          _user_id: string;
        };
        Returns: {
          charged: number;
          hearts: number;
          hearts_refill_at: string;
          settled_now: boolean;
        }[];
      };
      settle_stt_audio_seconds: {
        Args: { _actual: number; _day: string; _reserved: number; _user_id: string };
        Returns: undefined;
      };
      skip_display_name_prompt: { Args: Record<PropertyKey, never>; Returns: string };
      staff_active_role: { Args: { p_actor: string }; Returns: string };
      staff_add_member: {
        Args: {
          p_actor: string;
          p_actor_role: string;
          p_reason: string;
          p_role: string;
          p_scopes: string[];
          p_user: string;
        };
        Returns: undefined;
      };
      staff_add_note: {
        Args: { p_actor: string; p_body: string; p_role: string; p_target: string };
        Returns: string;
      };
      staff_assert_may_restrict: {
        Args: { p_actor_role: string; p_target: string };
        Returns: undefined;
      };
      staff_audit_actors: {
        Args: Record<PropertyKey, never>;
        Returns: {
          disabled: boolean;
          display_name: string;
          role: string;
          user_id: string;
        }[];
      };
      staff_disband_team: {
        Args: {
          p_actor: string;
          p_reason: string;
          p_report: string;
          p_role: string;
          p_target: string;
          p_team: string;
        };
        Returns: boolean;
      };
      staff_dismiss_report: {
        Args: {
          p_actor: string;
          p_reason: string;
          p_report: string;
          p_role: string;
          p_target: string;
        };
        Returns: boolean;
      };
      staff_get_settings: { Args: { p_actor: string }; Returns: Json };
      staff_health_history: {
        Args: { p_days?: number };
        Returns: {
          checks: number;
          day: string;
          ok_checks: number;
          service: string;
        }[];
      };
      staff_health_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          first_at: string;
          last_at: string;
          last_latency_ms: number;
          last_ok: boolean;
          service: string;
        }[];
      };
      staff_home_metrics: { Args: { p_range: string }; Returns: Json };
      staff_is_active_owner: { Args: { p_user: string }; Returns: boolean };
      staff_lift_restriction: {
        Args: {
          p_actor: string;
          p_kind: string;
          p_reason: string;
          p_role: string;
          p_target: string;
        };
        Returns: undefined;
      };
      staff_list_members: {
        Args: { p_actor: string };
        Returns: {
          added_at: string;
          disabled_at: string;
          display_name: string;
          email: string;
          last_sign_in_at: string;
          role: string;
          scopes: string[];
          user_id: string;
        }[];
      };
      staff_podcast_episode_audio_replace: {
        Args: {
          p_actor: string;
          p_duration: number;
          p_id: string;
          p_reason: string;
          p_role: string;
        };
        Returns: boolean;
      };
      staff_podcast_episode_create: {
        Args: {
          p_actor: string;
          p_audio_path: string;
          p_course: string;
          p_description: string;
          p_duration: number;
          p_folder: string;
          p_level: string;
          p_reason: string;
          p_role: string;
          p_slug: string;
          p_title: string;
        };
        Returns: string;
      };
      staff_podcast_episode_set_published: {
        Args: {
          p_actor: string;
          p_id: string;
          p_published: boolean;
          p_reason: string;
          p_role: string;
        };
        Returns: boolean;
      };
      staff_podcast_episode_update: {
        Args: {
          p_actor: string;
          p_description: string;
          p_id: string;
          p_reason: string;
          p_role: string;
          p_title: string;
        };
        Returns: boolean;
      };
      staff_podcast_folder_counts: {
        Args: Record<PropertyKey, never>;
        Returns: {
          folder_id: string;
          published: number;
          total: number;
        }[];
      };
      staff_podcast_folder_create: {
        Args: {
          p_actor: string;
          p_description: string;
          p_parent: string;
          p_reason: string;
          p_role: string;
          p_slug: string;
          p_sort_order: number;
          p_title: string;
        };
        Returns: string;
      };
      staff_podcast_folder_delete: {
        Args: { p_actor: string; p_id: string; p_reason: string; p_role: string };
        Returns: boolean;
      };
      staff_podcast_folder_move: {
        Args: { p_actor: string; p_id: string; p_parent: string; p_reason: string; p_role: string };
        Returns: boolean;
      };
      staff_podcast_folder_rename: {
        Args: {
          p_actor: string;
          p_description: string;
          p_id: string;
          p_reason: string;
          p_role: string;
          p_title: string;
        };
        Returns: boolean;
      };
      staff_podcast_reason: { Args: { p_reason: string }; Returns: string };
      staff_podcast_transcript_save: {
        Args: {
          p_actor: string;
          p_episode: string;
          p_reason: string;
          p_role: string;
          p_text: string;
        };
        Returns: boolean;
      };
      staff_record: {
        Args: {
          p_action: string;
          p_actor: string;
          p_after: Json;
          p_before: Json;
          p_reason: string;
          p_request_id: string;
          p_role: string;
          p_target: string;
        };
        Returns: number;
      };
      staff_record_pro_grant: {
        Args: {
          p_actor: string;
          p_before: Json;
          p_ends_at: string;
          p_reason: string;
          p_role: string;
          p_target: string;
        };
        Returns: string;
      };
      staff_record_pro_revoke: {
        Args: {
          p_actor: string;
          p_before: Json;
          p_reason: string;
          p_role: string;
          p_target: string;
        };
        Returns: undefined;
      };
      staff_rename_team: {
        Args: {
          p_actor: string;
          p_name: string;
          p_reason: string;
          p_report: string;
          p_role: string;
          p_target: string;
          p_team: string;
        };
        Returns: string;
      };
      staff_report_reason: { Args: { p_reason: string }; Returns: string };
      staff_reset_display_name: {
        Args: {
          p_actor: string;
          p_reason: string;
          p_report: string;
          p_role: string;
          p_target: string;
        };
        Returns: string;
      };
      staff_revoke_sessions: { Args: { p_target: string }; Returns: undefined };
      staff_search_users: {
        Args: { p_q: string };
        Returns: {
          created_at: string;
          display_name: string;
          email: string;
          id: string;
        }[];
      };
      staff_set_restriction: {
        Args: {
          p_actor: string;
          p_kind: string;
          p_reason: string;
          p_role: string;
          p_target: string;
        };
        Returns: string;
      };
      staff_set_setting: {
        Args: { p_actor: string; p_key: string; p_reason: string; p_role: string; p_value: Json };
        Returns: boolean;
      };
      staff_support_add_note: {
        Args: { p_actor: string; p_body: string; p_conversation: string; p_role: string };
        Returns: string;
      };
      staff_support_assign: {
        Args: {
          p_actor: string;
          p_assignee: string;
          p_conversation: string;
          p_reason: string;
          p_role: string;
        };
        Returns: boolean;
      };
      staff_support_clear_urgent: {
        Args: { p_actor: string; p_conversation: string; p_reason: string; p_role: string };
        Returns: boolean;
      };
      staff_support_hand_to_owner: {
        Args: { p_actor: string; p_conversation: string; p_reason: string; p_role: string };
        Returns: boolean;
      };
      staff_support_inbox: {
        Args: {
          p_actor: string;
          p_assigned: string;
          p_cursor_at: string;
          p_cursor_id: string;
          p_cursor_urgent?: boolean;
          p_filter: string;
          p_limit: number;
        };
        Returns: Json;
      };
      staff_support_reply: {
        Args: { p_actor: string; p_body: string; p_conversation: string; p_role: string };
        Returns: number;
      };
      staff_support_set_status: {
        Args: {
          p_actor: string;
          p_conversation: string;
          p_reason: string;
          p_role: string;
          p_status: string;
        };
        Returns: boolean;
      };
      staff_sweep_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          failed_24h: number;
          last_ok_at: string;
          last_run_at: string;
          last_status: string;
          runs_24h: number;
          scheduled: boolean;
        }[];
      };
      staff_update_member: {
        Args: {
          p_actor: string;
          p_actor_role: string;
          p_disabled: boolean;
          p_reason: string;
          p_role: string;
          p_scopes: string[];
          p_user: string;
        };
        Returns: undefined;
      };
      submit_podcast_quiz: {
        Args: {
          _answers: Json;
          _at: string;
          _completed_at?: string;
          _episode_id: string;
          _limit?: number;
          _user_id: string;
        };
        Returns: Json;
      };
      submit_story_check: {
        Args: { _answers: Json; _story_id: string; _user_id: string };
        Returns: Json;
      };
      support_add_ai_message: {
        Args: { p_body: string; p_conversation: string; p_facts: Json; p_handoff: Json };
        Returns: number;
      };
      support_add_learner_message: {
        Args: { p_body: string; p_client_id: string; p_conversation: string; p_user: string };
        Returns: number;
      };
      support_handoff: {
        Args: {
          p_conversation: string;
          p_reason: string;
          p_summary: string;
          p_topic: string;
          p_user: string;
        };
        Returns: boolean;
      };
      support_learner_view: { Args: { p_user: string }; Returns: Json };
      support_open_conversation: { Args: { p_channel: string; p_user: string }; Returns: string };
      support_purge_old: { Args: Record<PropertyKey, never>; Returns: number };
      support_waiting_since: {
        Args: {
          p_conversation: string;
          p_handed_off_at: string;
          p_status: string;
          p_updated_at: string;
        };
        Returns: string;
      };
      team_name_problem: { Args: { _name: string }; Returns: string };
      trial_reminder_candidates: {
        Args: { p_active_since: string; p_checked_before: string; p_limit: number };
        Returns: {
          user_id: string;
        }[];
      };
      trip_ai_spend_breaker: { Args: { p_limit_micro: number }; Returns: Json };
      weekly_xp: { Args: { _user_id: string; _week_start: string }; Returns: number };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
