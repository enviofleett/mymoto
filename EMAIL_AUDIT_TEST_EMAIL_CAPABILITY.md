# Email System Audit: Test Email Capability

## Scope

Audit of the email system with focus on **sending test emails** from:
- **Admin Email Templates** (`AdminEmailTemplates.tsx`) – Send Test per template
- **Email Settings** (`EmailSettings.tsx`) – Send Test Email (system notification)

---

## 1. Admin Email Templates – Test Email Flow

### 1.1 UI & Entry Points

| Item | Status | Notes |
|------|--------|-------|
| "Send Test" button | ✅ | Shown next to template name when a template is selected |
| Dialog "Send Test Email" | ✅ | Opens on click; asks for test email address |
| Preview data in dialog | ✅ | Shows `getSampleData(template_key)` as JSON |
| Cancel / Send Test Email | ✅ | Cancel closes; Send disabled when no address or `sendingTest` |

### 1.2 Validation (Client-Side)

| Check | Status | Notes |
|-------|--------|-------|
| Template selected | ✅ | `editedTemplate` required |
| Email required | ✅ | Toast if empty |
| Email format | ⚠️ | Only `includes('@')` – weak; no regex |

**Recommendation:** Use a proper email regex (align with backend `validateEmail`) and trim input.

### 1.3 Request Construction

- **Session:** `refreshSession()` then `getSession()` fallback; explicit `Authorization: Bearer <token>`.
- **Body:**
  - `template`: `vehicle_assignment` → `systemNotification`, else `template_key`
  - `to`: test email address
  - `data`: `getSampleData(template_key)` + optional `senderId`
  - `customSubject`: subject after variable replacement
  - `customHtml`: wrapped HTML (base layout + processed content)

### 1.4 Vehicle assignment → systemNotification Bug

**Issue:** For `vehicle_assignment`, we call `send-email` with `template: 'systemNotification'` but `data` = vehicle_assignment sample (`userName`, `vehicleCount`, `actionLink`). The edge function requires `title` and `message` for `systemNotification`, returns **400** otherwise.

**Impact:** "Send Test" for Vehicle Assignment template always fails with 400.

**Fix:** When using `systemNotification` for vehicle_assignment, send `data` that includes `title`, `message`, `actionLink`, `actionText` (e.g. derived from vehicle_assignment copy).

### 1.5 Error Handling

| Case | Status | Notes |
|------|--------|-------|
| No session / token | ✅ | Toast: sign in again |
| `invoke` error (401, 403, CORS) | ✅ | Specific toasts |
| `data?.error` | ✅ | Thrown and surfaced |
| `data?.success === false` | ✅ | Treated as failure |
| 429 rate limit | ⚠️ | No specific handling; generic "Failed to send" |
| Network / other | ✅ | Caught, generic toast |

**Recommendation:** On 429, use `data?.resetAt` if present and show "Rate limit exceeded. Try again in X seconds."

### 1.6 Rate Limiting

- Test emails use the same `send-email` function and count toward **5/min, 50/hr, 200/day** per user.
- Hitting the limit yields 429; currently no reset-time messaging.

---

## 2. Email Settings – Test Email Flow

### 2.1 UI & Flow

- "Send Test Email" uses `send-email` with `template: "systemNotification"`.
- `data`: `title`, `message`, `actionLink`, `actionText` – matches backend requirements.

### 2.2 Gaps

| Item | Status | Notes |
|------|--------|-------|
| Auth | ⚠️ | No explicit `Authorization` header; relies on default client behavior |
| Session refresh | ❌ | No `refreshSession()` before invoke |
| Error handling | ⚠️ | Generic toast; no 401/403/429-specific messages |

**Recommendation:** Mirror Admin Templates: refresh session, pass `Authorization`, and handle 401/403/429 explicitly.

---

## 3. Backend (send-email Edge Function)

### 3.1 Test Email Path

- Accepts `template`, `to`, `data`, `customSubject`, `customHtml`, `senderId`.
- When `customSubject` / `customHtml` are provided, they override template-generated subject/html.
- Still **validates** template-specific required fields (e.g. `systemNotification` → `title`, `message`) before applying overrides.

### 3.2 Auth & Config

- JWT required; admin-only via `has_role`.
- `verify_jwt = false` in `config.toml` for `send-email` (gateway does not verify JWT; function does).

### 3.3 Rate Limiting & Logging

- Rate limit: `email_logs`-based; 429 when exceeded.
- All attempts (including test) logged to `email_logs`.

---

## 4. Checklist: Test Email Capability

| # | Check | Status |
|---|--------|--------|
| 1 | Send Test button visible when template selected | ✅ |
| 2 | Dialog collects email and sends request | ✅ |
| 3 | Session refresh + explicit Authorization | ✅ (Admin only) |
| 4 | vehicle_assignment test uses valid systemNotification `data` | ❌ → **Fix** |
| 5 | Stronger client-side email validation | ⚠️ → **Improve** |
| 6 | 429 handling with optional "Try again in X s" | ⚠️ → **Improve** |
| 7 | Email Settings test: auth + error handling | ⚠️ → **Improve** |

---

## 5. Recommended Fixes (Priority)

1. **Vehicle assignment test (400):** For `vehicle_assignment` → `systemNotification`, send `data` with `title`, `message`, `actionLink`, `actionText` (e.g. from vehicle_assignment wording).
2. **Admin test email validation:** Validate test address with a proper regex (+ trim); optionally match backend rules.
3. **Admin 429 handling:** Detect 429, read `data?.resetAt`, show toast with "Try again in X seconds" when possible.
4. **Email Settings test:** Add `refreshSession`, explicit `Authorization`, and 401/403/429-specific error messages.

---

## 6. Summary

- **Admin Email Templates** test flow is mostly correct; **vehicle_assignment** fails due to invalid `data` for `systemNotification`. Validation and 429 handling can be improved.
- **Email Settings** test works but would benefit from the same auth and error-handling hardening as Admin Templates.

Applying the fixes above will make test email sending robust and consistent across both entry points.

---

## 7. Fixes Applied (Post-Audit)

| Fix | Status |
|-----|--------|
| **vehicle_assignment test 400** | ✅ Fixed. When `template_key === 'vehicle_assignment'`, we invoke `systemNotification` with `data`: `title`, `message`, `actionLink`, `actionText` (derived from vehicle-assignment copy). `customSubject` / `customHtml` unchanged. |
| **Test email validation** | ✅ Added `isValidTestEmail()` (regex + trim + length/disallowed chars). Replaced `includes('@')` check; Send button disabled when invalid. |
| **429 rate-limit handling** | ✅ On `error` or `data?.error`, detect rate limit (429 / "rate limit"); if `data?.resetAt` present, throw "Try again in X seconds", else "wait a minute". |
| **Use trimmed email** | ✅ Request uses `trimmedEmail`; success toast and clear use it. |

**Files changed:** `src/pages/AdminEmailTemplates.tsx`
