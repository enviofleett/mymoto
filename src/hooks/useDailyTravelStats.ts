import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface DailyTravelStat {
  travel_date: string
  total_distance_km: number | string
  total_travel_time_minutes: number | string
  trip_count: number | string
  avg_speed_kmh: number | string
  max_speed_kmh: number | string
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

      let { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          throw new Error('You must be logged in to view daily travel stats.')
        }
        const retry = await supabase.auth.getSession()
        session = retry.data.session
      }

      if (!session?.access_token) {
        throw new Error('Authentication token is missing. Please sign in again.')
      }

      const { data, error } = await supabase.functions.invoke('daily-travel-stats', {
        body: {
          device_id: deviceId,
          start_date: startDate,
          end_date: endDate,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (error) {
        throw new Error(error.message || 'Failed to fetch daily travel stats')
      }

      if (!data) {
        throw new Error('No data returned from daily travel stats')
      }

      return data
    },
    enabled: enabled && !!deviceId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 60_000, // keep "today" tiles current without relying on reloads
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}
