# Vitest suites

## Overview

This area verifies API routes, domain services, database integration, React components, and shared utilities. Node is the default environment, while component suites opt into jsdom per file. Some suites are isolated, while others need a real database or a running Next.js server.

## Key files

* `../vitest.config.ts` owns the Node environment, path alias, and 30 second timeouts.
* `api/` owns live HTTP tests against `http://localhost:3000`.
* `components/` owns React component tests using Testing Library and per file jsdom environments.
* `services/` owns service unit tests and database integration tests.
* `utils/` owns helper tests and `apiTestHelper.ts` for API authentication.
* `../src/lib/services/__tests__/` contains calculator unit tests colocated with their services.

## Commands

```bash
# All tests, server required for API suites
npm test -- --run

# Service suites
npx vitest run tests/services/

# Utility suites
npx vitest run tests/utils/

# API suites, start the app first
npx vitest run tests/api/
```

## Conventions

* Use the `@/` alias for application imports.
* Keep database and cryptography test timeouts compatible with the configured 30 seconds.
* Add regression coverage near the layer where the behavior lives.
* Make database setup and cleanup explicit. Never point destructive test setup at production data.

## Gotchas

* API tests use real network requests and fail when no server listens on port 3000.
* Service integration tests use `DATABASE_URL` and may mutate real database state.
* API login helpers expect deterministic credentials from `npm run db:seed:dev`, not the random passwords from the main seed.
* Component tests use jsdom and Testing Library, but no end to end browser framework is configured.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
