# Task Plan: Project Brain Initialization

Use this file as the durable roadmap for building the canonical Project Brain in `/docs/`.

## Goal
Transform `/docs/` into a pure, durable "Project Brain" (18 canonical knowledge files) that enables future AI coding agents to immediately build a mental model of the system without an audit/issue-tracking focus. Zero source code changes.

## Current Phase
Complete (Project Brain Fully Initialized & Validated)

## Next Step
Maintain Project Brain in `/docs/` according to `AGENT_RULES.md` whenever new features or schema changes introduce durable project knowledge.

## Constraints & Principles
- **NOT A CODE AUDIT**: No bug hunting, vulnerability hunting, duplicate code analysis, dead code, code smell, TODO discovery, refactoring backlog, or audit scoring.
- **DO NOT CREATE**: `TODO.md`, `CHANGELOG.md`, `BUGS.md`, `TECHNICAL_DEBT.md`, `CURRENT_STATE.md`, `AUDIT.md`.
- **EXACT 18 FILES in `/docs/`**:
  `README.md`, `AGENT_RULES.md`, `PROJECT.md`, `CODEBASE_MAP.md`, `ARCHITECTURE.md`, `DOMAIN.md`, `DATA_MODEL.md`, `FEATURES.md`, `FLOWS.md`, `API.md`, `INTEGRATIONS.md`, `CONVENTIONS.md`, `DECISIONS.md`, `CONSTRAINTS.md`, `SECURITY.md`, `TESTING.md`, `WORKFLOWS.md`, `GOTCHAS.md`.
- **Zero source code modification**: `src/`, `prisma/`, `package.json`, etc. must remain untouched.
- **Portability**: Relative dynamic links (`./*.md`), zero absolute paths, zero secrets/PII.

## Phases

### Phase 1: Planning & Cleanup
- [x] Review requirements and user prompt instructions.
- [x] Remove non-brain files from `/docs/` (`TODO.md`, `CHANGELOG.md`, `CURRENT_STATE.md`).
- [x] Create/update `AGENTS.md` at repository root with Project Brain routing and rules.
- **Status:** complete

### Phase 2: Create New Knowledge Files
- [x] Create `docs/CODEBASE_MAP.md`: Map entry points, directories, layers, modules, services, utilities, and relationships.
- [x] Create `docs/FEATURES.md`: Capabilities and feature breakdown (Auth/RBAC, Attendance, GA Assets, Payroll, Visits, Self-service).
- [x] Create `docs/FLOWS.md`: End-to-end system flows (3-factor attendance flow, payroll generation & calculation flow, asset handover flow, visit verification & watermark flow, auth & edge guard flow).
- [x] Create `docs/API.md`: HTTP route map, `apiGuard` contract, request/response formats, query/body schemas.
- **Status:** complete

### Phase 3: Update & Align Existing Knowledge Files
- [x] Update `docs/README.md`: Entry point, Project Brain definition, 18-file index, 10-step startup procedure, task mental model routing table.
- [x] Update `docs/AGENT_RULES.md`: How AI agents must operate, source-of-truth hierarchy, memory maintenance rules, secrets policy.
- [x] Verify & refine `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN.md`, `docs/DATA_MODEL.md`, `docs/INTEGRATIONS.md`, `docs/CONVENTIONS.md`, `docs/DECISIONS.md`, `docs/CONSTRAINTS.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/WORKFLOWS.md`, `docs/GOTCHAS.md` to ensure pure knowledge tone.
- **Status:** complete

### Phase 4: Validation Pass
- [x] Verify all 18 files exist in `/docs/` and only these 18.
- [x] Check link validity across all documents (0 broken links).
- [x] Check for absolute paths, secrets, or temporary logs (0 violations).
- [x] Confirm git status: ZERO source code modification.
- **Status:** complete

### Phase 5: Final Report Delivery
- [x] Deliver comprehensive final report in response to user.
- **Status:** complete

## Key Decisions Made
| Decision | Rationale |
|----------|-----------|
| Purge `TODO.md`, `CHANGELOG.md`, `CURRENT_STATE.md` | Excluded by user specification; Project Brain is durable knowledge, not an issue tracker or audit log. |
| Add `CODEBASE_MAP.md`, `FEATURES.md`, `FLOWS.md`, `API.md` | Required to provide complete architectural, feature, endpoint, and dataflow mental models. |
| Use relative dynamic markdown links (`./*.md`) | Ensures full portability across local environments, Linux servers, and GitHub preview. |
| Zero source code modifications | Strict constraint across all project memory phases. |
