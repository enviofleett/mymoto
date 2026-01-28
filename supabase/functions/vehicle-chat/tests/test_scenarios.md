# Vehicle Chat Test Scenarios

This document outlines various chat scenarios to test the LLM and vehicle data integration. You can use these queries to verify the intent classification, date extraction, and command parsing logic.

## 1. Location & Real-time Status
*Tests real-time GPS data fetching and geocoding.*

| Query | Expected Intent | Notes |
|-------|-----------------|-------|
| "Where is my vehicle right now?" | `location` | Should return current address/coordinates. |
| "Show me the current location" | `location` | Standard location query. |
| "Is the car parked?" | `location` | Checks status (moving vs parked). |
| "What is the current speed?" | `location`/`stats` | Real-time telemetry check. |

## 2. Trip History & Temporal Context
*Tests date extraction ('yesterday', 'last week') and historical trip aggregation.*

| Query | Expected Intent | Date Context | Notes |
|-------|-----------------|--------------|-------|
| "Show me my last trip" | `trip` | `last_trip` | Should fetch the most recent trip. |
| "Did I drive anywhere yesterday?" | `trip` | `yesterday` | Checks trips within yesterday's range. |
| "How many miles did I cover last week?" | `trip`/`stats` | `last_week` | Aggregates mileage for the past week. |
| "Show trips from Jan 1st to Jan 5th" | `trip` | `custom` | Tests specific date parsing. |
| "Where did I go last Tuesday?" | `trip` | `custom` | Tests relative day parsing (e.g., "last Tuesday"). |

## 3. Vehicle Stats & Health
*Tests aggregation of vehicle metrics and status checks.*

| Query | Expected Intent | Notes |
|-------|-----------------|-------|
| "What is my average fuel consumption?" | `stats` | Requires aggregation of fuel data. |
| "Check battery health" | `maintenance` | Checks latest battery voltage/status. |
| "Any maintenance alerts?" | `maintenance` | Queries active DTCs or alerts. |
| "Total distance driven this month" | `stats` | Monthly aggregation. |

## 4. Commands & Control
*Tests command parsing and security/confirmation flows.*

| Query | Detected Command | Parameters | Notes |
|-------|------------------|------------|-------|
| "Immobilize the engine" | `immobilize` | None | **Dangerous**: Should trigger confirmation dialog. |
| "Set a geofence around here" | `enable_geofence` | `{ location: 'current' }` | Sets virtual perimeter. |
| "Turn off the engine" | `stop_engine` | None | Command alias check. |
| "Alert me when I leave Lagos" | `create_geofence_alert` | `{ trigger: 'exit', location: 'Lagos' }` | Complex command parsing. |

## 5. Ambiguous & Contextual
*Tests the system's ability to infer intent from context.*

| Query | Expected Behavior |
|-------|-------------------|
| "Was I speeding then?" | Should look at the *previously discussed* trip/time. |
| "How much fuel did that use?" | Contextual follow-up to a trip query. |
| "Show me the map" | Should trigger UI action to display map view. |

---

## How to Test

### Option 1: Run Logic Tests (Local)
If you have Deno installed, you can run the logic verification script:
```bash
deno run supabase/functions/vehicle-chat/tests/run_intent_tests.ts
```

### Option 2: Live Endpoint Test (Curl)
Use the `run_curl_tests.sh` script to send these queries to your running Edge Function.
```bash
sh supabase/functions/vehicle-chat/tests/run_curl_tests.sh
```
