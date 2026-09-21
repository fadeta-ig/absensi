# 0001. Core cleaning loop

**Date**: 2026-09-21
**Status**: Accepted

## Summary

This decision creates the first working digital cleaning checklist for internal rooms. Petugas use `/cleaning` for work today, while WIG002 alone configures rooms and views monthly results. The feature uses the existing application, database, login, and audit tools, with no new service or secret.

## Requirements

**User stories**:

* As an assigned petugas, I want to select one of my active rooms and update its checklist today so that the work is recorded digitally.
* As WIG002, I want to configure the minimum cleaning master data and see a monthly matrix per room so that I can manage and review the loop.

**Acceptance criteria**:

* **AC-1**: An assigned petugas with the Cleaning Worker role can open `/cleaning`, select any currently assigned active room, and create or read one shared checklist for the current WIB date. A room that has no active template or no active template item returns a clear configuration error and does not create a checklist.
* **AC-2**: Assigned petugas can mark active items complete or incomplete only for the current WIB date. The result saves automatically after a confirmed server response, shows a retryable error and restores the previous screen state if it fails, and records the last actor and server time for each item. An untouched item shows `Belum diubah`, with no actor or time.
* **AC-3**: A daily checklist is unique for one room and one WIB date. Concurrent first access returns the same checklist. Concurrent item changes are accepted in confirmed server order, and each response returns the saved item with its actor and time.
* **AC-4**: The daily status is derived, not manually stored. It is `SELESAI` only when at least one active daily item exists and every active daily item is complete, otherwise it is `BELUM`. Petugas can reopen an item on the current WIB date and the derived status returns to `BELUM`.
* **AC-5**: WIG002, identified by username `WIG002` and permission `ga.manage`, can manage active rooms, reusable templates, template items, and room to petugas assignments through `/ga/cleaning/settings`. Inactive records preserve history. Names are unique after trimming, collapsing internal spaces, and lowercasing with simple Unicode handling. A template in use by an active room cannot become inactive without a replacement or room deactivation.
* **AC-6**: A WIG002 assignment change carries explicit `applyToToday`. With confirmation and `applyToToday: true`, the assignment and Cleaning Worker role access update only the selected room and commit atomically. Without it, assignments take effect on the next WIB date. Template and item changes are direct: a checklist copies the active configuration when it is first created, while a daily checklist snapshot never changes after creation.
* **AC-7**: WIG002 can open `/ga/cleaning/recap` for every room active now in a past or current month, and can open inactive room history through a dedicated detail read. Each existing daily record cell shows `BELUM` or `SELESAI`. A missing past record deterministically shows `BELUM` as no digital checklist evidence. Future dates are disabled but show a current template preview without creating a record. Detail shows last item actors and times while the matrix stays brief.
* **AC-8**: The server denies administration unless the active account is exactly WIG002 with `ga.manage`. It denies petugas unless the account has the Cleaning Worker role and a current active assignment to the requested room. Active assignments are the sole source of this role. Removing the final active assignment immediately removes the role and all cleaning access while preserving historical actor data.
* **AC-9**: Configuration changes and every item status change create AuditLog entries with server actor and time. The feature uses standard error responses and structured logging, adds no environment variable or feature flag, and exposes no public route.

## Decision

**Chosen option**: Option 3: Dedicated cleaning domain and narrow portal

Use dedicated daily room checklist records, a Cleaning Worker role that contains only `cleaning.execute`, a protected `/cleaning` route for petugas, and WIG002 only GA settings and recap routes.

## Feature design

**Data model sketch**:

| Entity | Required fields | Relationships and constraints |
|---|---|---|
| `CleaningRoom` | `id`, `name`, normalized name key, `templateId`, `isActive`, timestamps | One active template per room. Normalized name key is unique. Template is required while room is active. |
| `CleaningTemplate` | `id`, `name`, normalized name key, `isActive`, timestamps | Reusable by many rooms. Normalized name key is unique. Cannot become inactive while referenced by an active room without a replacement or room deactivation. |
| `CleaningTemplateItem` | `id`, `templateId`, `name`, normalized name key, `sortOrder`, `isActive`, timestamps | Belongs to one template. Normalized name key is unique within its template. Direct changes affect only checklists that are created later. |
| `CleaningWorkerAssignment` | `id`, `roomId`, `userId`, `isActive`, `effectiveWibDate`, timestamps | Many to many room and `UserAccount`. One historical relationship per room and user through a unique pair. Assignment permits a room only on or after its effective WIB date while active. |
| `CleaningDailyChecklist` | `id`, `roomId`, `wibDate`, `roomNameSnapshot`, timestamps | One record per room and `wibDate` through a unique pair. It stores no editable status. |
| `CleaningDailyChecklistItem` | `id`, `checklistId`, nullable `templateItemId`, `itemNameSnapshot`, `sortOrder`, `isActive`, `isComplete`, nullable `lastChangedByUserId`, nullable `lastChangedAt` | Belongs to one daily checklist. Snapshot data preserves history and never receives later master structure changes. An untouched item has no actor or time and displays `Belum diubah`. `templateItemId` may be null only after a master record is retired. |
| RBAC data | `CLEANING_WORKER` role and `cleaning.execute` permission | Active room assignments are the sole authority for the role. WIG002 adds the role when an account gains its first active assignment and removes it immediately after its final active assignment is removed. |

