# 📋 Code to Copy for Paragraph-Based Trip Narrative

## 🔧 Replace This Function

Find the `formatTripsAsNarrative` function in `supabase/functions/vehicle-chat/index.ts` (around line 265) and replace it with the code below.

---

## ✅ Complete Function Code

```typescript
// Format trips as natural paragraph-based narrative stories
async function formatTripsAsNarrative(
  trips: any[],
  mapboxToken: string | null,
  dateLabel: string,
  supabase: any,
  deviceId: string
): Promise<string> {
  if (!trips || trips.length === 0) {
    return ''
  }
  
  // Group trips by date
  const tripsByDate = new Map<string, any[]>()
  trips.forEach(trip => {
    const tripDate = new Date(trip.start_time).toISOString().split('T')[0]
    if (!tripsByDate.has(tripDate)) {
      tripsByDate.set(tripDate, [])
    }
    tripsByDate.get(tripDate)!.push(trip)
  })
  
  // Process each date's trips into natural paragraph narratives
  const narrativeParagraphs: string[] = []
  
  for (const [date, dateTrips] of tripsByDate.entries()) {
    // Sort trips by start time (earliest first)
    const sortedTrips = dateTrips.sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    
    // Build paragraph for each trip
    for (const trip of sortedTrips) {
      const startTime = new Date(trip.start_time)
      const endTime = new Date(trip.end_time)
      const durationMs = endTime.getTime() - startTime.getTime()
      const durationMinutes = Math.round(durationMs / 60000)
      
      // Get addresses
      const startAddress = mapboxToken 
        ? await reverseGeocode(trip.start_latitude, trip.start_longitude, mapboxToken)
        : `${trip.start_latitude.toFixed(4)}, ${trip.start_longitude.toFixed(4)}`
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const endAddress = mapboxToken
        ? await reverseGeocode(trip.end_latitude, trip.end_longitude, mapboxToken)
        : `${trip.end_latitude.toFixed(4)}, ${trip.end_longitude.toFixed(4)}`
      
      // Fetch position history for this trip to detect idling
      let idlingInfo: { location: string; durationMinutes: number } | null = null
      try {
        const { data: positions } = await supabase
          .from('position_history')
          .select('latitude, longitude, speed, gps_time, ignition_on')
          .eq('device_id', deviceId)
          .gte('gps_time', trip.start_time)
          .lte('gps_time', trip.end_time)
          .order('gps_time', { ascending: true })
          .limit(200)
        
        if (positions && positions.length > 0) {
          // Detect idling periods (speed < 2 km/h for 5+ minutes)
          let idleStart: Date | null = null
          let maxIdleDuration = 0
          let idleLocation: { lat: number; lon: number } | null = null
          
          for (let i = 0; i < positions.length; i++) {
            const pos = positions[i]
            const speed = pos.speed || 0
            
            if (speed < 2 && pos.ignition_on) {
              if (!idleStart) {
                idleStart = new Date(pos.gps_time)
                idleLocation = { lat: pos.latitude, lon: pos.longitude }
              }
            } else {
              if (idleStart) {
                const idleDuration = Math.round((new Date(pos.gps_time).getTime() - idleStart.getTime()) / 60000)
                if (idleDuration >= 5 && idleDuration > maxIdleDuration) {
                  maxIdleDuration = idleDuration
                  if (idleLocation && mapboxToken) {
                    const idleAddress = await reverseGeocode(idleLocation.lat, idleLocation.lon, mapboxToken)
                    idlingInfo = { location: idleAddress, durationMinutes: idleDuration }
                  }
                }
                idleStart = null
                idleLocation = null
              }
            }
          }
          
          // Check final idle period
          if (idleStart && maxIdleDuration < 5) {
            const finalIdleDuration = Math.round((endTime.getTime() - idleStart.getTime()) / 60000)
            if (finalIdleDuration >= 5) {
              maxIdleDuration = finalIdleDuration
              if (idleLocation && mapboxToken) {
                const idleAddress = await reverseGeocode(idleLocation.lat, idleLocation.lon, mapboxToken)
                idlingInfo = { location: idleAddress, durationMinutes: finalIdleDuration }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching idling data:', error)
        // Continue without idling info
      }
      
      // Format times in human-readable way
      const startTimeReadable = formatTimeReadable(startTime)
      const endTimeReadable = formatTimeReadable(endTime)
      
      // Format distance in human-readable way
      const distanceReadable = formatDistanceReadable(trip.distance_km || 0)
      
      // Determine trip character
      const avgSpeed = trip.distance_km && durationMinutes > 0 
        ? (trip.distance_km / durationMinutes) * 60 
        : 0
      const tripCharacter = getTripCharacter(avgSpeed, durationMinutes, trip.distance_km || 0)
      
      // Build natural paragraph narrative
      let paragraph = `I set off from ${startAddress} ${startTimeReadable} and enjoyed ${tripCharacter} ${distanceReadable} drive across town.`
      
      // Add idling information if present
      if (idlingInfo && idlingInfo.durationMinutes >= 5) {
        const idleDurationReadable = idlingInfo.durationMinutes < 60 
          ? `about ${idlingInfo.durationMinutes} minutes`
          : `about ${Math.floor(idlingInfo.durationMinutes / 60)} hour${Math.floor(idlingInfo.durationMinutes / 60) > 1 ? 's' : ''} and ${idlingInfo.durationMinutes % 60} minutes`
        paragraph += ` Along the way, I paused for ${idleDurationReadable} near ${idlingInfo.location}, likely waiting for traffic to ease, before continuing on.`
      }
      
      paragraph += ` I reached ${endAddress} ${endTimeReadable} and settled in nicely at the end of the trip.`
      
      narrativeParagraphs.push(paragraph)
      
      // Small delay between trips
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  // Join all paragraphs with natural spacing
  const fullNarrative = narrativeParagraphs.join(' ')
  
  // Add gentle call-to-action at the end
  const finalNarrative = `${fullNarrative} Whenever you're curious to see the full breakdown of these trips, you can find all the details in my car profile.`
  
  return finalNarrative
}

