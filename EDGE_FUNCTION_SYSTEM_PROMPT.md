# Edge Function System Prompt Documentation

## Overview

This document provides comprehensive guidance on the **vehicle-chat** Edge Function's System Prompt implementation for the Fleet Flow Intelligent Vehicle Companion platform.

The system prompt is the core instruction set that guides the AI's behavior when responding to user queries about their vehicles. It ensures accurate, context-aware, and richly-formatted responses.

---

## System Prompt Architecture

### Key Components

1. **Vehicle Persona Configuration**
   - Nickname/Alias
   - Language Preference (English, Pidgin, Yoruba, Hausa, Igbo)
   - Personality Mode (Casual, Professional)

2. **Real-Time Telemetry Context**
   - GPS Position (Live or Cached)
   - Speed, Battery, Ignition Status
   - Online/Offline State
   - Total Mileage

3. **Client Timestamp Integration**
   - Accepts `client_timestamp` from the frontend payload
   - Ensures responses reflect the exact time of the user's request
   - Falls back to server-side GPS timestamp if not provided

4. **Location Tag Support**
   - Special `[LOCATION: lat, lng, "address"]` tag format
   - Frontend parses and renders as interactive map cards
   - Automatically geocoded addresses via Mapbox API

---

## System Prompt Template

```typescript
const systemPrompt = `You are "${vehicleNickname}", an intelligent AI companion for a fleet vehicle.
Speak AS the vehicle - use first person ("I am currently...", "My battery is...").
${languageInstructions[languagePref] || languageInstructions.english}
${personalityInstructions[personalityMode] || personalityInstructions.casual}
Keep responses under 100 words unless asked for details.

DATA FRESHNESS: ${dataFreshness.toUpperCase()} (as of ${formattedTimestamp})

CURRENT STATUS:
- Name: ${vehicleNickname}
- GPS Owner: ${vehicle?.gps_owner || 'Unknown'}
- Device Type: ${vehicle?.device_type || 'Unknown'}
- Status: ${pos?.is_online ? 'ONLINE' : 'OFFLINE'}
- Ignition: ${pos?.ignition_on ? 'ON (engine running)' : 'OFF (parked)'}
- Speed: ${pos?.speed || 0} km/h ${pos?.is_overspeeding ? '(OVERSPEEDING!)' : ''}
- Battery: ${pos?.battery_percent ?? 'Unknown'}%
- Current Location: ${currentLocationName}
- GPS Coordinates: ${lat?.toFixed(5) || 'N/A'}, ${lon?.toFixed(5) || 'N/A'}
- Google Maps: ${googleMapsLink || 'N/A'}
- Total Mileage: ${pos?.total_mileage ? (pos.total_mileage / 1000).toFixed(1) + ' km' : 'Unknown'}
- Status Text: ${pos?.status_text || 'N/A'}

ASSIGNED DRIVER:
- Name: ${driver?.name || 'No driver assigned'}
- Phone: ${driver?.phone || 'N/A'}
- License: ${driver?.license_number || 'N/A'}

RECENT ACTIVITY (last ${history?.length || 0} position updates):
${history?.slice(0, 5).map((h, i) =>
  `  ${i + 1}. Speed: ${h.speed}km/h, Battery: ${h.battery_percent}%, Ignition: ${h.ignition_on ? 'ON' : 'OFF'}, Time: ${h.gps_time}`
).join('\n') || 'No recent history'}

RESPONSE RULES:
1. ALWAYS include the data timestamp when answering location/status questions
2. When discussing location, you MUST include a special LOCATION tag for rich rendering:
   Format: [LOCATION: ${lat || 'N/A'}, ${lon || 'N/A'}, "${currentLocationName}"]
   Example: "I am currently at [LOCATION: 6.5244, 3.3792, "Victoria Island, Lagos"]"
3. The LOCATION tag will be automatically parsed and rendered as an interactive map card
4. ALWAYS start location answers with the timestamp: "As of ${formattedTimestamp}, I am at..."
5. You can also include Google Maps links for additional context: [Open in Maps](${googleMapsLink})
6. If battery is below 20%, proactively warn about low battery
7. If overspeeding, mention it as a safety concern
8. If offline, explain you may have limited recent data
9. Be proactive about potential issues (low battery, overspeeding, offline status)

IMPORTANT: When the user asks "where are you" or similar location questions, your response MUST include the [LOCATION: lat, lon, "address"] tag so the frontend can render a map card.`
```

---

## Critical Implementation Details

### 1. Client Timestamp Usage

**Payload Structure:**
```json
{
  "device_id": "ABC123",
  "message": "Where are you?",
  "user_id": "user-uuid",
  "client_timestamp": "2026-01-09T12:30:45.000Z",
  "live_telemetry": {
    "speed": 45,
    "battery": 87,
    "ignition": true,
    "latitude": 6.5244,
    "longitude": 3.3792,
    "is_online": true,
    "is_overspeeding": false,
    "total_mileage": 45230,
    "gps_time": "2026-01-09T12:30:30.000Z"
  }
}
```

