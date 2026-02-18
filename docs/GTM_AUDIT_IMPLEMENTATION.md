# GTM Audit: MyMoto Owner PWA (Nigeria-first, scale-to-5k)

## Findings (Severity / Impact / Effort)
1. No public growth route before auth  
Severity: High / Impact: High / Effort: Medium
2. Install funnel lacked measurable events (especially iOS manual flow)  
Severity: High / Impact: High / Effort: Low
3. No first-touch attribution persisted to user profile  
Severity: High / Impact: High / Effort: Medium
4. Activation milestones were not tracked (vehicle linked, first chat, first alert)  
Severity: High / Impact: High / Effort: Medium
5. Push permission funnel had no analytics and no retry cadence  
Severity: Medium / Impact: Medium / Effort: Low
6. Referral and experiment scaffolding missing  
Severity: Medium / Impact: Medium / Effort: Medium

## Implemented in this pass
- Public landing and campaign routes:
  - `/` owner-facing landing
  - `/go/:channel` campaign variants (`whatsapp`, `installer`, `qr`)
- GTM telemetry foundation:
  - `src/lib/analytics.ts` with typed event taxonomy and `trackEvent(...)`
  - first-touch attribution capture and persistence (UTM/referrer/entry path/ref code)
  - attribution attachment to authenticated user records
- Funnel event instrumentation:
  - `landing_view`
  - `auth_view`, `auth_submit`, `auth_success`, `auth_error`
  - `install_view`, `install_cta_click`, `install_instruction_view`
  - `vehicle_request_open`, `vehicle_request_submit`, `vehicle_request_approved`
  - `first_vehicle_visible`, `first_chat_open`, `first_chat_sent`
  - `first_alert_seen`
  - `push_banner_view`, `push_permission_prompt`, `push_permission_granted`, `push_permission_denied`
  - `d1_return`, `d7_return` (client-derived milestone signals)
- Activation UX:
  - Empty state now guides owners to GPS51 quick login or manual request
  - Pending vehicle request count surfaced to user in dashboard
- Retention funnel UX:
  - Notification permission banner now has measurable prompt outcomes
  - Dismissal uses 24h cooldown (retry cadence)
- Referral / experiments / analytics schema:
  - Added DB migration for `analytics_events`, `user_attribution`, `growth_experiments`,
    `experiment_assignments`, `referral_invites`, `referral_conversions`
- Referral sharing:
  - Owner profile can generate/share referral link with `ref` attribution
- Growth dashboard:
  - `/admin/growth` with 30-day funnel metrics and conversion KPIs

## Prioritized next backlog
1. Server-side lifecycle campaigns (24h no vehicle, 48h no chat, 7-day inactive)
2. Weekly owner digest automation using telemetry/event cohorts
3. Experiment assignment runtime + holdout analysis support in dashboard
4. Referral reward settlement and anti-fraud checks
5. Channel-level CAC proxy + cohort retention charting in growth dashboard

## 90-day experiment slate
1. Landing headline A/B (`vehicle chat` vs `safety alerts` positioning)
2. Install CTA wording by platform (iOS Safari vs Android)
3. Empty-state primary CTA ordering (`GPS51 login` first vs `manual request` first)
4. Push prompt timing (`first alert screen` vs `profile/settings entry`)
5. Referral copy variants (`friend safety` vs `control convenience`)