// Helper: Format time in human-readable way
function formatTimeReadable(date: Date): string {
  const hour = date.getHours()
  const minute = date.getMinutes()
  const period = hour >= 12 ? 'in the afternoon' : 'in the morning'
  const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  
  if (minute === 0) {
    return `just after ${hour12} ${period}`
  } else if (minute < 10) {
    return `just after ${hour12} ${period}`
  } else if (minute < 30) {
    return `around ${hour12}:${minute.toString().padStart(2, '0')} ${period}`
  } else if (minute < 45) {
    return `a little before ${hour === 12 ? 1 : hour + 1} ${period}`
  } else {
    return `a little before ${hour === 12 ? 1 : hour + 1} ${period}`
  }
}

// Helper: Format distance in human-readable way
function formatDistanceReadable(distanceKm: number): string {
  if (distanceKm < 1) {
    return 'a very short'
  } else if (distanceKm < 5) {
    return `a short ${Math.round(distanceKm)}-kilometer`
  } else if (distanceKm < 15) {
    return `a smooth ${Math.round(distanceKm)}-kilometer`
  } else if (distanceKm < 30) {
    return `a decent ${Math.round(distanceKm)}-kilometer`
  } else {
    return `a long ${Math.round(distanceKm)}-kilometer`
  }
}

// Helper: Determine trip character based on speed and duration
function getTripCharacter(avgSpeed: number, durationMinutes: number, distanceKm: number): string {
  if (avgSpeed < 20 && durationMinutes > 30) {
    return 'a relaxed'
  } else if (avgSpeed > 50 && durationMinutes < 20) {
    return 'a quick'
  } else if (distanceKm < 5) {
    return 'a brief'
  } else {
    return 'a smooth'
  }
}
```

---

## 🔄 Update Function Call

Find the function call around line 1148 and update it to include `supabase` and `device_id`:

**Before:**
```typescript
tripNarrativeData = await formatTripsAsNarrative(
  dateSpecificTrips,
  MAPBOX_ACCESS_TOKEN,
  dateContext.humanReadable
)
```

**After:**
```typescript
tripNarrativeData = await formatTripsAsNarrative(
  dateSpecificTrips,
  MAPBOX_ACCESS_TOKEN,
  dateContext.humanReadable,
  supabase,
  device_id
)
```

---

## 📝 System Prompt Updates

The system prompt sections have already been updated in the file. If you need to verify, check around lines 1730-1750 and 1805-1820 for the trip narrative instructions.

---

## ✅ Ready to Deploy

After copying the code above:

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase functions deploy vehicle-chat
```

---

**All code is ready to copy and paste!** 🎉
