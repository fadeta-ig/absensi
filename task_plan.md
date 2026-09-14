# Task Plan: Streamlined Attendance Page UX (Expert Clean Redesign)

Use this file as the durable roadmap for improving the UX of `/employee/attendance` to provide an instant, seamless, camera-first mobile experience similar to Gojek/Grab/Shopee.

## Goal
Redesign `/employee/attendance` with expert UX principles:
1. **Remove all artificial biometric overlays**: No face oval, no crosshairs, no "posisikan wajah di dalam lingkaran". The system is photo evidence on site, allowing both selfie and rear-camera workplace/location shots.
2. **Eliminate redundant information & duplicate alerts**: Remove stacked duplicate alert boxes, duplicate coordinate footers, and redundant text. Consolidate Wi-Fi, GPS, and system state into a single, cohesive, smart floating status header.
3. **Ergonomic Camera Deck**: Place the shutter and camera-flip buttons in natural thumb-reach at the bottom (like iOS/Android/Instagram native cameras).
4. **Zero-Scroll Viewport**: Fit the entire flow (live view -> snap -> submit) within the mobile viewport without scrolling.
5. **Strict Design & Icon Consistency**: Corporate Red (#DC2626 / var(--primary)), Geist typography, 100% Lucide icons, ZERO emojis.

## Current Phase
Complete (Implemented & Verified)

## Phases

### Phase 1: Context & Feedback Analysis
- [x] Analyze user feedback: remove biometric mask (not face recognition), remove repetitive alerts, allow effortless selfie or location photo, streamline layout.
- [x] Audit all displayed texts and eliminate duplicate state representations.
- **Status:** complete

### Phase 2: Design Architecture
- [x] Define single-screen viewfinder layout with integrated smart status pill (Wi-Fi + GPS + Mode in one line).
- [x] Define bottom ergonomic control bar (Flip camera on left, large central tactile shutter, live clock/info on right).
- [x] Define post-capture preview state (clean retake vs submit buttons).
- **Status:** complete

### Phase 3: Implementation
- [x] Overhaul `src/app/employee/attendance/page.tsx` with the clean camera-first layout.
- [x] Remove all face oval guides and facial alignment constraints.
- [x] Replace multiple warning banners with a single contextual alert / smart status chip.
- [x] Verify zero emoji usage and full Lucide icon compliance.
- **Status:** complete

### Phase 4: Verification & Quality Checks
- [x] Run `npx eslint src/app/employee/attendance/page.tsx` (0 errors, 0 warnings).
- [x] Run `npx tsc --noEmit` to verify type integrity.
- [x] Run Vitest test suites (`tests/services/` and `tests/utils/` - all 52 tests passed).
- [x] Verify port 3000 remains clean and free.
- **Status:** complete

### Phase 5: Project Brain Assessment & Delivery
- [x] Mandatory Project Brain Assessment (`AGENT_RULES.md`).
- [x] Deliver final concise report to user.
- **Status:** complete
