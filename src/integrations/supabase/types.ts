export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
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
      profiles: {
        Row: {
          active_language: string;
          avatar_seed: string;
          country: string | null;
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          active_language?: string;
          avatar_seed?: string;
          country?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          active_language?: string;
          avatar_seed?: string;
          country?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      review_items: {
        Row: {
          created_at: string;
          due_on: string;
          ease: number;
          id: string;
          interval_days: number;
          item_key: string;
          language: string;
          lapses: number;
          last_reviewed_at: string | null;
          lesson_id: string;
          level: string;
          repetitions: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          due_on?: string;
          ease?: number;
          id?: string;
          interval_days?: number;
          item_key: string;
          language?: string;
          lapses?: number;
          last_reviewed_at?: string | null;
          lesson_id: string;
          level?: string;
          repetitions?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          due_on?: string;
          ease?: number;
          id?: string;
          interval_days?: number;
          item_key?: string;
          language?: string;
          lapses?: number;
          last_reviewed_at?: string | null;
          lesson_id?: string;
          level?: string;
          repetitions?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
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
      accept_friend_invite: {
        Args: { _inviter_id: string };
        Returns: {
          ok: boolean;
          message: string;
        }[];
      };
      get_friends_progress: {
        Args: Record<PropertyKey, never>;
        Returns: {
          user_id: string;
          display_name: string;
          avatar_seed: string;
          streak: number;
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