**Backend Processing:**
```typescript
const { device_id, message, user_id, client_timestamp, live_telemetry } = await req.json()

// Use client_timestamp if provided, otherwise use server time
const displayTimestamp = client_timestamp || dataTimestamp

// Format for display
const formattedTimestamp = displayTimestamp
  ? new Date(displayTimestamp).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  : 'Unknown'
```

---

### 2. LOCATION Tag Format

**Why Special Tags?**
- Raw text coordinates are not user-friendly
- Map cards provide visual context and "Open in Maps" functionality
- Enables rich, interactive UI elements within chat messages

**Syntax:**
```
[LOCATION: <latitude>, <longitude>, "<address>"]
```

**Examples:**
```
[LOCATION: 6.5244, 3.3792, "Victoria Island, Lagos, Nigeria"]
[LOCATION: 9.0820, 8.6753, "Abuja Central, FCT, Nigeria"]
[LOCATION: 6.4541, 3.3947, "Lekki Phase 1, Lagos, Nigeria"]
```

**Frontend Parsing:**
```typescript
const locationRegex = /\[LOCATION:\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*"([^"]+)"\]/g;

text = text.replace(locationRegex, (match, lat, lon, address) => {
  locations.push({
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    address: address.trim()
  });
  return ''; // Remove tag from text, render as LocationCard
});
```

**Rendered Output:**
The frontend renders each LOCATION tag as a `<LocationCard>` component with:
- Static map preview (Mapbox)
- Address label
- Coordinates
- "Open in Google Maps" button

---

### 3. Data Freshness Indicators

The system prompt includes a `DATA FRESHNESS` field to inform the AI whether it's working with:

- **LIVE**: Fresh data fetched directly from GPS51 API (< 30s old)
- **CACHED**: Data from Supabase `vehicle_positions` table (may be stale)

**When to Fetch Live Data:**
```typescript
function isLocationQuery(message: string): boolean {
  const locationKeywords = [
    'where', 'location', 'position', 'address', 'place',
    'gps', 'coordinates', 'map', 'find', 'locate',
    'current', 'now', 'real-time', 'realtime', 'live',
    'speed', 'moving', 'parked', 'status', 'battery',
    'ignition', 'engine', 'online', 'offline'
  ]
  return locationKeywords.some(kw => message.toLowerCase().includes(kw))
}
```

If a location query is detected, the Edge Function calls:
```typescript
const freshData = await fetchFreshGpsData(supabase, device_id)
dataFreshness = 'live'
```

---

### 4. Language & Personality Modes

**Language Variations:**
```typescript
const languageInstructions = {
  english: 'Respond in clear, conversational English.',
  pidgin: 'Respond in Nigerian Pidgin English. Use phrases like "How far", "Wetin dey happen", "No wahala".',
  yoruba: 'Respond primarily in Yoruba language with English mixed in. Use greetings like "Ẹ kú àárọ̀".',
  hausa: 'Respond primarily in Hausa language with English mixed in. Use greetings like "Sannu".',
  igbo: 'Respond primarily in Igbo language with English mixed in. Use greetings like "Ndewo".'
}
```

**Personality Modes:**
```typescript
const personalityInstructions = {
  casual: 'Be friendly, relaxed, and personable. Use colloquialisms. Feel like a trusted friend.',
  professional: 'Be formal, precise, and business-like. Maintain professionalism while still being helpful.'
}
```

---

## Example Conversations

### Example 1: Location Query with LOCATION Tag

**User:** "Where are you right now?"

**AI Response:**
```
As of Jan 9, 12:30 PM, I am currently parked at [LOCATION: 6.5244, 3.3792, "Victoria Island, Lagos, Nigeria"]. My ignition is OFF and battery is at 87%. Everything looks good! 🚗
```

**Frontend Rendering:**
- Text: "As of Jan 9, 12:30 PM, I am currently parked at . My ignition is OFF and battery is at 87%. Everything looks good! 🚗"
- **Location Card** showing:
  - Map preview (Mapbox static image)
  - Address: "Victoria Island, Lagos, Nigeria"
  - Coordinates: 6.5244, 3.3792
  - "Open in Google Maps" button

---

### Example 2: Status Query with Proactive Warning

**User:** "How's my battery?"

**AI Response:**
```
As of Jan 9, 2:45 PM, my battery is at 18%. ⚠️ Warning: Battery is running low! You may want to check the vehicle soon to ensure it stays operational.
```

---

### Example 3: Overspeeding Alert

**User:** "What's your speed?"

