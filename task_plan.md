# Task Plan: Attendance Correction Detail Modal & Inspection UX

Use this file as the durable roadmap for enhancing `AttendanceCorrectionTab.tsx` with comprehensive detail viewing before approving/rejecting attendance correction requests.

## Goal
Enable HR administrators to inspect the full details of attendance correction requests (employee info, target date, proposed in/out times, complete reason, and evidence attachments) via a dedicated Detail Modal before making approval or rejection decisions, and upgrade pagination state persistence.

## Current Phase
Complete (Implemented, Verified & Project Brain Assessed)

## Constraints & Principles
- **Design System Consistency**: Adhere to corporate red/white theme, CSS variables (`var(--card)`, `var(--secondary)`, `var(--border)`, `var(--primary)`), Lucide icons only, zero emojis.
- **Zero Ambiguity for HR**: Complete visibility into why the correction is requested and any attached photo/document evidence.
- **Action within Modal**: Allow HR to approve or reject directly from the Detail Modal, as well as via the table row.
- **State Persistence**: Integrate `useTablePagination` and remove aggressive page reset effects.
- **Strict Verification**: Clean ESLint, clean TypeScript type checks, all tests passing.

## Phases

### Phase 1: Architecture & UI Component Design
- [x] Inspect `AttendanceCorrectionTab.tsx` and `AttendanceCorrection` data model.
- [x] Check `/docs/` and existing modal patterns (`VisitDetailModal`, `LeaveManagementPage`, `AppShell`).
- [x] Design layout for `AttendanceCorrectionDetailModal`.
- **Status:** complete

### Phase 2: Implementation of Detail Modal & Table Enhancements
- [x] Create `AttendanceCorrectionDetailModal.tsx` as a dedicated component.
- [x] Add "Detail" (Eye icon) action button to each table row — always visible, opens modal.
- [x] Implement full modal view: employee identity card, target date, proposed in/out timestamps with duration calculation, complete reason (scrollable), attachment/photo preview with zoom.
- [x] Implement direct approval/rejection actions within the modal footer with loading states.
- [x] Upgraded pagination to `useTablePagination({ storageKey: "attendance_corrections" })` and eliminated aggressive reset `useEffect`.
- **Status:** complete

### Phase 3: Verification Pass
- [x] Run `npx eslint` — 0 errors.
- [x] Run `npx tsc --noEmit` — 0 type errors.
- [x] Run Vitest suites — 52 tests passed.
- **Status:** complete

### Phase 4: Project Brain Assessment & Delivery
- [x] Assess `/docs/` — no durable architectural knowledge changed (feature enhancement within existing attendance module).
- [x] Deliver clear summary to user.
- **Status:** complete
