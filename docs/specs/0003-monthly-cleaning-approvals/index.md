# 0003. Monthly cleaning approvals

**Date**: 2026-09-22
**Status**: In Progress

## Summary

This feature adds monthly signatures for each cleaning room. WIG002 opens a period and chooses one active internal employee for each role, `Diperiksa Oleh` and `Mengetahui`. Each employee reviews the period summary and signs from the employee portal. The signatures remain valid when checklist data later changes, while the last change time remains visible.

## Requirements

**User stories**:

* As WIG002, I want to open a monthly room period and choose its two internal reviewers so that the period can be reviewed even when its checklist is incomplete.
* As an assigned employee reviewer, I want to see my monthly tasks, review the matrix summary, and sign my assigned role from the employee portal.
* As WIG002, I want to see both signatures, their times, the derived period status, and later checklist changes so that the review history remains traceable.

**Acceptance criteria**:

* **AC-1**: Only the account with username exactly `WIG002` and permission `ga.manage` can open, read, or reopen a monthly approval period.
* **AC-2**: WIG002 can open one period for one room and one WIB year month without requiring the cleaning checklist to be complete. The request supplies `roomId`, `monthWib`, `inspectedByEmployeeId`, and `knownByEmployeeId`. Both employees must be active internal employees and must be different.
* **AC-3**: A period is unique for one room and one WIB year month. Concurrent open requests produce one record atomically and subsequent requests read that same record.
* **AC-4**: A monthly approval stores two fixed roles, `Diperiksa Oleh` and `Mengetahui`, with the selected employee, signature data, server signature time, and the applicable reopening history. The signature format is validated and limited to 256 KB after encoding.
* **AC-5**: Each selected employee can see all periods assigned to that employee in the employee portal, with filters for status and month. An employee can view the period summary but can sign only the matching stored slot.
* **AC-6**: An employee can sign either role in any order. The server requires an active account and active employee, and the employee identity in the session must match the employee stored on the slot.
* **AC-7**: Saving a signature returns the updated period, derived status, server time, and latest change summary. A repeated request with the same idempotency key does not create duplicate signature history.
* **AC-8**: The derived status represents whether the period is unopened, waiting for one or both signatures, or complete. It is derived from the period and its two signature slots, not manually entered.
* **AC-9**: A saved signature cannot be changed by the employee. WIG002 can explicitly reopen one slot with a mandatory reason. The old signature remains in history, the slot waits for a new signature, and the reopening is audited.
* **AC-10**: If a selected employee becomes inactive before signing, the server rejects the signature and WIG002 must reopen the slot with another active employee. The system does not silently replace the employee.
* **AC-11**: If checklist data changes after a signature, the signature remains valid. The period view shows the latest checklist change time and indicates that data changed after signing.
* **AC-12**: The WIG002 view shows periods by room and month, derived status, both reviewers, signature times, and the latest change. The employee view shows filtered tasks, the period summary, and a responsive signature canvas with clear and save actions plus an accessible alternative.
* **AC-13**: Opening a period, selecting reviewers, signing, reopening a slot, and relevant checklist changes create audit records with actor and server time. History remains available for as long as cleaning history and `AuditLog` are retained.
* **AC-14**: A failed signature save keeps the signature on screen, shows a retryable error, and does not mark the local state as saved. No email or push notification is required.

## Decision

**Chosen option**: Option 2: One monthly approval record with two fixed signature slots

Create one `CleaningMonthlyApproval` record for each room and WIB year month. Store the two fixed reviewer slots on that record, preserve reopened signatures in history, and expose separate protected APIs for WIG002 and employee self service.

**Implementation skills**: none detected

## Feature design

**Data model sketch**:

| Entity | Required fields | Relationships and constraints |
|---|---|---|
| `CleaningMonthlyApproval` | `id`, `roomId`, room name snapshot, `monthWib`, current reviewer employee IDs, created and updated times | Belongs to one cleaning room. Unique on `roomId` and `monthWib`. Current reviewer IDs must differ. Approval status is derived, not stored as authority. |
| `CleaningMonthlyApprovalSignature` | `id`, approval id, role, version, employee ID snapshot, signature payload, status, signedAt, reopenedAt, reopenedBy, reopenReason, supersededBy, created and updated times | Belongs to one approval. Role is `INSPECTED_BY` or `KNOWN_BY`. One current row per role is enforced by application transaction and a uniqueness strategy. Historical rows are append only. |
| `CleaningApprovalIdempotency` | actor ID, endpoint scope, idempotency key, request hash, serialized successful result, created and expires times | Unique on actor, endpoint, and key. Identical retries return the stored result. Reuse with a different hash returns conflict. |
| `AuditLog` | Existing audit fields plus action and structured metadata | Records open, reviewer selection, sign, reopen, and relevant changes through the existing audit service. |

