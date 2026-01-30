I will implement the "Smart Trip History Search" feature by extending the existing `vehicle_trips` table and adding the required fuzzy search logic.

### **1. Database & Schema Updates (Supabase)**
*   **Modify `vehicle_trips` Table:**
    *   Add text columns to store address details (currently missing in the schema):
        *   `start_location_name` (e.g., "Murtala Muhammed Airport")
        *   `end_location_name`
        *   `start_address` (Full address)
        *   `end_address`
*   **Create PostgreSQL RPC Function (`search_locations_fuzzy`):**
    *   Implement a PL/pgSQL function that accepts a search query string.
    *   Use `ILIKE` with wildcards (`%query%`) to match against location names and addresses.
    *   Return distinct matching location names to support the clarification workflow.

### **2. Backend Logic (Edge Function / Service Layer)**
*   **Define TypeScript Interfaces:**
    *   `TripData`: Represents the full trip object.
    *   `ClarificationSuggestion`: Represents a suggested location name when ambiguity exists.
    *   `SearchResponse`: A union type or discriminated union to handle both success and clarification states.
*   **Implement `handleTripQuery` Logic:**
    *   **Step 1:** Call `search_locations_fuzzy` with the user's input.
    *   **Step 2:** Check the count of returned unique locations.
        *   **Count = 0:** Return "No location found".
        *   **Count = 1:** Call a second query (e.g., `get_trips_by_location`) to fetch actual trip rows and return `TripData[]`.
        *   **Count > 1:** Return the list of names as `ClarificationSuggestion[]`.

### **3. Frontend Integration (React/TypeScript)**
*   **Update UI:**
    *   Add the necessary types and integrate the `handleTripQuery` response handling into the chat interface.
    *   (Note: I will provide the backend code and types primarily, as requested, but ensure they are ready for frontend use).

### **Execution Steps**
1.  Create a new migration file to alter `vehicle_trips` and add the RPC function.
2.  Update the `vehicle-chat` Edge Function (or create a new utility) with the `handleTripQuery` logic and interfaces.
3.  Verify the search logic with test queries.