# Vehicle Profile Settings – UI/UX Design and Handoff

## Overview
- Consolidates Personality, Vehicle Details, Documentation, and Operations into a responsive, accessible panel.
- Implemented in-app as an interactive prototype under Owner Vehicle Profile → Vehicle Settings.

## Information Architecture
- Personality: Avatar, Nickname, Language, Persona Style.
- Vehicle Details: Plate, VIN, Color, Brand, Model, Year.
- Documentation: Insurance, License, Roadworthiness with alerts and uploads.
- Operations: Speed Limit, Geofence Manager, Reports module.

## Component Specifications
- Accordion Sections: Single collapsible, keyboard navigable.
- Inputs: Label, helper text, real-time validation; error color #EF4444.
- Buttons: Primary accent #FF6B00, hover: accent/90, outline for secondary.
- Progress: Global completion indicator based on configured sections.
- Toasts: Success and error feedback via Sonner.

## Validation Rules
- Nickname: ≤ 50 chars, global availability check, live feedback.
- Language: Supported set [English, Pidgin, Yoruba, Hausa, Igbo].
- Persona: Casual, Professional, Funny (fallback handled if DB disallows).
- Plate: Region-specific (Nigeria: ABC-123DE) and Generic fallback.
- VIN: ISO 3779 checksum; 17 chars, allowed chars [A-HJ-NPR-Z0-9].
- Year: 1900–current; numeric only.
- Speed Limit: 1–300 km/h or 1–186 mph.
- Documents: PDF/PNG/JPG only; 30/60/90-day color-coded alerts.

## Accessibility (WCAG 2.1 AA)
- Labels bound to inputs and role attributes applied.
- Focus states, keyboard navigation via Radix components.
- Contrast: Background vs foreground maintains ≥ 4.5:1.
- ARIA labels for color selection and uploads.

## Responsive Behavior
- Mobile: Single column forms; map and lists stack.
- Tablet: Two-column details and documentation grids.
- Desktop: Multi-column layouts for operations and reports.

## Color, Typography, Spacing
- Colors: Accent #FF6B00, Primary per theme, Muted gray scale via Tailwind tokens.
- Typography: System font stack via Tailwind; headers semibold; body regular.
- Spacing: 4/8/12/16 px increments; container max-width 768–1024px for panels.

## Asset Exports
- Avatar: Client-side square crop to 512×512 PNG.
- PWA Icons: Transparent backgrounds; maskable.
- Documents: Uploaded to `documents` bucket under `vehicle-docs/{deviceId}`.

## Handoff Notes
- Persistence: Supabase `vehicles`, `vehicle_llm_settings`, `geofence_zones`; localStorage fallback when fields are pending in DB.
- Reports: Relocated into Operations, using existing hooks for trips, events, stats.
- Geofence: Uses GeofenceManager with map interactions and radius adjustment.

## Prototype Access
- Navigate to Owner Vehicle Profile for a device → Vehicle Settings (top-right) → interact with sections.

