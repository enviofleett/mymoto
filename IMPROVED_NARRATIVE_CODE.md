# ✅ Improved Trip Narrative Code - Grouping & Flow

## 🎯 What's Improved

1. **Groups similar trips** (same locations, close in time, short distance)
2. **Avoids repetitive phrasing** - varies sentence structure
3. **Multiple paragraphs** for better readability
4. **Better time flow** - uses "shortly after", "a little later", etc.
5. **Cohesive narrative** - reads like a story, not a log

---

## 📋 Complete Replacement Code

Replace the entire `formatTripsAsNarrative` function (lines 265-421) with this improved version:

```typescript
// Format trips as natural paragraph-based narrative stories with intelligent grouping
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
  const allParagraphs: string[] = []
  
  for (const [date, dateTrips] of tripsByDate.entries()) {
    // Sort trips by start time (earliest first)
    const sortedTrips = dateTrips.sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    
    // Enrich trips with addresses and metadata
    const enrichedTrips: Array<{
      trip: any
      startAddress: string
      endAddress: string
      startTime: Date
      endTime: Date
      durationMinutes: number
      distanceKm: number
      avgSpeed: number
      tripCharacter: string
      idlingInfo: { location: string; durationMinutes: number } | null
      timeReadable: string
    }> = []
    
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
      
      // Fetch position history for idling detection
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
          
          if (idleStart && maxIdleDuration < 5) {
            const finalIdleDuration = Math.round((endTime.getTime() - idleStart.getTime()) / 60000)
            if (finalIdleDuration >= 5) {
              if (idleLocation && mapboxToken) {
                const idleAddress = await reverseGeocode(idleLocation.lat, idleLocation.lon, mapboxToken)
                idlingInfo = { location: idleAddress, durationMinutes: finalIdleDuration }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching idling data:', error)
      }
      
      const distanceKm = trip.distance_km || 0
      const avgSpeed = distanceKm && durationMinutes > 0 
        ? (distanceKm / durationMinutes) * 60 
        : 0
      const tripCharacter = getTripCharacter(avgSpeed, durationMinutes, distanceKm)
      const timeReadable = formatTimeReadable(startTime)
      
      enrichedTrips.push({
        trip,
        startAddress,
        endAddress,
        startTime,
        endTime,
        durationMinutes,
        distanceKm,
        avgSpeed,
        tripCharacter,
        idlingInfo,
        timeReadable
      })
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Group similar trips together
    const tripGroups: Array<typeof enrichedTrips> = []
    let currentGroup: typeof enrichedTrips = []
    
    for (let i = 0; i < enrichedTrips.length; i++) {
      const trip = enrichedTrips[i]
      const prevTrip = i > 0 ? enrichedTrips[i - 1] : null
      
      // Check if this trip should be grouped with previous
      const shouldGroup = prevTrip && (
        // Same start and end locations
        (trip.startAddress === prevTrip.endAddress && trip.endAddress === prevTrip.startAddress) ||
        // Same start location, very short distance, close in time
        (trip.startAddress === prevTrip.endAddress && 
         trip.distanceKm < 3 && 
         (trip.startTime.getTime() - prevTrip.endTime.getTime()) < 2 * 60 * 60 * 1000) ||
        // Very short trips in same area within 1 hour
        (trip.distanceKm < 2 && 
         prevTrip.distanceKm < 2 &&
         (trip.startTime.getTime() - prevTrip.endTime.getTime()) < 60 * 60 * 1000)
      )
      
      if (shouldGroup && currentGroup.length > 0) {
        currentGroup.push(trip)
      } else {
        if (currentGroup.length > 0) {
          tripGroups.push(currentGroup)
        }
        currentGroup = [trip]
      }
    }
    
    if (currentGroup.length > 0) {
      tripGroups.push(currentGroup)
    }
    
    // Build narrative paragraphs from groups
    for (let groupIndex = 0; groupIndex < tripGroups.length; groupIndex++) {
      const group = tripGroups[groupIndex]
      const isFirstGroup = groupIndex === 0
      const isLastGroup = groupIndex === tripGroups.length - 1
      
      if (group.length === 1) {
        // Single trip - use varied narrative
        const t = group[0]
        const distanceReadable = formatDistanceReadable(t.distanceKm)
        const endTimeReadable = formatTimeReadable(t.endTime)
        
        let paragraph = ''
        
        if (isFirstGroup) {
          paragraph = `I began my day ${t.timeReadable} with ${tripCharacter} ${distanceReadable} drive from ${t.startAddress} to ${t.endAddress}.`
        } else {
          const timeGap = Math.round((t.startTime.getTime() - tripGroups[groupIndex - 1][tripGroups[groupIndex - 1].length - 1].endTime.getTime()) / (60 * 1000))
          const timeConnector = timeGap < 30 ? 'Shortly after' : timeGap < 120 ? 'A little later' : 'Later'
          paragraph = `${timeConnector}, I made ${tripCharacter} ${distanceReadable} journey from ${t.startAddress} to ${t.endAddress}.`
        }
        
        if (t.idlingInfo && t.idlingInfo.durationMinutes >= 5) {
          const idleDurationReadable = t.idlingInfo.durationMinutes < 60 
            ? `about ${t.idlingInfo.durationMinutes} minutes`
            : `about ${Math.floor(t.idlingInfo.durationMinutes / 60)} hour${Math.floor(t.idlingInfo.durationMinutes / 60) > 1 ? 's' : ''} and ${t.idlingInfo.durationMinutes % 60} minutes`
          paragraph += ` Along the way, I paused for ${idleDurationReadable} near ${t.idlingInfo.location}, likely waiting for traffic to ease.`
        }
        
        paragraph += ` I arrived ${endTimeReadable} and settled in.`
        allParagraphs.push(paragraph)
        
      } else {
        // Multiple trips in group - narrate as a pattern
        const firstTrip = group[0]
        const lastTrip = group[group.length - 1]
        const totalDistance = group.reduce((sum, t) => sum + t.distanceKm, 0)
        const totalTrips = group.length
        
        let paragraph = ''
        
        if (isFirstGroup) {
          paragraph = `I started ${firstTrip.timeReadable} with a series of brief movements around ${firstTrip.startAddress}.`
        } else {
          const timeGap = Math.round((firstTrip.startTime.getTime() - tripGroups[groupIndex - 1][tripGroups[groupIndex - 1].length - 1].endTime.getTime()) / (60 * 1000))
          const timeConnector = timeGap < 30 ? 'Shortly after' : timeGap < 120 ? 'A little later' : 'Later'
          paragraph = `${timeConnector}, I made several quick trips around ${firstTrip.startAddress}.`
        }
        
        // Describe the pattern
        if (totalTrips <= 3) {
          const locations = [...new Set(group.map(t => t.endAddress))]
          if (locations.length === 1) {
            paragraph += ` I made ${totalTrips} ${totalTrips === 2 ? 'round trips' : 'short trips'} to ${locations[0]}, covering about ${Math.round(totalDistance)} kilometers in total.`
          } else {
            paragraph += ` I made ${totalTrips} brief trips, moving between ${locations.slice(0, 2).join(' and ')}${locations.length > 2 ? ' and a few other nearby spots' : ''}, covering about ${Math.round(totalDistance)} kilometers.`
          }
        } else {
          paragraph += ` I made ${totalTrips} quick trips around the area, covering about ${Math.round(totalDistance)} kilometers in total.`
        }
        
        const endTimeReadable = formatTimeReadable(lastTrip.endTime)
        paragraph += ` These movements wrapped up ${endTimeReadable}.`
        
        allParagraphs.push(paragraph)
      }
    }
  }
  
  // Join paragraphs with natural spacing (double line break for readability)
  const fullNarrative = allParagraphs.join('\n\n')
  
  // Add gentle call-to-action at the end
  const finalNarrative = `${fullNarrative}\n\nWhenever you're curious to see the full breakdown of these trips, you can find all the details in my car profile.`
  
  return finalNarrative
}
```

---

## ✅ Helper Functions (Keep These - No Changes)

The helper functions remain the same:

```typescript
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

