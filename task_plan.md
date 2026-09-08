# Task Plan: Standardize & Overhaul HR Dashboard UI/UX Filters

Use this file as the durable roadmap for the task. Keep it current as phases change.

## Goal

Standardize and overhaul UI/UX filters across all HR Dashboard pages (`/dashboard/*`, excluding GA) with quick date presets (`[Hari Ini]`, `[Bulan Ini]`, etc.), date range pickers, unified 1-click "Reset Filter" buttons, cascading Division ➔ Department dropdowns, and active filter counter badges, ensuring 0% risk to the production database.

## Next Step

Present walkthrough, verification results, and copy-paste git commit command to user.

## Current Phase

Phase 6: Documentation & Deployment Delivery (COMPLETE)

## Phases

### Phase 1: Requirements & Discovery
- [x] Audit all HR pages and identify missing filter dimensions (Date, Month, Department, Division, Reset).
- [x] Verify backend API endpoints and ensure zero database schema changes or data mutations are required.
- [x] Document findings in `findings.md`.
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define standardized HR filter UI pattern (Quick date presets, Reset button, Cascading dropdowns, Active counter).
- [x] Structure implementation plan in `implementation_plan.md`.
- [x] Establish reusable date preset helpers (`src/lib/datePresets.ts`).
- **Status:** complete

### Phase 3: High-Priority Transactional Pages Implementation
- [x] Create `src/lib/datePresets.ts` shared date range utility.
- [x] **Leave Management (`/dashboard/leave`)**: Add date range with presets, 1-click Reset, and active count.
- [x] **Overtime Management (`/dashboard/overtime`)**: Add date range with presets, 1-click Reset, and active count.
- [x] **Attendance Management (`/dashboard/attendance`)**: Add date presets (`[Hari Ini]`, `[Minggu Ini]`, `[Bulan Ini]`), cascading Division ➔ Department, and 1-click Reset.
- [x] **Field Visits (`/dashboard/visits`)**: Add date picker / date presets, active counter, and 1-click Reset.
- **Status:** complete

### Phase 4: Directory & Secondary Pages Implementation
- [x] **Employees Directory (`/dashboard/employees`)**: Connect cascading Division ➔ Department filtering, active filter badge, and 1-click Reset.
- [x] **Payroll (`/dashboard/payroll`)**: Add month presets (`[Bulan Ini]`, `[Bulan Lalu]`), active counter, and 1-click Reset to `PayrollFilters.tsx`.
- [x] **Audit Logs (`/dashboard/audit`)**: Add active filter badge and 1-click Reset button.
- [x] **Letter Requests (`/dashboard/letter-requests`)**: Add active filter badge and 1-click Reset button.
- **Status:** complete

### Phase 5: Verification & Quality Assurance
- [x] Run unit test suite Vitest (48 unit tests + 4 new datePresets tests passed).
- [x] Run TypeScript typecheck (`npx tsc --noEmit` -> 0 errors).
- [x] Run Next.js production build (`next build` -> 113 routes compiled successfully).
- [x] Verify zero database schema mutations.
- **Status:** complete

### Phase 6: Documentation & Deployment Delivery
- [x] Update `knowledge.md` with new filter standards and `datePresets.ts` reference.
- [x] Create walkthrough documentation (`walkthrough.md`).
- [x] Provide one-click git commit command and VPS pull instructions.
- **Status:** complete

## Key Questions

1. **Does the production database need any migration?**  
   *Answer:* No. All filtering operates in client memory (`useMemo`) or via existing read-only query parameters. Database is 100% untouched.
2. **Should General Affairs (`/ga/*`) be touched?**  
   *Answer:* Strictly NO. User specifically constrained the scope to exclude GA. Only HR dashboard (`/dashboard/*`) is addressed.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Standardize Date Presets (`Hari Ini`, `Kemarin`, `Minggu Ini`, `Bulan Ini`, `Semua`) | Dramatically accelerates HR workflow from manual calendar clicks to a single 1-click action |
| Unified 1-Click "Reset Filter" with `RotateCcw` Icon | HR can instantly return to full unsegmented overview without clearing each input individually |
| Cascading Division ➔ Department | Prevents invalid combinations (e.g. selecting a department that belongs to another division) |
| Active Filter Badges | Visual indicator of how many filters are active so HR is never confused by segmented data |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| - | - | - |
