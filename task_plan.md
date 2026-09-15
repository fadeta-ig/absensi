# Task Plan: Schema-Safe Bulk Actions Audit & Implementation Readiness

## Mode
**Analysis & Planning Only (Awaiting User Instruction).** No code executed, no database changes, no schema modifications.

## Goal
Implement and verify schema-safe Bulk "Kirim Password Massal" (Bulk Send Password) in `src/app/dashboard/employees/page.tsx`.
Active/Inactive bulk actions have been discarded per user instruction.

## Current Phase
Comprehensive Review & Hardening Complete

## Planned Phases

### Phase 7 — Comprehensive Code Review & Hardening
- [x] Race condition audit: added immediate `if (bulkProcessing) return;` / `if (bulkSendingPassword) return;` / `if (bulkLoading) return;` guards across all bulk handlers.
- [x] Toast flooding & return value fix: updated `handleCorrectionAction` in `attendance/page.tsx` and `handleStatusUpdate` in `visits/page.tsx` with `{ silent?: boolean }` options and boolean return contract.
- [x] Error-handling audit: verified that failed bulk items retain their IDs in `selectedIds` for transparent retry.
- [x] Email validation audit: hardened employee email filtering to `Boolean(e.email?.trim())`.
- [x] Unused import cleanup in `visits/page.tsx` (`Filter`, `VisitStatus`, `STATUS_CONFIG`).
- [x] Run full ESLint, TypeScript (`tsc --noEmit`), and Vitest (52 passed).
- **Status:** complete

## Findings Summary
1. **Bulk Kirim Password**:
   - **BISA.** Zero schema changes.
   - Endpoint: `POST /api/auth/send-password`.
   - Syarat: Karyawan aktif, memiliki akun login aktif, dan memiliki email.
   - Dampak: Reset password hash, update sessionVersion, kirim email SMTP, log audit.
   - Guard: Karyawan non-aktif atau tanpa email otomatis dilewati.
2. **Bulk Aktifkan / Nonaktifkan**:
   - **DIBATALKAN / DIHAPUS DARI SCOPE** sesuai arahan user. Status perubahan tetap menggunakan alur individual yang sudah ada (`EmployeeStatusModal`).

## Planned Phases

### Phase 6 — Bulk Kirim Password Implementation & Verification
- [x] Compute `selectedEmployees` and `eligiblePasswordEmployees` in `EmployeesPageContent`.
- [x] Add `subtitle` to `BulkActionBar` in `employees/page.tsx` showing eligible count vs skipped.
- [x] Add dynamic button `<Key /> Kirim Password (X)` with disabled state when 0 eligible.
- [x] Add `useConfirm` dialog before sending passwords.
- [x] Implement sequential SMTP loop with loading/progress state.
- [x] Handle partial failure: only remove succeeded IDs from `selectedIds`.
- [x] Provide toast feedback with succeeded and failed/skipped counts.
- [x] Verify ESLint (0 errors).
- [x] Verify `tsc --noEmit` (0 errors).
- [x] Verify Vitest test suites (52 passed).
- [x] Verify Git diff (zero schema changes).
- **Status:** complete

## Planned Phases

### Phase 1 — Re-establish verified baseline
- [x] Read relevant Project Brain documents (`README.md`, `AGENT_RULES.md`, `API.md`, `DATA_MODEL.md`, `FLOWS.md`, `CONSTRAINTS.md`, `CONVENTIONS.md`, `TESTING.md`).
- [x] Read `findings.md`, `progress.md`, and `task_plan.md`.
- [x] Inspect current git status and diff (clean baseline).
- [x] Inventory all shared `Table` consumers and trace actual callers.
- **Status:** complete

### Phase 2 — Verify existing contracts, without schema changes
- [x] Verify `POST /api/payslips/bulk` handles subset `employeeIds` safely.
- [x] Verify `AttendanceCorrectionTab` uses existing `handleCorrectionAction`.
- [x] Verify `Leave` uses existing `PUT /api/leave`.
- [x] Verify `Overtime` uses existing `PUT /api/overtime`.
- [x] Verify `Visits` uses existing `handleStatusUpdate` for HR check.
- **Status:** complete

### Phase 3 — Define UX behavior for ready actions
- [x] Add `subtitle` to `BulkActionBar` for dynamic status breakdown.
- [x] Add dynamic eligible count to action buttons (e.g. `Setujui (X Pending)`).
- [x] Disable mutation buttons when eligible count is 0.
- [x] Add `useConfirm` modal to prevent accidental bulk updates.
- [x] Add partial-failure resilience (retain failed IDs in selection for retry).
- [x] Provide precise summary toast messages.
- **Status:** complete

### Phase 4 — Safety design review before code execution
- [x] Zero schema/migration file changes.
- [x] Zero database push/reset/seed.
- [x] All endpoints and actions rely strictly on existing contracts.
- **Status:** complete

### Phase 5 — Implementation & Verification
- [x] Upgrade `BulkActionBar.tsx` with `subtitle` prop and `!allSelected` helper.
- [x] Upgrade `AttendanceCorrectionTab.tsx` with dynamic counts, confirmation modal, partial-failure resilience.
- [x] Upgrade `src/app/dashboard/leave/page.tsx` with dynamic counts, confirmation modal, partial-failure resilience, dynamic excel export count.
- [x] Upgrade `src/app/dashboard/overtime/page.tsx` with dynamic counts, confirmation modal, partial-failure resilience, dynamic excel export count.
- [x] Upgrade `VisitListTable.tsx` with dynamic counts, confirmation modal, partial-failure resilience, dynamic excel export count.
- [x] Upgrade `PayrollRecapTab.tsx` and `payroll/page.tsx` with selective bulk generation (`Generate Terpilih (X Belum)`) and selective export (`Ekspor Excel (N)`).
- [x] Upgrade `PayrollHistoryTab.tsx` with dynamic count labels, subtitle, and partial-failure delete resilience.
- [x] Verify ESLint (0 errors, 0 warnings).
- [x] Verify TypeScript (`tsc --noEmit` exit 0).
- [x] Verify Vitest test suites (52 passed).
- [x] Verify Git diff (0 schema or migration files touched).
- **Status:** complete

## Acceptance Criteria
- No changes to `prisma/schema.prisma` or migration files.
- No `db push`, migration, reset, seed, or production data operation.
- Only existing API/service contracts are used unless separately approved.
- Bulk actions are shown only when the selected records are eligible.
- Mixed eligible/ineligible selections produce accurate counts and result messaging.
- Existing row actions, filters, pagination, RBAC, audit, and status workflows remain intact.
- Export actions do not mutate data.
- Payroll generation respects existing period uniqueness and skip behavior.
- Asset and employee imports retain existing validation and permission rules.
- Relevant lint, typecheck, and tests pass after execution is authorized.
- Git diff contains only approved files.

## Current Phase
Planning complete — awaiting explicit authorization before execution.

## Project Brain Assessment
No Project Brain update is required at planning stage. This file is an execution plan, not durable system knowledge. If implementation changes a durable API, workflow, convention, or feature contract, update only the affected `/docs/` file after implementation and verification.