The implementation should use the existing employee and room models and existing audit conventions. The exact Prisma field mappings must follow the active schema style, with explicit mapped names and indexes. The signature payload is a PNG data URL produced by `react-signature-canvas`. The server validates the data URL grammar, rejects an empty canvas, decodes the payload, and limits the decoded bytes to 256 KB. Responses use the same data URL format only for authorized history reads.

The active employee predicate requires `Employee.isActive`, an employment date range that includes the current WIB date when such dates exist, one linked active `UserAccount`, and the `employee.self` permission for signing. The account to employee relation is resolved from the existing account relation in Prisma, never from a client supplied account ID. A missing or inactive account prevents signing and requires WIG002 to reopen the slot.

The common approval projection returns a room ID, room name snapshot, `monthWib` in `YYYY-MM` format, the inclusive WIB date range, daily cells for every date in that month, each cell's derived `BELUM` or `SELESAI` state, active item count, completed item count, current reviewer slots, signature times, derived approval status, and latest checklist change time and actor. A missing daily checklist record is represented as `BELUM` with zero completed items and the configured active item count. GA and employee read paths use this same projection with different field visibility and authorization.

The latest checklist change is the maximum server `updatedAt` or item change timestamp across checklist records for the room and WIB dates in the requested month. If no checklist record exists, it is null. The projection also returns the latest change actor when available. Any checklist item mutation for that room and month is relevant and is already represented by the existing cleaning audit and timestamp conventions.

`monthWib` accepts only `YYYY-MM`. The period covers the first through the last WIB calendar date of that month. Past, current, and future months may be opened by WIG002. A room must exist to open a period. Its name is copied into a room name snapshot when the approval is first created, while the room relation is retained for authorization and history.

**State transitions**:

`UNOPENED` → `WAITING_FOR_SIGNATURES` when WIG002 opens a period.

Before a record exists, a room and month are `UNOPENED` only as a virtual absence in the WIG002 open workflow. The database does not create virtual approval rows.

`WAITING_FOR_SIGNATURES` → `PARTIALLY_SIGNED` when one slot is signed.

`WAITING_FOR_SIGNATURES` or `PARTIALLY_SIGNED` → `COMPLETE` when both current slots are signed.

WIG002 may reopen a slot without replacement, which keeps the assigned employee and clears only the current slot, or with a replacement employee, which changes the assigned employee and clears the current slot atomically. A replacement is required when the current employee is inactive. The replacement must be active, internal, different from the other current reviewer, and effective immediately for that period. Reopening moves the period back to the appropriate waiting state. The previous signature remains historical.