**State transitions**:

* Daily item: `BELUM_SELESAI` ↔ `SELESAI` on the current WIB date by an assigned petugas.
* Daily checklist display: `BELUM` when no record exists or any active item is incomplete, `SELESAI` when every active item is complete.
* Master data: active → inactive. Inactive data is retained and never deleted by this feature.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/cleaning/rooms` | GET | no date input | currently assigned active rooms | Cleaning Worker | 401, 403 |
| `/api/cleaning/checklists` | GET | `roomId`, valid `date` | stored daily snapshot for any existing date | Cleaning Worker with current active room assignment | 403, 404 |
| `/api/cleaning/checklists` | POST | `roomId` | one current WIB checklist and snapshot items | Cleaning Worker with active room assignment | 403, 409, `ROOM_NOT_READY` |
| `/api/cleaning/checklist-items/[id]` | PATCH | `isComplete` | confirmed item, nullable actor or time only before first change, derived status | Cleaning Worker with active room assignment | 403, 422 non current date |
| `/api/ga/cleaning/rooms` | GET, POST, PATCH | room data | rooms and saved room | WIG002 only | 403, 409, 422 |
| `/api/ga/cleaning/templates` | GET, POST, PATCH | template data | templates and saved template | WIG002 only | 403, 409, 422 dependency |
| `/api/ga/cleaning/template-items` | GET, POST, PATCH | item data | items and saved item | WIG002 only | 403, 409, 422 |
| `/api/ga/cleaning/assignments` | GET, POST, PATCH | room, user, active flag, `applyToToday` | assignments and role access result | WIG002 only | 403, 409, 422 |
| `/api/ga/cleaning/recap` | GET | valid past or current `month` | matrices for rooms active now and future previews | WIG002 only | 403, 422 future month |
| `/api/ga/cleaning/checklists` | GET | `roomId`, valid `date` | stored detail, active configuration preview, or no checklist state | WIG002 only | 403, 404 |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Petugas room list | visible rooms | active `CleaningWorkerAssignment` for current `session.userId`, active room columns, active session role and permission |
| Open today checklist | one current WIB date, room snapshot, daily items | server captures `toWIBDateString()` once before the transaction, selected `roomId`, active room template and active items at creation time, transaction created daily rows |
| Read existing checklist | historical items, state, actor, time | stored daily snapshot rows; untouched rows have null actor and time and display `Belum diubah` |
| Update item | completion, last actor, last time, derived daily status | request `isComplete`, active session user, server `new Date()`, confirmed database write order, active daily item rows derived at read |
| Configure master data | saved master record and future effect | validated request, WIG002 session, normalized name key, existing room and template relations. Structural master changes never modify existing daily snapshots. |
| Apply assignment today | selected room assignment and role access result | validated assignment request, explicit `applyToToday`, active assignment count for its user, one database transaction |
| Monthly matrix | date label, `BELUM` or `SELESAI`, disabled future state | requested valid past or current month, WIB calendar iteration, existing daily rows and active item completion. A missing past row maps to `BELUM` as no digital checklist evidence. |
| Detail or preview | item names, item state, actor, time, no record or preview state | stored daily snapshot when it exists. For a future date or today without a record, current active room template items form a non creating preview. No valid template returns a no preview state. |
| Audit record | action, entity, actor, timestamp, safe details | `actorFromSession`, `logAction`, master or daily entity IDs, non sensitive change metadata |

**Key invariants**:

* Only one `CleaningDailyChecklist` can exist for a room and WIB date.
* The server captures the WIB date once at request start and keeps it throughout the related transaction.
* A petugas must have both the Cleaning Worker role and an active assignment for the requested room on every server request.
* Only current WIB date item mutation is valid for petugas. Other dates are read only.
* The displayed daily status is derived from active daily items and is never directly edited. Zero active daily items produce `BELUM`.
* A daily record snapshots its room and item names. Later master changes cannot rewrite or structurally alter historical or current daily snapshots.
* Every checklist snapshots the active room template and active template items when that checklist is first created. Later direct master changes never alter an existing daily snapshot.
* Only assignment changes accept `applyToToday`, and true requires a user confirmation. The assignment and role synchronization execute inside one database transaction. Assignment changes without it use the next WIB date as `effectiveWibDate`.
* Active assignments are the sole source of the Cleaning Worker role. Removing the last active assignment must remove the role in the same transaction that updates the assignment.
* Names normalize by trimming edges, collapsing internal whitespace, and simple Unicode lowercase before unique validation and persistence.
* Audit detail contains only identifiers and business change metadata, never credentials or secrets.

**Security model**:

* `/cleaning` is a protected route for `cleaning.execute`. The route guard may provide navigation protection, but every API route calls `requireAuth()` and performs current server side checks.
* A petugas reads only currently assigned active rooms and may mutate only today. Removed assignments immediately deny room history and current work.
* WIG002 administration requires both exact session username `WIG002` and current `ga.manage`. No role or account fallback exists.
* WIG002 can read all historical room records, including actors from accounts that are now inactive. The feature does not add public pages, personal data collection, external integration, or new secrets.

**Critical test scenarios**:

* Happy path: an assigned petugas creates today checklist, completes all active items, then reopens one item, verifies **AC-1**, **AC-2**, and **AC-4**.
* Failure case: two assigned petugas request first creation together and both receive one daily record, then a same day assignment and role access change rolls back completely when role synchronization fails, verifies **AC-3** and **AC-6**.
* Auth and permission: a user without the role, a worker without the room assignment, a non WIG002 GA account, and WIG002 without `ga.manage` receive denial, verifies **AC-5** and **AC-8**.
* History and matrix: a past date without a record shows `BELUM` with the no checklist message, while a future date is a non creating template preview, verifies **AC-7**.
* Audit and recovery: an item save failure restores the prior client state and a confirmed item mutation writes an audit record with actor and time, verifies **AC-2** and **AC-9**.

## Build plan

1. Add the Cleaning Worker permission and role, the confirmed Prisma models, normalized uniqueness fields, relation constraints, and a repeatable role seed. Add one focused schema push path and service tests for the new data contract, satisfies **AC-1**, **AC-3**, **AC-5**, **AC-8**.
2. Build the cleaning domain service with a WIB date captured once per operation, immutable daily item snapshots, derived status, room assignment checks, atomic concurrent creation, confirmed server order item updates, role synchronization, AuditLog actions, and assignment only `applyToToday` transactions, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-6**, **AC-8**, **AC-9**.
3. Add validated and sanitized API routes that are thin wrappers around the service. Cover the petugas room and checklist flow first, then WIG002 master routes, recap reads, missing record states, and future previews, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-8**.
4. Add the `/cleaning` protected route and focused mobile friendly checklist interface. It must select assigned rooms, use confirmed automatic saves, restore failed changes, and make non current dates read only, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-8**.
5. Add `/ga/cleaning/settings` for WIG002 master maintenance, including a visible confirmation before `applyToToday`, and `/ga/cleaning/recap` for room matrices, detail, and future template previews, satisfies **AC-5**, **AC-6**, **AC-7**, **AC-8**.
6. Add service and API regression tests for authorization, WIB boundaries, concurrent creation, confirmed server write order, assignment only same day application, role removal, audit writes, master validation, recap status, and future preview behavior, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9**.

## Consequences

**Positive**:

* The first slice proves the full production path from narrow access, through database and API, to shared daily work and WIG002 review.
* Reusable templates and snapshots support future master work without rewriting cleaning history.
* Derived status prevents a separate completion flag from becoming inconsistent with item state.

**Negative / tradeoffs**:

* WIG002 is a deliberate single administrator. A renamed or unpermitted account blocks administration until corrected.
* Automatic role synchronization changes RBAC data, so it must be transactional and carefully tested.
* Master changes can affect a checklist that has not yet been created today. This keeps configuration flexible, but two rooms can receive different item snapshots on the same date if their checklists are first created before and after a configuration change.
* The feature does not yet include schedules, holidays, monthly signatures, export, or a full audit browsing screen.

**Neutral**:

* This feature adds no dependency, environment variable, background job, external provider, or public route.
* Existing standard API guards, Prisma client, audit service, logger, and WIB helpers remain the implementation boundary.

## Follow-up

* [ ] Design Slice 2 master rules for schedules, holidays, room overrides, and outsourced account identity before expanding this configuration surface.
* [ ] Design Slice 3 monthly signatures separately. It must not change the daily item state model without a new decision.
* [ ] Design Slice 4 export and audit browsing separately. AuditLog entries created here are the source for that future work.
