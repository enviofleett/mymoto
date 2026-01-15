# AI Training Scenarios System - Implementation Guide

## Overview

The AI Training Scenarios system allows admins to train the vehicle AI on how to respond to specific types of questions. This provides fine-grained control over AI behavior for different scenarios.

---

## Features

### ✅ What's Implemented

1. **Database Schema**
   - `ai_training_scenarios` table with comprehensive fields
   - RLS policies (admins can manage, everyone can read active scenarios)
   - Default scenarios pre-populated

2. **Admin UI**
   - Full CRUD interface for managing scenarios
   - Search and filter capabilities
   - Priority-based ordering
   - Active/inactive toggle

3. **AI Integration**
   - Automatic scenario matching based on question patterns
   - Priority-based scenario selection (top 3 matches)
   - Scenario guidance injected into system prompt
   - Context requirements checking

---

## Database Schema

### Table: `ai_training_scenarios`

**Key Fields:**
- `name` - Scenario name (e.g., "Location Queries")
- `scenario_type` - Category (location_query, battery_status, etc.)
- `question_patterns` - Array of keywords that trigger this scenario
- `response_guidance` - Instructions for how AI should respond
- `priority` - Priority level (0-100, higher = checked first)
- `is_active` - Whether scenario is active
- `requires_*` - Context requirements flags

**Default Scenarios Included:**
- Location Queries (Priority: 90)
- Battery Status (Priority: 85)
- Trip History (Priority: 80)
- Maintenance Reminders (Priority: 75)
- Speed and Safety (Priority: 70)

---

## How It Works

### 1. Scenario Matching

When a user sends a message:
1. System loads all active scenarios (ordered by priority)
2. Checks if user's message contains any scenario's question patterns
3. Selects top 3 matching scenarios (by priority)
4. Injects scenario guidance into system prompt

### 2. Pattern Matching

Patterns are simple keyword matching:
- User message: "Where are you?"
- Scenario pattern: "where"
- **Match!** → Scenario guidance is included

### 3. Response Guidance

Scenario guidance is added to the system prompt:
```
## RELEVANT TRAINING SCENARIOS (1 matched)

### Scenario 1: Location Queries (Priority: 90)
RESPONSE GUIDANCE:
Always include the current location with coordinates...
```

---

## Admin UI Usage

### Access
Navigate to: **Admin Dashboard → AI Brain Settings → Training Scenarios Tab**

### Creating a Scenario

1. Click **"New Scenario"** button
2. Fill in required fields:
   - **Name**: Descriptive name
   - **Scenario Type**: Category dropdown
   - **Question Patterns**: Keywords that trigger this scenario
   - **Response Guidance**: Instructions for AI
3. Set optional fields:
   - **Priority**: 0-100 (higher = checked first)
   - **Context Requirements**: What data is needed
   - **Examples**: Example questions/responses
4. Click **"Save Scenario"**

### Editing a Scenario

1. Click **Edit** icon on scenario card
2. Modify fields as needed
3. Click **"Save Scenario"**

### Activating/Deactivating

- Toggle the **Active** switch on scenario card
- Or use the switch in edit dialog

### Priority Management

- Higher priority scenarios are checked first
- If multiple scenarios match, top 3 are included
- Recommended priorities:
  - Critical scenarios: 90-100
  - Common scenarios: 70-89
  - General scenarios: 50-69
  - Fallback scenarios: 0-49

---

## Best Practices

### 1. Question Patterns

**Good Patterns:**
- Specific keywords: `["where", "location", "position"]`
- Common phrases: `["battery level", "how much charge"]`
- Variations: `["trip", "journey", "drive", "traveled"]`

**Avoid:**
- Too generic: `["the", "a", "is"]`
- Too specific: `["where are you right now at this exact moment"]`

### 2. Response Guidance

**Good Guidance:**
```
Always include the current location with coordinates. 
Use the [LOCATION: lat, lon, "address"] tag format. 
Be specific about the address if available. 
Include timestamp of when location was last updated.
```

**Avoid:**
- Vague instructions: "Be helpful"
- Contradictory rules: "Be brief but also detailed"

### 3. Priority Setting

- **90-100**: Critical scenarios (location, safety, battery)
- **70-89**: Common scenarios (trips, status)
- **50-69**: General scenarios
- **0-49**: Fallback scenarios

### 4. Context Requirements

Enable context requirements only if:
- Scenario absolutely needs that data
- Missing data would make response inaccurate
- Example: Location queries should require location data

---

## Example Scenarios

### Example 1: Location Query

```json
{
  "name": "Location Queries",
  "scenario_type": "location_query",
  "question_patterns": ["where", "location", "position", "address", "at"],
  "response_guidance": "Always include the current location with coordinates. Use the [LOCATION: lat, lon, \"address\"] tag format. Be specific about the address if available. Include timestamp of when location was last updated.",
  "priority": 90,
  "requires_location": true
}
```

### Example 2: Battery Status

```json
{
  "name": "Battery Status",
  "scenario_type": "battery_status",
  "question_patterns": ["battery", "charge", "power", "energy", "low battery"],
  "response_guidance": "Always mention the exact battery percentage. If below 20%, proactively warn about low battery. If below 10%, emphasize urgency. Suggest charging location if available.",
  "priority": 85,
  "requires_battery_status": true
}
```

---

## Testing

### Test Scenario Matching

1. Create a test scenario with pattern: `["test"]`
2. Send message: "This is a test"
3. Check edge function logs for: `[AI Training] Found X matching scenarios`
4. Verify scenario guidance appears in system prompt

### Test Priority

1. Create two scenarios with same pattern but different priorities
2. Send matching message
3. Verify higher priority scenario is selected first

### Test Context Requirements

1. Create scenario with `requires_location: true`
2. Test with vehicle that has location data
3. Test with vehicle without location data
4. Verify appropriate handling

---

## Troubleshooting

### Scenarios Not Matching

**Check:**
1. Scenario is `is_active: true`
2. Question patterns are correct (case-insensitive matching)
3. User message actually contains pattern keywords
4. Edge function logs show scenario loading

### Wrong Scenario Selected

**Check:**
1. Priority values are correct
2. Multiple scenarios don't have same priority
3. Pattern matching is working (check logs)

### Guidance Not Applied

**Check:**
1. Scenario is matching (check logs)
2. Response guidance field is not empty
3. System prompt includes scenario section (check logs)

---

## Migration

Run the migration:
```sql
-- File: supabase/migrations/20260114000006_create_ai_training_scenarios.sql
```

This will:
- Create `ai_training_scenarios` table
- Set up RLS policies
- Insert default scenarios

---

## Next Steps

1. **Run Migration**: Deploy `20260114000006_create_ai_training_scenarios.sql`
2. **Test Default Scenarios**: Try asking "Where are you?" or "What's my battery?"
3. **Create Custom Scenarios**: Add scenarios for your specific use cases
4. **Monitor Performance**: Check edge function logs for scenario matching

---

## Files Created

- ✅ `supabase/migrations/20260114000006_create_ai_training_scenarios.sql` - Database schema
- ✅ `src/components/admin/AiTrainingScenarios.tsx` - Admin UI component
- ✅ `src/pages/AdminAiSettings.tsx` - Updated with tabs
- ✅ `supabase/functions/vehicle-chat/index.ts` - Scenario matching logic

---

## Summary

The AI Training Scenarios system provides admins with powerful control over AI responses. By creating scenarios with specific patterns and guidance, you can ensure the AI responds appropriately to different types of questions while maintaining the vehicle's personality and style.

🎉 **System is ready to use!**
