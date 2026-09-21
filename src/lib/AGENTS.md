# Application library

## Overview

This area owns domain services, authentication, authorization, validation, security, database access, logging, exports, notifications, and shared server utilities. Route handlers should depend on these modules instead of embedding business logic.

## Key files

* `services/` owns domain behavior and database operations.
* `middleware/apiGuard.ts` owns the API security and validation boundary.
* `auth.ts` owns JWT sessions and current database backed user access.
* `permissions.ts` owns system roles and permission codes.
* `security/pii.ts` owns personal data encryption and blind indexes.
* `prisma.ts` owns the only shared Prisma client.
* `timezone.ts` owns WIB date and time conversion.
* `logger.ts` owns structured server logging.

## Conventions

* Keep route handlers thin and put reusable business behavior in a domain service.
* Import the shared database client from `@/lib/prisma`.
* Keep authorization based on current permission codes. The database remains authoritative through `getActiveSession()`.
* Validate input with Zod and sanitize strings at the API boundary before service calls.
* Log structured context without exposing secrets or personal data.
* Use the time helpers for calendar boundaries and attendance calculations in WIB.

## Gotchas

* `auth.ts`, Prisma, Node crypto, filesystem modules, and Sharp are Node runtime code. Do not import them into `src/proxy.ts`.
* Encrypted personal fields use random initialization vectors. Exact lookup must use the matching blind index column.
* Session validity depends on the current account, employee state, roles, permissions, and `sessionVersion`, not only the JWT signature.
* Visit photos and some uploads use local disk storage, so another server instance will not see them without shared storage.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
