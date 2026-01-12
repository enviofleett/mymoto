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
      ai_scenario_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          is_system: boolean | null
          name: string
          prompt: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          prompt: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      alert_dispatch_log: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          event_id: string | null
          id: string
          metadata: Json | null
          recipient: string
          rule_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          event_id?: string | null
          id?: string
          metadata?: Json | null
          recipient: string
          rule_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          event_id?: string | null
          id?: string
          metadata?: Json | null
          recipient?: string
          rule_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_dispatch_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "proactive_vehicle_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_dispatch_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          channels: string[]
          conditions: Json
          cooldown_minutes: number | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          rule_type: string
          severity: string
          target_id: string | null
          target_type: string
          updated_at: string
        }
        Insert: {
          channels?: string[]
          conditions?: Json
          cooldown_minutes?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          rule_type: string
          severity?: string
          target_id?: string | null
          target_type: string
          updated_at?: string
        }
        Update: {
          channels?: string[]
          conditions?: Json
          cooldown_minutes?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rule_type?: string
          severity?: string
          target_id?: string | null
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      conversation_summaries: {
        Row: {
          created_at: string
          device_id: string
          embedding: string | null
          id: string
          key_facts: Json | null
          messages_summarized: number
          period_end: string
          period_start: string
          summary_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          embedding?: string | null
          id?: string
          key_facts?: Json | null
          messages_summarized?: number
          period_end: string
          period_start: string
          summary_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          embedding?: string | null
          id?: string
          key_facts?: Json | null
          messages_summarized?: number
          period_end?: string
          period_start?: string
          summary_text?: string
          user_id?: string
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
      geofence_events: {
        Row: {
          device_id: string
          event_type: string
          id: string
          latitude: number
          location_name: string
          longitude: number
          metadata: Json | null
          monitor_id: string | null
          triggered_at: string
        }
        Insert: {
          device_id: string
          event_type: string
          id?: string
          latitude: number
          location_name: string
          longitude: number
          metadata?: Json | null
          monitor_id?: string | null
          triggered_at?: string
        }
        Update: {
          device_id?: string
          event_type?: string
          id?: string
          latitude?: number
          location_name?: string
          longitude?: number
          metadata?: Json | null
          monitor_id?: string | null
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofence_events_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "geofence_monitors"
            referencedColumns: ["id"]
          },
        ]
      }
      geofence_locations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean | null
          latitude: number
          longitude: number
          name: string
          radius_meters: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          latitude: number
          longitude: number
          name: string
          radius_meters?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          latitude?: number
          longitude?: number
          name?: string
          radius_meters?: number
          updated_at?: string
        }
        Relationships: []
      }
      geofence_monitors: {
        Row: {
          active_days: number[] | null
          active_from: string | null
          active_until: string | null
          created_at: string
          created_by: string | null
          device_id: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          last_checked_at: string | null
          last_triggered_at: string | null
          latitude: number | null
          location_id: string | null
          location_name: string | null
          longitude: number | null
          one_time: boolean | null
          radius_meters: number | null
          trigger_count: number | null
          trigger_on: string
          updated_at: string
          vehicle_inside: boolean | null
        }
        Insert: {
          active_days?: number[] | null
          active_from?: string | null
          active_until?: string | null
          created_at?: string
          created_by?: string | null
          device_id: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_checked_at?: string | null
          last_triggered_at?: string | null
          latitude?: number | null
          location_id?: string | null
          location_name?: string | null
          longitude?: number | null
          one_time?: boolean | null
          radius_meters?: number | null
          trigger_count?: number | null
          trigger_on: string
          updated_at?: string
          vehicle_inside?: boolean | null
        }
        Update: {
          active_days?: number[] | null
          active_from?: string | null
          active_until?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_checked_at?: string | null
          last_triggered_at?: string | null
          latitude?: number | null
          location_id?: string | null
          location_name?: string | null
          longitude?: number | null
          one_time?: boolean | null
          radius_meters?: number | null
          trigger_count?: number | null
          trigger_on?: string
          updated_at?: string
          vehicle_inside?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "geofence_monitors_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "geofence_locations"
            referencedColumns: ["id"]
          },
        ]
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
      llm_analytics: {
        Row: {
          created_at: string
          device_id: string | null
          error_message: string | null
          fallback_used: boolean | null
          id: string
          latency_ms: number | null
          model_used: string
          query_type: string
          success: boolean | null
          tokens_input: number | null
          tokens_output: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          fallback_used?: boolean | null
          id?: string
          latency_ms?: number | null
          model_used: string
          query_type: string
          success?: boolean | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          fallback_used?: boolean | null
          id?: string
          latency_ms?: number | null
          model_used?: string
          query_type?: string
          success?: boolean | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id?: string | null
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
      proactive_vehicle_events: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          device_id: string
          event_type: string
          id: string
          message: string
          metadata: Json | null
          severity: string
          title: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          device_id: string
          event_type: string
          id?: string
          message: string
          metadata?: Json | null
          severity?: string
          title: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          device_id?: string
          event_type?: string
          id?: string
          message?: string
          metadata?: Json | null
          severity?: string
          title?: string
        }
        Relationships: []
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
      trip_analytics: {
        Row: {
          analyzed_at: string
          created_at: string
          device_id: string
          driver_score: number | null
          embedding: string | null
          harsh_events: Json | null
          id: string
          summary_text: string | null
          trip_id: string | null
          weather_data: Json | null
        }
        Insert: {
          analyzed_at?: string
          created_at?: string
          device_id: string
          driver_score?: number | null
          embedding?: string | null
          harsh_events?: Json | null
          id?: string
          summary_text?: string | null
          trip_id?: string | null
          weather_data?: Json | null
        }
        Update: {
          analyzed_at?: string
          created_at?: string
          device_id?: string
          driver_score?: number | null
          embedding?: string | null
          harsh_events?: Json | null
          id?: string
          summary_text?: string | null
          trip_id?: string | null
          weather_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_analytics_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "vehicle_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_patterns: {
        Row: {
          avg_battery_consumption: number | null
          avg_distance_km: number | null
          avg_duration_minutes: number | null
          confidence_score: number | null
          created_at: string
          day_of_week: number
          destination_latitude: number
          destination_location_id: string | null
          destination_longitude: number
          destination_name: string | null
          device_id: string
          id: string
          last_occurrence: string | null
          occurrence_count: number
          origin_latitude: number
          origin_location_id: string | null
          origin_longitude: number
          origin_name: string | null
          time_slot: string | null
          typical_start_hour: number
          updated_at: string
        }
        Insert: {
          avg_battery_consumption?: number | null
          avg_distance_km?: number | null
          avg_duration_minutes?: number | null
          confidence_score?: number | null
          created_at?: string
          day_of_week: number
          destination_latitude: number
          destination_location_id?: string | null
          destination_longitude: number
          destination_name?: string | null
          device_id: string
          id?: string
          last_occurrence?: string | null
          occurrence_count?: number
          origin_latitude: number
          origin_location_id?: string | null
          origin_longitude: number
          origin_name?: string | null
          time_slot?: string | null
          typical_start_hour: number
          updated_at?: string
        }
        Update: {
          avg_battery_consumption?: number | null
          avg_distance_km?: number | null
          avg_duration_minutes?: number | null
          confidence_score?: number | null
          created_at?: string
          day_of_week?: number
          destination_latitude?: number
          destination_location_id?: string | null
          destination_longitude?: number
          destination_name?: string | null
          device_id?: string
          id?: string
          last_occurrence?: string | null
          occurrence_count?: number
          origin_latitude?: number
          origin_location_id?: string | null
          origin_longitude?: number
          origin_name?: string | null
          time_slot?: string | null
          typical_start_hour?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          confidence_score: number | null
          created_at: string
          id: string
          last_updated: string
          preference_key: string
          preference_value: Json
          source: string
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          last_updated?: string
          preference_key: string
          preference_value: Json
          source?: string
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          last_updated?: string
          preference_key?: string
          preference_value?: Json
          source?: string
          user_id?: string
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
            foreignKeyName: "fk_vehicle_assignments_device"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["device_id"]
          },
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
          embedding: string | null
          id: string
          metadata: Json | null
          role: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          device_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          role: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          device_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      vehicle_command_logs: {
        Row: {
          command_type: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          device_id: string
          error_message: string | null
          executed_at: string | null
          id: string
          payload: Json | null
          requires_confirmation: boolean | null
          result: Json | null
          status: string
          user_id: string
        }
        Insert: {
          command_type: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          device_id: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          payload?: Json | null
          requires_confirmation?: boolean | null
          result?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          command_type?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          device_id?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          payload?: Json | null
          requires_confirmation?: boolean | null
          result?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      vehicle_llm_settings: {
        Row: {
          avatar_url: string | null
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
          avatar_url?: string | null
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
          avatar_url?: string | null
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
          last_synced_at: string | null
          latitude: number | null
          longitude: number | null
          previous_battery_percent: number | null
          speed: number | null
          status_text: string | null
          sync_priority: string | null
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
          last_synced_at?: string | null
          latitude?: number | null
          longitude?: number | null
          previous_battery_percent?: number | null
          speed?: number | null
          status_text?: string | null
          sync_priority?: string | null
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
          last_synced_at?: string | null
          latitude?: number | null
          longitude?: number | null
          previous_battery_percent?: number | null
          speed?: number | null
          status_text?: string | null
          sync_priority?: string | null
          total_mileage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_vehicle_positions_device"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["device_id"]
          },
          {
            foreignKeyName: "vehicle_positions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["device_id"]
          },
        ]
      }
      vehicle_trips: {
        Row: {
          avg_speed: number | null
          created_at: string
          device_id: string
          distance_km: number
          duration_seconds: number | null
          end_latitude: number
          end_longitude: number
          end_time: string
          id: string
          max_speed: number | null
          start_latitude: number
          start_longitude: number
          start_time: string
        }
        Insert: {
          avg_speed?: number | null
          created_at?: string
          device_id: string
          distance_km?: number
          duration_seconds?: number | null
          end_latitude: number
          end_longitude: number
          end_time: string
          id?: string
          max_speed?: number | null
          start_latitude: number
          start_longitude: number
          start_time: string
        }
        Update: {
          avg_speed?: number | null
          created_at?: string
          device_id?: string
          distance_km?: number
          duration_seconds?: number | null
          end_latitude?: number
          end_longitude?: number
          end_time?: string
          id?: string
          max_speed?: number | null
          start_latitude?: number
          start_longitude?: number
          start_time?: string
        }
        Relationships: []
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
      v_gps_sync_health: {
        Row: {
          avg_age_seconds: number | null
          moving_count: number | null
          newest_sync: string | null
          oldest_sync: string | null
          online_count: number | null
          stale_count: number | null
          total_vehicles: number | null
        }
        Relationships: []
      }
      vehicle_daily_stats: {
        Row: {
          avg_distance_km: number | null
          avg_speed: number | null
          device_id: string | null
          first_trip_start: string | null
          last_trip_end: string | null
          peak_speed: number | null
          stat_date: string | null
          total_distance_km: number | null
          total_duration_seconds: number | null
          trip_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      analyze_trip_patterns: {
        Args: never
        Returns: {
          devices_analyzed: number
          patterns_found: number
        }[]
      }
      find_or_create_location: {
        Args: {
          p_latitude?: number
          p_longitude?: number
          p_name: string
          p_radius?: number
          p_user_id?: string
        }
        Returns: string
      }
      get_current_location_context: {
        Args: { p_device_id: string; p_latitude: number; p_longitude: number }
        Returns: {
          at_learned_location: boolean
          custom_label: string
          last_visit_days_ago: number
          location_name: string
          location_type: string
          typical_duration_minutes: number
          visit_count: number
        }[]
      }
      get_daily_mileage: { Args: { p_device_id: string }; Returns: Json }
      get_driving_habits_context: {
        Args: { p_device_id: string }
        Returns: Json
      }
      get_fleet_stats: { Args: never; Returns: Json }
      get_latest_driver_score: {
        Args: { p_device_id: string }
        Returns: {
          driver_score: number
          harsh_acceleration_count: number
          harsh_braking_count: number
          recent_trend: string
          trips_analyzed: number
        }[]
      }
      get_maintenance_recommendations: {
        Args: { p_device_id: string; p_status?: string }
        Returns: {
          created_at: string
          description: string
          id: string
          predicted_issue: string
          priority: string
          status: string
          title: string
        }[]
      }
      get_predicted_trips: {
        Args: { p_device_id?: string }
        Returns: {
          avg_distance_km: number
          avg_duration_minutes: number
          confidence_score: number
          destination_latitude: number
          destination_longitude: number
          destination_name: string
          device_id: string
          occurrence_count: number
          origin_latitude: number
          origin_longitude: number
          origin_name: string
          pattern_id: string
          typical_start_hour: number
        }[]
      }
      get_vehicle_geofence_context: {
        Args: { p_device_id: string }
        Returns: {
          duration_minutes: number
          geofence_name: string
          is_inside_geofence: boolean
          recent_events_count: number
          zone_type: string
        }[]
      }
      get_vehicle_health: {
        Args: { p_device_id: string }
        Returns: {
          battery_health_score: number
          connectivity_score: number
          driving_behavior_score: number
          overall_health_score: number
          trend: string
        }[]
      }
      get_vehicle_mileage_stats: {
        Args: { p_device_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_inside_geofence: {
        Args: {
          g_lat: number
          g_lon: number
          g_radius_meters: number
          p_lat: number
          p_lon: number
        }
        Returns: boolean
      }
      match_chat_memories: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_device_id?: string
          p_user_id?: string
          query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          device_id: string
          id: string
          role: string
          similarity: number
        }[]
      }
      match_driving_records: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_device_id?: string
          query_embedding: string
        }
        Returns: {
          analyzed_at: string
          device_id: string
          driver_score: number
          harsh_events: Json
          id: string
          similarity: number
          summary_text: string
          trip_id: string
          weather_data: Json
        }[]
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
