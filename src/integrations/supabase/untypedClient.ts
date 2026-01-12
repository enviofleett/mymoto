/**
 * Utility module for accessing Supabase tables that are not in the auto-generated types.
 * 
 * The auto-generated types.ts only includes tables that have been explicitly synced.
 * For tables that exist in the database but aren't in the types, use this typed helper.
 */

import { supabase } from './client';

/**
 * Returns a Supabase query builder that bypasses type checking.
 * Use this for tables not included in the auto-generated types.
 * 
 * @param tableName - The name of the table to query
 * @returns A query builder with any type
 * 
 * @example
 * const { data, error } = await untypedFrom('vehicles').select('*').eq('id', 123);
 */
export function untypedFrom(tableName: string) {
  return supabase.from(tableName as any) as any;
}

/**
 * Common interfaces for tables not in auto-generated types.
 * Add interfaces here as needed for type safety in your components.
 */

export interface Vehicle {
  device_id: string;
  device_name: string;
  device_type?: string;
  gps_owner?: string;
  group_name?: string;
  created_at?: string;
  last_synced_at?: string;
}

export interface VehiclePosition {
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  battery_percent: number;
  ignition_on: boolean;
  is_online: boolean;
  is_overspeeding: boolean;
  total_mileage: number;
  gps_time: string;
}

export interface VehicleAssignment {
  device_id: string;
  profile_id: string;
  vehicle_alias?: string;
  updated_at?: string;
}

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone?: string;
  status?: string;
}

export interface ChatMessage {
  id: string;
  device_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface PositionHistory {
  id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  ignition_on: boolean;
  battery_percent: number;
  gps_time: string;
}

export interface ProactiveEvent {
  id: string;
  device_id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
  acknowledged: boolean;
  acknowledged_at?: string;
}

export interface VehicleLlmSettings {
  device_id: string;
  nickname: string;
  language_preference: string;
  personality_mode: string;
  llm_enabled: boolean;
  avatar_url?: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  amount: number;
  type: string;
  description: string;
  reference?: string;
  created_at: string;
}

export interface AppSettings {
  key: string;
  value: string;
  metadata?: Record<string, unknown>;
  updated_at?: string;
  expires_at?: string;
}

export interface BillingConfig {
  key: string;
  value: number;
  updated_at?: string;
}

export interface ScenarioTemplate {
  id: string;
  name: string;
  prompt: string;
  category: string;
  is_system: boolean;
}