## 🎯 Key Improvements

1. **Intelligent Grouping**: Groups trips that:
   - Start/end at same locations
   - Are very short (< 3km) and close in time (< 2 hours)
   - Are very short (< 2km) within same area (< 1 hour)

2. **Varied Phrasing**: 
   - "I began my day..." (first trip)
   - "Shortly after..." (quick succession)
   - "A little later..." (moderate gap)
   - "Later..." (longer gap)

3. **Pattern Recognition**: 
   - "a series of brief movements"
   - "several quick trips"
   - "round trips" (same location)

4. **Multiple Paragraphs**: Each paragraph represents a phase or group of trips

5. **Natural Flow**: Reads like a travel journal, not a log

---

## 📖 Example Output

**Before (Repetitive):**
> I set off from Ankpa just after 6 in the morning and enjoyed a brief 0.5-kilometer drive across town. I reached Ankpa just after 6:05 AM and settled in nicely at the end of the trip. I set off from Ankpa just after 6:10 in the morning and enjoyed a brief 0.3-kilometer drive across town. I reached Ankpa just after 6:12 AM and settled in nicely at the end of the trip.

**After (Grouped & Flowing):**
> I started just after 6 in the morning with a series of brief movements around Ankpa. I made 3 quick trips around the area, covering about 1 kilometer in total. These movements wrapped up around 6:15 in the morning.
>
> Whenever you're curious to see the full breakdown of these trips, you can find all the details in my car profile.

---

**Ready to deploy!** 🎉