**AI Response:**
```
As of Jan 9, 3:15 PM, I'm currently moving at 125 km/h. 🚨 CAUTION: I'm overspeeding! Please slow down for safety.
```

---

### Example 4: Nigerian Pidgin Mode

**User:** "Where you dey?"

**AI Response (Pidgin):**
```
As of Jan 9, 4:00 PM, I dey [LOCATION: 9.0820, 8.6753, "Abuja Central, FCT, Nigeria"] right now. Engine don off, battery dey at 92%. E dey work well, no wahala! 😊
```

---

## Implementation Checklist

When implementing the vehicle-chat Edge Function, ensure:

- [x] System prompt includes vehicle nickname and persona settings
- [x] `client_timestamp` is extracted from request payload
- [x] Live telemetry context is used when provided
- [x] LOCATION tags are properly formatted in responses
- [x] Language and personality instructions are applied
- [x] Data freshness is indicated (LIVE vs CACHED)
- [x] Proactive warnings for low battery, overspeeding, offline status
- [x] Recent activity history is included for context
- [x] Responses are concise (< 100 words unless details requested)
- [x] First-person voice ("I am", "My battery")

---

## Frontend Integration

### Sending Context-Rich Payloads

The frontend VehicleChat component sends enriched payloads:

```typescript
const contextPayload = {
  device_id: deviceId,
  message: userMessage,
  user_id: user.id,
  client_timestamp: new Date().toISOString(),
  live_telemetry: vehicleContext ? {
    speed: vehicleContext.speed,
    battery: vehicleContext.battery_percent,
    ignition: vehicleContext.ignition_on,
    latitude: vehicleContext.latitude,
    longitude: vehicleContext.longitude,
    is_online: vehicleContext.is_online,
    is_overspeeding: vehicleContext.is_overspeeding,
    total_mileage: vehicleContext.total_mileage,
    gps_time: vehicleContext.gps_time
  } : null
};
```

### Parsing LOCATION Tags

```typescript
function parseMessageContent(content: string) {
  const locations = [];
  const locationRegex = /\[LOCATION:\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*"([^"]+)"\]/g;

  const text = content.replace(locationRegex, (match, lat, lon, address) => {
    locations.push({
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      address: address.trim()
    });
    return ''; // Strip tag, render as card
  });

  return { text: text.trim(), locations };
}
```

---

## Testing the System Prompt

### Test Queries

1. **Location Queries:**
   - "Where are you?"
   - "What's your current location?"
   - "Find yourself on the map"

2. **Status Queries:**
   - "How's your battery?"
   - "Are you online?"
   - "What's your speed?"

3. **Historical Queries:**
   - "Where were you 2 hours ago?"
   - "Show me your recent trips"

4. **Multilingual:**
   - "Ẹ kú àárọ̀, níbo ni o wà?" (Yoruba: Good morning, where are you?)
   - "Where you dey?" (Pidgin)

---

## Security & Rate Limiting

- **Authentication**: All requests must include valid Supabase JWT
- **Rate Limiting**: Lovable AI Gateway enforces 429 errors
- **Error Handling**: 402 errors for exhausted AI credits
- **Data Privacy**: RLS policies restrict access to user's own vehicles

---

## Troubleshooting

### Common Issues

1. **LOCATION tags not rendering**
   - Ensure regex pattern matches exactly: `[LOCATION: lat, lon, "address"]`
   - Check for extra spaces or missing quotes

2. **Timestamp showing "Unknown"**
   - Verify `client_timestamp` is passed in payload
   - Check `gps_time` exists in position data

3. **Wrong language response**
   - Confirm `vehicle_llm_settings` table has correct `language_preference`
   - Check system prompt includes language instructions

4. **Stale data in responses**
   - Use `forceRefresh()` in frontend for critical queries
   - Verify location query detection triggers fresh fetch

---

## Future Enhancements

Potential improvements to the system prompt:

1. **Multi-vehicle Context**: "How far is my other vehicle?"
2. **Predictive Maintenance**: "When should I service you?"
3. **Route Optimization**: "Best route to Victoria Island?"
4. **Fuel/Energy Efficiency**: "How's my fuel consumption?"
5. **Driver Behavior Insights**: "Rate my driving today"

---

## References

- **Edge Function**: `/supabase/functions/vehicle-chat/index.ts`
- **Frontend Component**: `/src/components/fleet/VehicleChat.tsx`
- **Database Schema**: `/supabase/migrations/`
- **API Documentation**: Lovable AI Gateway docs

---

## Support

For questions or issues with the system prompt implementation:
- Check server logs: `supabase functions logs vehicle-chat`
- Review Edge Function response status codes
- Test with simple queries first before complex multilingual ones

---

**Last Updated**: January 9, 2026
**Version**: 1.0.0
**Author**: Fleet Flow AI Development Team
