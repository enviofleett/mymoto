import { useDailyTravelStats } from '@/hooks/useDailyTravelStats'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Clock, MapPin, TrendingUp, Car } from 'lucide-react'
import { formatLagos } from '@/lib/timezone'

interface DailyTravelStatsProps {
  deviceId: string
  startDate?: string
  endDate?: string
  showCard?: boolean
}

export function DailyTravelStats({ 
  deviceId, 
  startDate, 
  endDate,
  showCard = true 
}: DailyTravelStatsProps) {
  const { data, isLoading, error } = useDailyTravelStats({
    deviceId,
    startDate,
    endDate,
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-destructive">
            Error loading travel stats: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.daily_stats.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            No travel data found for the selected period (7am - 6pm daily)
          </div>
        </CardContent>
      </Card>
    )
  }

  const content = (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Distance</p>
                <p className="text-2xl font-bold">{parseFloat(data.summary.total_distance_km).toLocaleString()} km</p>
              </div>
              <MapPin className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Travel Time</p>
                <p className="text-2xl font-bold">
                  {Math.floor(parseFloat(data.summary.total_travel_time_minutes) / 60)}h{' '}
                  {Math.round(parseFloat(data.summary.total_travel_time_minutes) % 60)}m
                </p>
              </div>
              <Clock className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Trips</p>
                <p className="text-2xl font-bold">{data.summary.total_trips}</p>
              </div>
              <Car className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Days</p>
                <p className="text-2xl font-bold">{data.summary.total_days}</p>
              </div>
              <Calendar className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Breakdown */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Daily Breakdown (7am - 6pm)</h3>
        <div className="space-y-3">
          {data.daily_stats.map((day) => {
            const hours = Math.floor(day.total_travel_time_minutes / 60)
            const minutes = Math.round(day.total_travel_time_minutes % 60)
            
            return (
              <Card key={day.travel_date}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {formatLagos(day.travel_date, 'EEEE, MMM d, yyyy')}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {day.trip_count} {day.trip_count === 1 ? 'trip' : 'trips'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Distance</p>
                      <p className="text-sm font-semibold">{day.total_distance_km.toLocaleString()} km</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Travel Time</p>
                      <p className="text-sm font-semibold">
                        {hours}h {minutes}m
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Speed</p>
                      <p className="text-sm font-semibold">{day.avg_speed_kmh.toFixed(1)} km/h</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Max Speed</p>
                      <p className="text-sm font-semibold">{day.max_speed_kmh.toFixed(1)} km/h</p>
                    </div>
                  </div>
                  
                  {day.first_trip_start && (
                    <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                      First trip: {formatLagos(day.first_trip_start, 'h:mm a')} • 
                      Last trip: {formatLagos(day.last_trip_end, 'h:mm a')}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )

  if (!showCard) {
    return content
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Daily Travel Statistics
        </CardTitle>
        <CardDescription>
          Travel time and distance between 7am - 6pm (Lagos time)
          {data.date_range.start && data.date_range.end && (
            <span className="block mt-1">
              {formatLagos(data.date_range.start, 'MMM d')} - {formatLagos(data.date_range.end, 'MMM d, yyyy')}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}
