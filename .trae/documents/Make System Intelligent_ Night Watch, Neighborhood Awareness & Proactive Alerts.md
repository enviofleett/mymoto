I have analyzed the current "AI Brain" and identified the gaps preventing it from being fully "intelligent" as you requested.

**Current Capabilities:**
- ✅ **Movement:** Already has a `vehicle_moving` trigger (detects speed > 5km/h).
- ✅ **Learned Locations:** Already learns "Home" and "Work" automatically.
- ✅ **Geofences:** Supports user-created zones.

**Missing "Intelligence" (The Gaps):**
1.  **Night Parking Anomaly:** The system knows "Home", but it doesn't **complain** if you park somewhere else at night. It just logs it.
2.  **Neighborhood Awareness:** It relies on generic addresses. It doesn't specifically recognize "Garki" or "Wuse" as "Key Areas" to get excited about.
3.  **Proactive Engagement:** `vehicle_moving` alerts are currently "opt-in" (disabled by default), so most users miss the "Vehicle started moving!" magic.

**My Plan to Make it "Very Intelligent":**

1.  **Enable "Movement" & "Geofence" by Default:**
    - I will update the "Smart Defaults" logic in `handle-vehicle-event` to include `vehicle_moving` and `geofence_enter`. Now, users will immediately get "I'm rolling!" alerts without digging into settings.

2.  **Implement "Night Parking Watchdog":**
    - I will create a new detection logic (Database Trigger):
        - **Trigger:** When Ignition turns **OFF**.
        - **Condition:** Time is between **9 PM and 5 AM** (Lagos Time).
        - **Check:** Am I at "Home"? (Distance > 500m from learned Home).
        - **Action:** If NOT at Home, trigger a new event: `night_parking_anomaly`.
    - **AI Behavior:** The AI will text: *"I noticed we parked at [Location] for the night, which is different from our usual spot. Is this a new safe parking space?"*

3.  **Enhance Neighborhood Recognition (Abuja Special):**
    - I will update the `vehicle-chat` logic to specifically look for key Abuja districts (Garki, Wuse, Maitama, Asokoro, Central Business District).
    - **Effect:** Instead of "I am at 123 Some Street", the AI will say *"I just entered the **Garki** district."* giving it that local flavor.

4.  **Proactive "Favorite Place" Greetings:**
    - I will wire up the `learned_locations` logic so that when you arrive at a "Frequent" spot, the AI proactively says *"Welcome back to [Custom Name]! I'll wait here."*

This moves the system from "Passive Recorder" to "Active Companion".