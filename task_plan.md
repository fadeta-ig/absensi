# Task Plan: Standardize Employee Portal UI/UX Layout & Responsiveness

Use this file as the durable roadmap for the task. Create it before complex work and keep it current as phases change.

## Goal

Standardize the UI/UX layout, responsiveness, and bottom navigation clearance across all 16 Employee Portal (`/employee/*`) pages to match the reference standard (`/employee` - Constrained Centered Canvas `max-w-md mx-auto`), resolving all 7 critical floating navbar collision issues without touching HR Dashboard pages or running any Git commands.

## Next Step

Awaiting user approval on `implementation_plan.md` before proceeding with Phase 2 (Foundation Layout & Shell Update).

## Current Phase

Phase 5: Documentation & Reporting (Complete)

## Phases

### Phase 1: Planning & Scope Definition
- [x] Crawl and audit all 42 pages and 4 shells across codebase
- [x] Document comprehensive audit results in `audit_ui_ux.md`
- [x] Confirm scope lock: Focus 100% on `/employee/*`, strictly leave `/dashboard/*` untouched
- [x] Initialize planning-with-files tracking (`task_plan.md`, `findings.md`, `progress.md`)
- [x] Create implementation plan artifact (`implementation_plan.md`)
- **Status:** complete

### Phase 2: Foundation Layout & Shell Updates
- [x] Update `src/components/layout/AppShell.tsx` to ensure safe bottom clearance (`pb-28 lg:pb-8`) when `mobileBottomNav` is active
- [x] Update `src/app/employee/layout.tsx` to wrap `{children}` in a centralized Constrained Centered Container (`w-full max-w-md mx-auto`)
- [x] Verify that all 16 employee pages inherit the centered mobile canvas and bottom clearance
- **Status:** complete

### Phase 3: Page Clean-up & Sub-component Alignment
- [x] Remove redundant/nested `max-w-md mx-auto` wrappers in `src/app/employee/page.tsx`
- [x] Harmonize individual employee page containers and padding across all 16 pages
- [x] Eliminate multi-column desktop grid cramps inside 448px container (`monitoring`, `visits`, `assets`, `attendance-history`, `documents`)
- [x] Fix Dark Mode pastel hardcoded colors on `src/app/employee/page.tsx` quick actions
- [x] Strictly enforce NO EMOJIS constraint: replace all emojis/symbols (`✓`, `⚠️`, `✅`, `🏠`, `💼`, `→`, `»`, `&rarr;`) with proper `lucide-react` icons
- [x] Ensure full responsiveness on narrow screens (<380px)
- **Status:** complete

### Phase 4: Verification & Automated Testing
- [x] Run `npx tsc --noEmit` to ensure zero type errors (PASSED)
- [x] Run test suite (`vitest run tests/utils tests/services`) to verify no regressions (52/52 PASSED)
- [x] Run production build (`npm run build`) to verify all 113 routes compile cleanly (PASSED with Exit Code 0)
- [x] Codebase-wide emoji scanner verified 0 emojis in `/employee/*`
- **Status:** complete

### Phase 5: Documentation & Reporting
- [x] Update `findings.md` and `progress.md` with layout architecture and zero-emoji findings
- [x] Update `walkthrough.md` with comprehensive before-and-after results
- [x] Deliver final report to user
- **Status:** complete

## Key Questions

1. **Question**: Should HR Dashboard be forced into mobile canvas?  
   **Answer**: NO. Confirmed by user: HR works on laptops/PCs with high data-density requirements (tables up to 1200px); leave HR pages untouched.
2. **Question**: Can we run Git commands?  
   **Answer**: NO. Explicit user constraint: Never touch Git commands without explicit orders.

## Decisions Made

| Decision | Rationale |
|---|---|
| Centralize container in `employee/layout.tsx` | Enforces 100% layout consistency across all 16 pages from a single location (DRY). |
| Increase bottom clearance in `AppShell.tsx` to `pb-28` | Floating navbar is ~85-95px tall; `pb-16` (64px) caused 7 critical cutoff bugs. |
| Leave `/dashboard/*` completely untouched | HR workflow is desktop-first data grids, requiring full 1200px width. |
| Strict NO-GIT policy | User explicitly mandated zero git command execution. |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| None so far | - | - |

## Notes

- All changes must be purely front-end layout/styling.
- Zero database changes, zero schema migrations.
- Strict adherence to user's "no git" command instruction.
