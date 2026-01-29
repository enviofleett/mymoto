I have identified the cause of the "Ghost Ignition" issue where the LLM reports the vehicle is ON even when it's OFF.

**The Root Cause:**
The `vehicle-chat` function fetches the **latest known position** from the database (or GPS51). When a vehicle turns OFF, some GPS devices stop sending data immediately. This leaves the *last recorded state* in the database as "Ignition: ON".
The system calculates the "age" of this data (e.g., "2 hours ago"), but it **does not use this age to override the ignition status**. So the LLM receives context saying: `Ignition: ON (Data age: 2 hours)`. The LLM often prioritizes the explicit "ON" signal over the age.

**The Fix:**
I will implement a **"Staleness Override"** in the `vehicle-chat` edge function.
- **Logic:** If the latest data is older than **10 minutes** (`dataAgeSeconds > 600`), we will force `ignition_on` to `false`.
- **Why 10 minutes?** A moving vehicle (Ignition ON) typically sends updates every 10-30 seconds. If we haven't heard from it in 10 minutes, it is almost certainly OFF or in deep sleep.
- **Safety:** This only affects the *real-time context* passed to the Chat LLM. It **does not change** the database records, the `position_history` table, or the `vehicle_trips` logic we just fixed. Your trip reports and history will remain accurate.

**Implementation Plan:**
1.  **Modify `supabase/functions/vehicle-chat/index.ts`**:
    -   Locate the position retrieval logic (around line 2713).
    -   Add a check: `if (dataAgeSeconds > 600 && position.ignition_on)`.
    -   Action: Set `position.ignition_on = false` and append a debug note to `status_text`.
    -   Log the override to the console for debugging.
2.  **Deploy `vehicle-chat`**:
    -   Run `npx supabase functions deploy vehicle-chat`.

This ensures the LLM gives natural, accurate responses ("The vehicle is parked") without breaking the underlying data integrity.