Checklist changes do not transition or invalidate a signature. They update the displayed latest change information.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/ga/cleaning/approvals` | GET | `roomId`, `monthWib`, optional status and month filters | Period, room, reviewers, derived status, signature times, latest change | WIG002 and `ga.manage` | 400 invalid month, 403 forbidden, 404 room |
| `/api/ga/cleaning/approvals` | POST | `roomId`, `monthWib`, `inspectedByEmployeeId`, `knownByEmployeeId` | Canonical period, derived status, and `created` or `existing` indicator | WIG002 and `ga.manage` | 400 invalid input, 409 non concurrent update conflict, 422 inactive or duplicate employee |
| `/api/ga/cleaning/approvals/reopen` | POST | approval id, slot role, mandatory reason, replacement employee if required | Updated period, reopened slot, audit summary | WIG002 and `ga.manage` | 400 invalid reason or role, 403 forbidden, 404 period |
| `/api/employee/cleaning/approvals` | GET | optional status and `monthWib` filters, pagination | Employee tasks, period summaries, assigned slot state | Active employee session and `employee.self` | 401 unauthenticated, 403 identity mismatch, 422 invalid filter |
| `/api/employee/cleaning/approvals/sign` | POST | approval id, slot role, signature payload, idempotency key | Updated period, derived status, server signed time, latest change summary | Active employee session matching the slot | 400 invalid payload, 409 already signed or reopened state, 413 payload too large |

All handlers authenticate, validate and sanitize inputs, check current permissions, and delegate business behavior to a service under `src/lib/services/`. List responses paginate even when the initial interface normally returns a small number of periods.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Open period | Room identity and month | Required request fields, validated against active room and WIB month format |
| Open period | Reviewer identities | Required employee IDs, validated from active internal `Employee` rows |
| Open period | Unique period result | Database unique constraint on room and month plus atomic create or read handling |
| WIG002 period list | Derived status | Derived from the two current signature slots |
| WIG002 period list | Signature times | `signedAt` fields from current signature slots and signature history |
| Employee task list | Employee scope | Current authenticated session employee ID, not a client supplied employee ID |
| Employee task list | Filters and pagination | Validated query parameters |
| Sign period | Signature payload | Validated request body from the signature canvas |
| Sign period | Server time | Server clock at the successful transaction |
| Sign period | Reviewer identity | Existing approval slot and current session employee identity |
| Sign period | Latest checklist change | Maximum server update or item change timestamp for the room's checklist records within the month's WIB date range, null when no record exists |
| All reads | Matrix room and date values | Approval room name snapshot, room ID, validated `monthWib`, and the first and last WIB dates of that month |
| All reads | Daily cell state and counts | Existing daily checklist snapshot and active item configuration. Missing record means `BELUM`, zero completed items, and the configured active item count |
| All reads | Approval history visibility | Current slot and historical signature rows, filtered by the endpoint's WIG002 or matching employee policy |
| Reopen slot | Reason and replacement reviewer | Validated WIG002 request fields and active employee data. Replacement is required for an inactive current employee and is otherwise optional |
| Sign period | Idempotency result | `CleaningApprovalIdempotency` row keyed by actor, endpoint, and request key, with request hash comparison |
| All mutations | Actor and audit time | Current authenticated session and server clock through the existing audit service |

**Key invariants**:

* One room and one WIB month has at most one approval record.
* The two reviewer employees must be active internal employees and must differ when the period is opened.
* A signature can be written only by the matching active employee account.
* Employees cannot overwrite an existing signature.
* Reopening is explicit, requires WIG002 authorization and a reason, and preserves the prior signature.
* Derived status is never manually stored as the source of truth.
* Signature history and cleaning snapshots are not deleted by this feature.
* Signature mutations are safe to retry with an idempotency key. The key is stored with actor, endpoint scope, request hash, and successful result. An identical retry returns the saved result. Reuse with a different request hash returns conflict. A failed transaction stores no successful result.
* Open, sign, and reopen each commit their business rows, idempotency row when applicable, and AuditLog entry in one database transaction. Deadlock or serialization failures may retry the whole transaction with bounded retries.
* A checklist update never deletes or invalidates a signature.
* The current signature for a role is the latest non superseded row. Reopening supersedes the current row and creates a new unsigned current slot version. No role can have two current signed rows.
* The GA list uses explicit query defaults, stable ordering by month descending then room name and ID, and page metadata. The employee list returns one task per assigned role, so a period can appear twice when the same employee owns both roles, although opening prevents the two roles from being assigned to the same employee.

## Build plan

The project uses a Tracer Bullet approach. The first slice should prove one complete path through schema, service, protected API, WIG002 screen, employee task screen, and signature persistence. Later slices add history, reopening, and hardening without creating a separate parallel workflow.

- [x] 1. Add the monthly approval and signature history data model, including the room and month unique constraint, role constraint, indexes, and relations to room and employee, satisfies **AC-2**, **AC-3**, **AC-4**, and **AC-9**.
- [x] 2. Add the cleaning approval service with atomic open or read behavior, active internal reviewer validation, derived status, current employee authorization, signature validation, idempotency handling, and audit transactions, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-6**, **AC-7**, **AC-8**, **AC-10**, and **AC-13**.
- [x] 3. Add protected WIG002 and employee API routes using the existing guard, validation, error, permission, pagination, and service conventions, satisfies **AC-1**, **AC-5**, **AC-6**, **AC-7**, **AC-9**, and **AC-10**.
- [x] 4. Build the narrow end to end WIG002 and employee interface. WIG002 can open and inspect a period. An employee can see a task, read the summary, draw a responsive signature, clear it, save it, and retry a failed save, satisfies **AC-2**, **AC-5**, **AC-6**, **AC-8**, **AC-12**, and **AC-14**.
- [x] 5. Add reopening with mandatory reason, append only signature history, replacement reviewer handling, and audit display, satisfies **AC-9**, **AC-10**, and **AC-13**.
- [x] 6. Add latest checklist change sourcing and visual indication after signing, then add service, API, and component regression tests for concurrency, authorization, idempotency, payload limits, inactive employees, and later changes, satisfies **AC-3**, **AC-7**, **AC-10**, **AC-11**, **AC-12**, **AC-13**, and **AC-14**.
