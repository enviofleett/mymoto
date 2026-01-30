I will implement a "100% full proof" language preference enforcement system by adding explicit detection, immediate persistence, and prompt hardening.

### **1. Language Detection & Persistence**
*   **Update `preference-learner.ts`**: Add a new `language` preference category with regex patterns to detect explicit language switch requests (e.g., "Speak Pidgin", "Switch to French", "Parelez-vous français?").
*   **Update `index.ts`**:
    *   After preference learning, check if a high-confidence language preference was detected.
    *   If detected, **immediately update** the `vehicle_llm_settings` table in the database.
    *   Update the local `languagePref` variable instantly so the *current* response respects the switch.

### **2. Prompt Hardening (The "Full Proof" Logic)**
*   **Recency Bias Enforcement**: Move the `## VOICE & LANGUAGE` section to the **very end** of the system prompt. LLMs prioritize instructions at the end of the context window, preventing the `basePersona` or other sections from overriding the language rule.
*   **Explicit "Anti-Switching" Rules**:
    *   Add a `## CRITICAL RULES` section that explicitly forbids switching languages unless commanded.
    *   Add dynamic "Forbidden Phrases" based on the selected language (e.g., if Pidgin is selected, forbid standard English phrases).
*   **Refined Instructions**: Update the language definitions in `index.ts` to include stronger negative constraints (e.g., "NEVER use English words when a Yoruba equivalent exists").

### **3. Validation**
*   I will verify the changes by simulating a chat request that switches language and ensuring the response and database update occur correctly.
