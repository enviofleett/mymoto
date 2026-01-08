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
      app_settings: {
        Row: {
          expires_at: string | null
          id: number
          key: string
          metadata: Json | null
          updated_at: string
          value: string | null
        }
        Insert: {
          expires_at?: string | null
          id?: never
          key: string
          metadata?: Json | null
          updated_at?: string
          value?: string | null
        }
        Update: {
          expires_at?: string | null
          id?: never
          key?: string
          metadata?: Json | null
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      billing_config: {
        Row: {
          currency: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: number
        }
        Insert: {
          currency?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: number
        }
        Update: {
          currency?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: number
        }
        Relationships: []
      }
      fleet_insights_history: {
        Row: {
          alerts_count: number
          content: string
          created_at: string | null
          id: string
          low_battery_count: number
          offline_count: number
          overspeeding_count: number
          vehicles_analyzed: number
        }
        Insert: {
          alerts_count?: number
          content: string
          created_at?: string | null
          id?: string
          low_battery_count?: number
          offline_count?: number
          overspeeding_count?: number
          vehicles_analyzed?: number
        }
        Update: {
          alerts_count?: number
          content?: string
          created_at?: string | null
          id?: string
          low_battery_count?: number
          offline_count?: number
          overspeeding_count?: number
          vehicles_analyzed?: number
        }
        Relationships: []
      }
      gps_api_logs: {
        Row: {
          action: string
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          request_body: Json | null
          response_body: Json | null
          response_status: number | null
        }
        Insert: {
          action: string
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          request_body?: Json | null
          response_body?: Json | null
          response_status?: number | null
        }
        Update: {
          action?: string
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          request_body?: Json | null
          response_body?: Json | null
          response_status?: number | null
        }
        Relationships: []
      }
      position_history: {
        Row: {
          battery_percent: number | null
          device_id: string | null
          gps_time: string | null
          heading: number | null
          id: string
          ignition_on: boolean | null
          latitude: number | null
          longitude: number | null
          recorded_at: string | null
          speed: number | null
        }
        Insert: {
          battery_percent?: number | null
          device_id?: string | null
          gps_time?: string | null
          heading?: number | null
          id?: string
          ignition_on?: boolean | null
          latitude?: number | null
          longitude?: number | null
          recorded_at?: string | null
          speed?: number | null
        }
        Update: {
          battery_percent?: number | null
          device_id?: string | null
          gps_time?: string | null
          heading?: number | null
          id?: string
          ignition_on?: boolean | null
          latitude?: number | null
          longitude?: number | null
          recorded_at?: string | null
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "position_history_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["device_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          license_number: string | null
          name: string
          phone: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          license_number?: string | null
          name: string
          phone?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          license_number?: string | null
          name?: string
          phone?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_assignments: {
        Row: {
          created_at: string | null
          device_id: string
          profile_id: string | null
          updated_at: string | null
          vehicle_alias: string | null
        }
        Insert: {
          created_at?: string | null
          device_id: string
          profile_id?: string | null
          updated_at?: string | null
          vehicle_alias?: string | null
        }
        Update: {
          created_at?: string | null
          device_id?: string
          profile_id?: string | null
          updated_at?: string | null
          vehicle_alias?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_chat_history: {
        Row: {
          content: string
          created_at: string | null
          device_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          device_id: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          device_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      vehicle_llm_settings: {
        Row: {
          created_at: string | null
          device_id: string
          language_preference: string | null
          last_billing_date: string | null
          llm_enabled: boolean | null
          nickname: string | null
          personality_mode: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          device_id: string
          language_preference?: string | null
          last_billing_date?: string | null
          llm_enabled?: boolean | null
          nickname?: string | null
          personality_mode?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          device_id?: string
          language_preference?: string | null
          last_billing_date?: string | null
          llm_enabled?: boolean | null
          nickname?: string | null
          personality_mode?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      vehicle_positions: {
        Row: {
          altitude: number | null
          battery_percent: number | null
          cached_at: string | null
          device_id: string | null
          gps_time: string | null
          heading: number | null
          id: string
          ignition_on: boolean | null
          is_online: boolean | null
          is_overspeeding: boolean | null
          latitude: number | null
          longitude: number | null
          speed: number | null
          status_text: string | null
          total_mileage: number | null
        }
        Insert: {
          altitude?: number | null
          battery_percent?: number | null
          cached_at?: string | null
          device_id?: string | null
          gps_time?: string | null
          heading?: number | null
          id?: string
          ignition_on?: boolean | null
          is_online?: boolean | null
          is_overspeeding?: boolean | null
          latitude?: number | null
          longitude?: number | null
          speed?: number | null
          status_text?: string | null
          total_mileage?: number | null
        }
        Update: {
          altitude?: number | null
          battery_percent?: number | null
          cached_at?: string | null
          device_id?: string | null
          gps_time?: string | null
          heading?: number | null
          id?: string
          ignition_on?: boolean | null
          is_online?: boolean | null
          is_overspeeding?: boolean | null
          latitude?: number | null
          longitude?: number | null
          speed?: number | null
          status_text?: string | null
          total_mileage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_positions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["device_id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string | null
          device_id: string
          device_name: string
          device_type: string | null
          gps_owner: string | null
          group_id: string | null
          group_name: string | null
          last_synced_at: string | null
          sim_number: string | null
        }
        Insert: {
          created_at?: string | null
          device_id: string
          device_name: string
          device_type?: string | null
          gps_owner?: string | null
          group_id?: string | null
          group_name?: string | null
          last_synced_at?: string | null
          sim_number?: string | null
        }
        Update: {
          created_at?: string | null
          device_id?: string
          device_name?: string
          device_type?: string | null
          gps_owner?: string | null
          group_id?: string | null
          group_name?: string | null
          last_synced_at?: string | null
          sim_number?: string | null
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          reference: string | null
          type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          reference?: string | null
          type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          reference?: string | null
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number | null
          created_at: string | null
          currency: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
