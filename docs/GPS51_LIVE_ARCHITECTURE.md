# GPS51 Integration & Live Data Architecture

## 1. Current Logic & Process
The current system uses a **"Sync & Normalize"** architecture designed to respect GPS51's strict rate limits (IP blocking) while providing structured data for the application.

### The Flow
1.  **Ingestion (Edge Function):** 
    -   `sync-gps51-trips` runs periodically (CRON) or on-demand.
    -   It calls the GPS51 API (`/openapi?action=get_history`) using a centralized rate-limiter (`gps51-client.ts`).
2.  **Raw Storage:** 
    -   The raw JSON response is saved into the `gps51_trips` table. This provides an audit trail and allows re-processing.
3.  **Normalization (Database Trigger):** 
    -   A PostgreSQL Trigger (`trigger_sync_gps51_trips`) listens for inserts on `gps51_trips`.
    -   It automatically transforms the raw data into the clean `vehicle_trips` schema (standardizing units, timestamps, and IDs).
4.  **Consumption:** 
    -   The Frontend (PWA) and Chat Agent query `vehicle_trips` (for history) and `vehicle_daily_stats` (for aggregated reports).

### Why this approach?
*   **Rate Limits:** GPS51 allows limited calls per second. Fetching full history "live" every time a user views a profile would crash the connection.
*   **Performance:** Database queries are milliseconds; GPS51 API calls are seconds.
*   **Data Integrity:** "Trips" are historical facts. They don't change, so caching them in a DB is the correct architectural choice.

---

## 2. Recommendation: "100% Live" Hybrid Architecture
To achieve the user's goal of a "Simpler and More Realistic" live experience, we should not abandon the database (which is needed for reports) but **bypass it for real-time status**.

### The Hybrid Plan
We recommend splitting the data flow into two distinct paths:

#### Path A: The "Live Stream" (For Map & Status)
*   **Goal:** Show the moving car, current speed, and ignition status with ZERO latency.
*   **Mechanism:** **Direct Proxy**.
*   **Implementation:** 
    -   Create a new Edge Function: `get-vehicle-live-status`.
    -   This function calls GPS51's `get_position` API *directly* when the Frontend requests it.
    -   It does **not** write to the database (read-only).
    -   It returns the exact current state from the tracker.
*   **Frontend:** The "Vehicle Header" and "Map" component call this function every 10-30 seconds.

#### Path B: The "Lazy Sync" (For Reports & Mileage)
*   **Goal:** Accurate Daily/Monthly reports.
*   **Mechanism:** **On-Demand Sync**.
*   **Implementation:**
    -   Keep the existing `vehicle_trips` table (it's essential for "Total Mileage" calculations).
    -   When the user opens the "Reports" tab, trigger a background sync (`sync-gps51-trips`) if the data is > 5 minutes old.
    -   Show the cached data immediately, then update if the sync finds new trips.

---

## 3. Displaying Reports on PWA
To display professional Trip Reports and Mileage on the PWA profile:

### Recommended Stack
*   **Charts:** `Recharts` (React library) for bar charts (Daily Mileage) and line charts (Efficiency).
*   **Data Source:** `vehicle_daily_stats` (Database View).

### Layout Strategy
1.  **Summary Cards (Top):**
    -   "Today's Mileage" (Large text)
    -   "Drive Time"
    -   "Avg Speed"
2.  **Interactive Tabs:**
    -   **[History]:** A list of today's trips.
        -   *Format:* `08:00 AM - Home → Office (15 km)`
    -   **[Analytics]:** A Bar Chart showing the last 7 days of mileage.
3.  **Export Action:** A button to "Download CSV" (generated from `vehicle_trips`).

---

## 4. Vehicle Chat Agent Access
The Chat Agent needs to know "What is happening NOW" and "What happened BEFORE".

### How it Accesses Data
1.  **Historical Logic (Tools):**
    -   `get_trip_history`: Queries `vehicle_trips` table.
    -   `get_trip_analytics`: Queries `vehicle_daily_stats` view.
    -   *These allow the agent to answer "How many km did I drive last week?"*

2.  **Live Logic (New Tool):**
    -   **`force_sync_gps51`**: A new tool we will add.
    -   *Usage:* When a user asks "Where am I?" or "Did I just stop?", the Agent calls this tool FIRST.
    -   This forces the "Ingestion" layer to run immediately, updating the DB.
    -   Then the Agent queries the DB, ensuring it has the latest data.

### Summary
The Agent doesn't need "direct access to all tables" (which is messy). It needs **Tools** that wrap these tables into logical questions (History, Live Status, Analytics).
