export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_popup_config: {
        Row: {
          button_text: string | null
          created_at: string
          id: string
          is_enabled: boolean
          message: string
          show_for_android: boolean
          show_for_ios: boolean
          title: string
          updated_at: string
        }
        Insert: {
          button_text?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          message?: string
          show_for_android?: boolean
          show_for_ios?: boolean
          title?: string
          updated_at?: string
        }
        Update: {
          button_text?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          message?: string
          show_for_android?: boolean
          show_for_ios?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_updates: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          is_mandatory: boolean | null
          release_notes: string | null
          version: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_mandatory?: boolean | null
          release_notes?: string | null
          version: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_mandatory?: boolean | null
          release_notes?: string | null
          version?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      directory_bookings: {
        Row: {
          booking_date: string
          booking_time: string | null
          created_at: string
          fulfilled_at: string | null
          id: string
          notes: string | null
          provider_id: string
          service_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_date: string
          booking_time?: string | null
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          notes?: string | null
          provider_id: string
          service_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_date?: string
          booking_time?: string | null
          created_at?: string
          fulfilled_at?: string | null
          id?: string
          notes?: string | null
          provider_id?: string
          service_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "directory_bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directory_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      directory_categories: {
        Row: {
          created_at: string
          display_order: number
          icon: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          icon: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_providers: {
        Row: {
          address: string
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          business_name: string
          category_id: string
          contact_person: string
          created_at: string
          description: string | null
          email: string
          id: string
          is_active: boolean
          is_verified: boolean
          last_edit_at: string | null
          pending_changes: Json | null
          phone: string
          profile_data: Json | null
          rating: number
          rejection_reason: string | null
          review_count: number
          service_radius_km: number
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          address: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_name: string
          category_id: string
          contact_person: string
          created_at?: string
          description?: string | null
          email: string
          id?: string
          is_active?: boolean
          is_verified?: boolean
          last_edit_at?: string | null
          pending_changes?: Json | null
          phone: string
          profile_data?: Json | null
          rating?: number
          rejection_reason?: string | null
          review_count?: number
          service_radius_km?: number
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          business_name?: string
          category_id?: string
          contact_person?: string
          created_at?: string
          description?: string | null
          email?: string
          id?: string
          is_active?: boolean
          is_verified?: boolean
          last_edit_at?: string | null
          pending_changes?: Json | null
          phone?: string
          profile_data?: Json | null
          rating?: number
          rejection_reason?: string | null
          review_count?: number
          service_radius_km?: number
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_providers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "directory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_providers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      provider_stats_view: {
        Row: {
          provider_id: string
          avg_rating: number
          review_count: number
        }
        Relationships: [
          {
            foreignKeyName: "provider_stats_view_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
