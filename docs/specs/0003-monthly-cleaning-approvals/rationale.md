# Rationale: 0003. Monthly cleaning approvals

**Date**: 2026-09-22
**Status**: In Progress

## Context

The cleaning module already records daily checklist snapshots, room assignments, audit actors, and monthly recap data. The next scope slice needs a controlled way to record that a monthly matrix was reviewed and acknowledged. The process must also work when the checklist is incomplete because WIG002 may need to start administrative review before all daily work is finished.

The application already separates the GA and employee portals, uses current database backed sessions, stores business behavior in services, and uses Prisma with MariaDB or MySQL. The feature touches employee identity, signatures, audit history, and personal access rules. It must preserve cleaning history and must not silently replace or invalidate a previous signature when checklist data changes.

> Premise note: A signature is treated as evidence of review, not as a lock on the checklist. This is deliberate because the agreed process allows later checklist changes. The interface must make the last change visible so a reviewer can distinguish the signed review from later activity.

## Consequences

**Positive**:

* Review evidence is tied to a room and WIB month.
* WIG002 can start review without waiting for checklist completion.
* Employee identity and role scope are checked on the server.
* Later checklist changes remain visible without destroying valid signatures.
* Existing authentication, employee portal, audit service, and cleaning service patterns are reused.

**Negative or tradeoffs**:

* Signature history adds storage and query complexity.
* The system must explain two timelines, the signature time and the later checklist change time.
* Reopening is an additional administrative action that requires careful authorization and reason capture.
* Storing signature canvas data in the database increases row size compared with storing only a file reference.

**Neutral**:

* No email, push notification, new secret, or external storage service is introduced.
* The employee portal gains a mobile focused signing interaction.
* The feature does not lock or freeze checklist data.

## References

**Project sources**:

* `AGENTS.md`, project stack, Tracer Bullet approach, and security rules
* `docs/scope/scope.md`, Slice 3 intent and acceptance seed
* `docs/specs/0001-core-cleaning-loop/index.md`, cleaning checklist and recap contract
* `docs/specs/0002-cleaning-master-worker-access/index.md`, current cleaning identity and access contract
* `src/lib/services/cleaningService.ts`, active cleaning service and authorization conventions
* `src/lib/services/auditService.ts`, existing audit behavior
* `src/lib/auth.ts`, current database backed session identity
* `prisma/schema.prisma`, active employee, room, and audit data model

**Practices and standards**:

* Database unique constraints and atomic create or read handling for concurrent period creation
* Idempotency keys for safe mutation retries
* Append only audit and signature history for administrative evidence
* Derived state instead of duplicated stored status
