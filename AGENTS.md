# Presensi dan HRIS WIG

## Stack

* **Language / Runtime**: TypeScript, Node.js 20 or newer
* **Framework**: Next.js 16.1.6 App Router, React 19.2.3, Tailwind CSS 3.4
* **Key dependencies**: Prisma 6.19.2, MariaDB or MySQL, Zod, jose, Sharp
* **Package manager**: npm

## Build approach

Tracer Bullet (buktikan satu alur nyata lintas akses, data, API, dan antarmuka sebelum menambah keluasan).

## Commands

```bash
# Install
npm install
# Dev server
npm run dev
# Build
npm run build
# Test
npm test -- --run
npm run lint
npx tsc --noEmit
```

## Specs

Feature specs live under `docs/specs/`. Durable project knowledge lives in `docs/`, starting at `docs/README.md`.

## Rules

* Read `docs/AGENT_RULES.md` and the task specific documents routed by `docs/README.md` before changing code.
* Trust active source and executable configuration over documentation when they disagree. Report the conflict instead of changing code to match stale prose.
* Keep changes narrow, keep TypeScript strict, and use the `@/` alias. Do not add dependencies or refactor unrelated code without a clear need.
* API handlers must authenticate, check permissions, sanitize and validate input, delegate business logic to `src/lib/services/`, and use standard error helpers.
* Use the shared Prisma client from `@/lib/prisma`. Never create another client in application code.
* Keep `src/proxy.ts` compatible with the Edge runtime. Do not import Node only modules or Prisma there.
* Protect secrets and personal data. Search encrypted personal data through its blind index and use the WIB time helpers for attendance dates.
* Update the Project Brain only when durable project knowledge changes, then report `Project Brain: UPDATED` or `Project Brain: NO UPDATE REQUIRED`.

## Agent skills

* [find-docs](.agents/skills/find-docs/): `upstash/context7`, current library documentation when the user explicitly requests it

Declined: automatic Agent Skill and MCP discovery

## Context files

* [docs/AGENTS.md](docs/AGENTS.md): rules for maintaining the Project Brain
* [src/app/AGENTS.md](src/app/AGENTS.md): App Router pages, layouts, and portal boundaries
* [src/app/api/AGENTS.md](src/app/api/AGENTS.md): API authentication, validation, and response patterns
* [src/lib/AGENTS.md](src/lib/AGENTS.md): business services, authentication, security, and infrastructure helpers
* [src/components/AGENTS.md](src/components/AGENTS.md): shared React components and interface conventions
* [prisma/AGENTS.md](prisma/AGENTS.md): schema, migrations, and seed safety
* [tests/AGENTS.md](tests/AGENTS.md): Vitest suites and integration test requirements

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
