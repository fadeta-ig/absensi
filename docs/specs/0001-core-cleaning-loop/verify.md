# Core Cleaning Loop: Verify Checklist

> Run `/check verify` to walk through these steps.
> Run `/test` to lock the critical scenarios.

## Schema and RBAC

- [x] `CleaningRoom`, `CleaningTemplate`, `CleaningTemplateItem`, `CleaningWorkerAssignment`, `CleaningDailyChecklist`, `CleaningDailyChecklistItem` tables exist in the database.
- [x] `CleaningDailyChecklist` has a unique constraint on `(roomId, wibDate)`.
- [x] `CleaningTemplateItem` has a unique constraint on `(templateId, normalizedName)`.
- [x] `CLEANING_WORKER` role exists with exactly `cleaning.execute` permission.
- [ ] Deleting a `CleaningRoom` cascades to its assignments, daily checklists, and daily checklist items. (Preserved with Restrict to protect room history per AC-5)
- [x] Deleting a `CleaningTemplate` cascades to its template items.

## Authentication and authorization (AC-8)

- [x] `GET /api/cleaning/rooms` returns 401 without a session.
- [x] `GET /api/cleaning/rooms` returns 403 without `cleaning.execute` permission.
- [x] `POST /api/cleaning/checklists` returns 403 when the petugas has the role but no active assignment for the requested room.
- [x] `GET /api/ga/cleaning/rooms` returns 403 when the session user is not `WIG002`.
- [x] `GET /api/ga/cleaning/rooms` returns 403 when the session user is `WIG002` but lacks `ga.manage`.
- [x] `PATCH /api/cleaning/checklist-items/[id]` returns 422 when the item belongs to a non current WIB date.

## Petugas daily flow (AC-1, AC-2, AC-3, AC-4)

- [x] Petugas can list only rooms with active assignments.
- [x] `POST /api/cleaning/checklists` creates a checklist with snapshot items matching the room's current active template items.
- [x] A second `POST` for the same room and WIB date returns the existing checklist (no duplicate).
- [x] `PATCH` an item to `isComplete: true` sets `lastChangedByUserId` and `lastChangedAt`.
- [x] An untouched item shows null actor and null time.
- [x] Marking all active items complete makes the derived status `SELESAI`.
- [x] Reopening one item returns the derived status to `BELUM`.
- [x] A room with no active template returns a `ROOM_NOT_READY` error, not a checklist.

## Master data management (AC-5)

- [x] Creating a room with a duplicate normalized name returns 409.
- [x] Creating a template item with a duplicate normalized name within its template returns 409.
- [x] Deactivating a template that is currently used by an active room returns 422 (dependency check).
- [x] Deactivating a room preserves its data and historical checklists.
- [x] Editing a template item after a checklist was created does not change existing daily snapshots.

## Assignment and role sync (AC-6, AC-8)

- [x] Creating the first active assignment for a user also creates the `CLEANING_WORKER` role assignment.
- [x] Removing the last active assignment removes the `CLEANING_WORKER` role assignment in the same transaction.
- [x] An assignment with `applyToToday: true` uses today's WIB date; without it, uses the next WIB date.
- [x] After role removal, the petugas immediately loses access to `/api/cleaning/rooms`.

## Recap and history (AC-7)

- [x] `GET /api/ga/cleaning/recap` returns a matrix for each room active now, for a past or current month.
- [x] A past date without a checklist record shows `BELUM`.
- [x] A future date returns a template preview (items from the active template) without creating a record.
- [x] Detail view for a date with a record shows item actors and times.

## Audit logging (AC-9)

- [x] Completing a checklist item creates an `AuditLog` entry with the actor, entity, and change metadata.
- [x] Creating or updating a room, template, template item, or assignment creates an `AuditLog` entry.
- [x] Audit detail contains no credentials, secrets, or personal data beyond identifiers.

## UI behavior

- [x] `/cleaning` page shows a room selector and today's checklist for the selected room.
- [x] Tapping an item toggles its completion state and shows a loading indicator until confirmed.
- [x] A failed save restores the previous item state and shows a toast error.
- [x] `/ga/cleaning/settings` has tabs for rooms, templates, and assignments.
- [x] `/ga/cleaning/recap` shows a monthly calendar matrix with `BELUM`/`SELESAI` cells.
- [x] The GA sidebar shows a "Kebersihan" group with "Pengaturan" and "Rekap Bulanan" links.

## Build verification

- [x] `npx tsc --noEmit` passes with zero errors.
- [x] `npm run build` succeeds (all cleaning routes compile).
- [x] `npm run lint` introduces no new errors from cleaning files.
