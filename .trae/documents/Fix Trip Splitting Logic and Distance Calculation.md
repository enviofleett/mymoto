I have diagnosed the issue:
1.  **Excessive Trip Count (60+ vs 3):** The current logic splits a trip every time the ignition signal flickers (ON->OFF->ON) or during very short stops. The GPS51 platform filters these out, treating them as continuous trips.
2.  **Distance Accuracy:** The current logic relies on an `odometer` field that is missing from the historical data table (`position_history`), leading to potential 0km or erratic distance values.

To fix this, I will create a new database migration that updates the `get_vehicle_trips_optimized` function with the following improvements:
1.  **Gap-Based Trip Detection:** Instead of splitting on every ignition change, I will only split a trip if the vehicle has been **OFF or silent for more than 3 minutes**. This will merge "flickering" signals and short stops into a single continuous trip, matching GPS51's logic.
2.  **GPS-Based Distance Calculation:** I will switch to calculating distance using the GPS coordinates (Sum of Geodetic Distances) instead of the unreliable odometer history. This ensures accurate mileage even for historical data.

### Technical Implementation Steps
1.  **Create Migration:** `20260129000008_fix_trip_splitting_and_distance.sql`
2.  **Update Logic:**
    -   Filter raw data to `ignition_on = true`.
    -   Calculate time gaps between consecutive points.
    -   Start new trip only if `gap > 3 minutes`.
    -   Calculate distance using `ST_Distance(current_point, prev_point)` summed per trip.
3.  **Apply Migration:** Run `npx supabase db push`.
