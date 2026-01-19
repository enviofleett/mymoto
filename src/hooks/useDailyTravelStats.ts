import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface DailyTravelStat {
  travel_date: string
  total_distance_km: number
  total_travel_time_minutes: number
  trip_count: number
  avg_speed_kmh: number
  max_speed_kmh: number
  first_trip_start: string
  last_trip_end: string
}

export interface DailyTravelStatsResponse {
  device_id: string
  date_range: {
    start: string
    end: string
  }
  time_window: {
    start: string
    end: string
    timezone: string
  }
  daily_stats: DailyTravelStat[]
  summary: {
    total_days: number
    total_distance_km: string
    total_travel_time_minutes: string
    total_trips: number
  }
}

interface UseDailyTravelStatsOptions {
  deviceId: string
  startDate?: string // YYYY-MM-DD format
  endDate?: string // YYYY-MM-DD format
  enabled?: boolean
}

export function useDailyTravelStats({
  deviceId,
  startDate,
  endDate,
  enabled = true,
}: UseDailyTravelStatsOptions) {
  return useQuery<DailyTravelStatsResponse>({
    queryKey: ['daily-travel-stats', deviceId, startDate, endDate],
    queryFn: async () => {
      if (!deviceId) {
        throw new Error('device_id is required')
      }

      // Build query params for edge function
      const params: Record<string, string> = {
        device_id: deviceId,
      }

      if (startDate) {
        params.start_date = startDate
      }

      if (endDate) {
        params.end_date = endDate
      }

      // Call edge function using query params
      const { data, error } = await supabase.functions.invoke('daily-travel-stats', {
        body: {},
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Edge functions with GET method need params in URL
      // Use fetch directly with query params
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://cmvpnsqiefbsqkwnraka.supabase.co"
      const queryString = new URLSearchParams(params).toString()
      const functionUrl = `${supabaseUrl}/functions/v1/daily-travel-stats?${queryString}`
      
      const session = await supabase.auth.getSession()
      const response = await fetch(functionUrl, {
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token || ''}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch daily travel stats')
      }

      const result = await response.json()
      return result
    },
    enabled: enabled && !!deviceId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
