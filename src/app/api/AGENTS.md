# API routes

## Overview

This area exposes the server API through Next.js route handlers. Handlers protect the boundary, then call domain services for business behavior and database work.

## Key files

* `../../lib/middleware/apiGuard.ts` owns session checks, body parsing, sanitization, validation, and standard error responses.
* `../../lib/validations/validationSchemas.ts` owns shared Zod input schemas.
* `../../lib/services/` owns business logic used by route handlers.
* `auth/` owns login, logout, profile, session, and password actions.
* `cron/` owns scheduled HTTP entry points protected by a secret or an authorized HR session.

## Conventions

* Start protected handlers with `requireAuth()` and return `unauthorizedResponse()` when no active session exists.
* Check permission codes before reading or mutating protected data. Do not rely on the deprecated `session.role` projection for new authorization rules.
* Use `validateBody()` for JSON, or the guarded body parsers for JSON and multipart input.
* Keep business logic in `src/lib/services/`. Route files should coordinate HTTP concerns and map results to responses.
* Use `serverErrorResponse()` for unexpected failures so details stay in Winston logs and not in client responses.
* Use `NextResponse.json()` and preserve existing response shapes when changing an endpoint.

## Gotchas

* The page proxy excludes `/api`. Every protected API route must enforce its own session and permissions.
* Cron routes require `Authorization: Bearer <CRON_SECRET>` or the documented authorized session path.
* Multipart bodies can be consumed only once. Pass already parsed data through the supported helper path.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
