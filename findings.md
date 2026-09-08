# Findings & Decisions: HR UI/UX Filter Overhaul

Use this file as the durable knowledge base for discoveries, evidence, and decisions.

## Requirements

1. **Scope**: Overhaul and standardize UI/UX filters across all HR Dashboard pages (`/dashboard/*`).
2. **Boundary**: Strictly **DO NOT** discuss, patch, or touch General Affairs (`/ga/*`).
3. **Safety**: **0% Risk to Production Database** (`hris_db` on VPS). No schema migrations, no mutations, purely frontend read-only optimizations.
4. **Planning Protocol**: Follow `planning-with-files` skill with persistent files (`task_plan.md`, `findings.md`, `progress.md`) and Planning Mode artifact rules.

## Research Findings

### 1. Leave Management (`/dashboard/leave/page.tsx`)
- **Current State**: Filter only supports `searchTerm`, `filterStatus` (`all`, `pending`, `approved`, `rejected`), and `filterType`.
- **Friction**: Zero date range or month filter. An HR manager reviewing cut-off or seasonal leave must scroll through all historical records.
- **Data Source**: Fetches all leaves via `GET /api/leave`. All leaves contain `startDate`, `endDate`, `createdAt`.
- **Solution**: Add date range filter with quick presets (`Semua`, `Bulan Ini`, `Bulan Lalu`, `Tahun Ini`, Custom Range), plus a 1-click Reset button.

### 2. Overtime Management (`/dashboard/overtime/page.tsx`)
- **Current State**: Filter only has text search and status filter (`all`, `pending`, `approved`, `rejected`).
- **Friction**: Zero date or month filter. Critical bottleneck because overtime payroll reconciliation requires monthly cut-off inspection (e.g. 21st to 20th, or calendar month).
- **Data Source**: Fetches via `GET /api/overtime`. Every item has `date` ("YYYY-MM-DD") and `createdAt`.
- **Solution**: Add period/date filter with quick presets (`Bulan Ini`, `Bulan Lalu`, `Semua`, Custom Range), plus 1-click Reset button.

### 3. Attendance Management (`/dashboard/attendance/components/AttendanceFilters.tsx`)
- **Current State**: Has search, manual `startDate`, manual `endDate`, department, division, status.
- **Friction**:
  - No 1-click date presets (HR has to manually click calendar widget twice to change date ranges).
  - No Reset Filter button (requires 5-6 clicks across separate dropdowns).
  - Non-cascading: Selecting Division doesn't filter the Department list.
- **Solution**: Add date presets (`[Hari Ini]`, `[Kemarin]`, `[Minggu Ini]`, `[Bulan Ini]`), cascading Division ➔ Department filter, and 1-click Reset Filter button.

### 4. Field Visits (`/dashboard/visits/page.tsx`)
- **Current State**: Search and status (`all`, `unchecked`, `checked`).
- **Friction**: Zero date filter. Visits accumulate endlessly in one list.
- **Data Source**: `VisitReport` has `date` ("YYYY-MM-DD") and `createdAt`.
- **Solution**: Add date presets (`Hari Ini`, `Minggu Ini`, `Bulan Ini`, `Semua`) and date picker, plus 1-click Reset button.

### 5. Employees Directory (`/dashboard/employees/page.tsx`)
- **Current State**: Has search, division, department, employment type, segmented status toggle, and Reset button.
- **Friction**: Department dropdown shows all departments regardless of chosen division.
- **Solution**: Cascade Department options to only show those belonging to the selected Division.

### 6. Payroll (`/dashboard/payroll/components/PayrollFilters.tsx`)
- **Current State**: Search, division, cascading department, month picker.
- **Friction**: Lacks a unified 1-click Reset Filter button.
- **Solution**: Add Reset Filter button when filters are modified.

### 7. Audit Trail (`/dashboard/audit/page.tsx`)
- **Current State**: Search, Action, Entity filter, server-side pagination.
- **Friction**: No 1-click Reset button.
- **Solution**: Add 1-click Reset Filter button.

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Standardize Date Helper Utility (`@/lib/datePresets.ts` or local helper) | Ensure identical date boundary calculations across Attendance, Leave, Overtime, and Visits (avoids timezone drift). |
| Standardized Filter Toolbar Design | Visual consistency across HR dashboard with icons, search bar, active filter count, and `RotateCcw` Reset button. |
| Client-Side Filtering with `useMemo` where data is loaded | Zero additional network latency, instant responsiveness, no database round-trips. |
| Preserve all existing table columns and bulk actions | Ensures zero regression to existing approved workflows (Excel export, bulk approvals, etc.). |

## Resources

- `src/app/dashboard/attendance/components/AttendanceFilters.tsx`
- `src/app/dashboard/leave/page.tsx`
- `src/app/dashboard/overtime/page.tsx`
- `src/app/dashboard/visits/page.tsx`
- `src/app/dashboard/employees/page.tsx`
- `src/app/dashboard/payroll/components/PayrollFilters.tsx`
- `src/app/dashboard/audit/page.tsx`
- `src/lib/utils.ts`
