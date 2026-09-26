export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
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
      content_reports: {
        Row: {
          created_at: string;
          id: string;
          reason: string;
          reported: string;
          reporter: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          reason: string;
          reported: string;
          reporter?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          reason?: string;
          reported?: string;
          reporter?: string;
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
      friend_activity_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          payload: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          payload?: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          payload?: Json;
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
          user_id: string;
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
      profiles: {
        Row: {
          active_language: string;
          avatar_seed: string;
          country: string | null;
          created_at: string;
          display_name: string;
          id: string;
          theme: string | null;
          updated_at: string;
        };
        Insert: {
          active_language?: string;
          avatar_seed?: string;
          country?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          theme?: string | null;
          updated_at?: string;
        };
        Update: {
          active_language?: string;
          avatar_seed?: string;
          country?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
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
      user_weekly_quest_claims: {
        Row: {
          claimed_at: string;
          quest_id: string;
          user_id: string;
          week_start: string;
        };
        Insert: {
          claimed_at?: string;
          quest_id: string;
          user_id: string;
          week_start: string;
        };
        Update: {
          claimed_at?: string;
          quest_id?: string;
          user_id?: string;
          week_start?: string;
        };
        Relationships: [];
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
          created_at: string;
          event_type: string;
          id: string;
          user_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          event_type: string;
          id?: string;
          user_id: string;
        };
        Update: {
          category?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _join_team_impl: {
        Args: { _me: string; _team_id: string };
        Returns: {
          ok: boolean;
          reason: string;
          team_id: string;
        }[];
      };
      _random_team_name: { Args: never; Returns: string };
      accept_friend_invite: {
        Args: { _inviter_id: string };
        Returns: {
          message: string;
          ok: boolean;
        }[];
      };
      auto_join_team: {
        Args: never;
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
      buy_heart_with_xp: {
        Args: { _cost?: number; _course: string };
        Returns: {
          hearts: number;
          ok: boolean;
          reason: string;
          xp: number;
        }[];
      };
      buy_streak_freeze_with_xp: {
        Args: { _cost?: number; _course: string };
        Returns: {
          ok: boolean;
          reason: string;
          streak_freezes: number;
          xp: number;
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
      create_duel: {
        Args: { _course?: string; _opponent_id: string };
        Returns: {
          duel_id: string;
          ok: boolean;
          reason: string;
        }[];
      };
      get_cohort_weekly_xp: {
        Args: { _cohort_id: string; _week_start: string };
        Returns: {
          user_id: string;
          xp: number;
        }[];
      };
      get_friends_progress: {
        Args: never;
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
      get_my_duels: {
        Args: never;
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
      get_my_team: {
        Args: never;
        Returns: {
          join_code: string;
          joined_at: string;
          name: string;
          switch_locked_until: string;
          team_id: string;
          this_week_xp: number;
        }[];
      };
      get_team_leaderboard: {
        Args: never;
        Returns: {
          name: string;
          team_id: string;
          weekly_xp: number;
        }[];
      };
      get_weekly_challenges: {
        Args: never;
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
      leave_duel_queue: { Args: never; Returns: undefined };
      leave_team: {
        Args: never;
        Returns: {
          ok: boolean;
          reason: string;
        }[];
      };
      lose_heart: {
        Args: never;
        Returns: {
          hearts: number;
          hearts_refill_at: string;
        }[];
      };
      record_podcast_play_event: {
        Args: { _episode_id: string; _seconds_listened: number };
        Returns: undefined;
      };
      remove_friend: {
        Args: { _friend_id: string };
        Returns: {
          message: string;
          ok: boolean;
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
        Args: never;
        Returns: {
          hearts: number;
          hearts_refill_at: string;
        }[];
      };
      save_placement_result: {
        Args: { _language: string; _level: string; _score: number };
        Returns: string;
      };
      set_cefr_level: {
        Args: { _language: string; _level: string };
        Returns: undefined;
      };
      weekly_xp: {
        Args: { _user_id: string; _week_start: string };
        Returns: number;
      };
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
