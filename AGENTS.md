# AI Agent Instructions

This repository contains a persistent Project Brain in `/docs`.

The Project Brain is the repository's durable knowledge layer for AI agents and
developers. It exists so future sessions can understand the system without
rebuilding the project's mental model from zero.

`/docs` is knowledge, not an audit report, issue tracker, TODO list, or
refactoring backlog.

---

## 1. Mandatory Entry Point

Before starting work on this repository:

1. Read `/docs/README.md`.
2. Read `/docs/AGENT_RULES.md`.
3. Identify which Project Brain documents are relevant to the task.
4. Read those relevant documents.
5. Use the Project Brain to form the initial system mental model.
6. Verify relevant facts against the actual implementation before changing code.

Do not blindly read every document for every task. Use `/docs/README.md` as the
navigation and routing index.

---

## 2. Project Brain Routing

Use the following routing as the minimum starting point:

| Task | Read First |
|---|---|
| General orientation | `PROJECT.md`, `CODEBASE_MAP.md`, `ARCHITECTURE.md` |
| New feature / feature change | `DOMAIN.md`, `FEATURES.md`, `FLOWS.md`, `CONSTRAINTS.md` |
| Bug investigation | Relevant domain/feature/flow docs + `GOTCHAS.md`, then source code |
| Database / schema | `DATA_MODEL.md`, `CONSTRAINTS.md`, relevant `FLOWS.md` |
| Routing / HTTP / validation | `API.md`, `CONVENTIONS.md`, `SECURITY.md` |
| Authentication / authorization | `SECURITY.md`, `ARCHITECTURE.md`, `API.md` |
| Architecture / design | `ARCHITECTURE.md`, `DECISIONS.md`, `CODEBASE_MAP.md` |
| External integration | `INTEGRATIONS.md`, `SECURITY.md`, `ARCHITECTURE.md` |
| Coding style / implementation pattern | `CONVENTIONS.md`, `ARCHITECTURE.md` |
| Testing | `TESTING.md`, `WORKFLOWS.md`, relevant feature/domain docs |
| Development / deployment workflow | `WORKFLOWS.md`, `CONSTRAINTS.md` |
| Unexpected system behavior | `GOTCHAS.md`, then the relevant domain/architecture docs |

When a task crosses multiple areas, read all relevant documents rather than
using only one routing row.

---

## 3. How to Use the Project Brain

Treat `/docs` as the project's persistent memory.

Use it to quickly understand:

- what the system does
- who uses it
- business terminology and rules
- major features
- end-to-end workflows
- architecture and layer boundaries
- important codebase locations
- database entities and relationships
- HTTP contracts
- authentication and authorization
- integrations
- coding conventions
- architectural decisions
- constraints
- known gotchas
- testing behavior
- development workflows

The Project Brain should give you the mental model first.

After that, inspect the implementation relevant to the current task.

---

## 4. Source of Truth

The Project Brain is context, not the implementation itself.

When verifying current behavior, use this priority:

1. Actual source code
2. Executable configuration
3. Tests, schemas, and migrations
4. `/docs`
5. Other documentation
6. AI assumptions

If `/docs` conflicts with the implementation:

- do not change code merely to make it match the documentation
- verify the actual implementation
- correct the outdated Project Brain information when appropriate
- mention the discrepancy in the final report

Never turn an AI assumption into project knowledge.

If something cannot be verified, mark it as:

`UNKNOWN — requires verification`

---

## 5. Do Not Audit Unless Asked

The Project Brain is not a standing code audit.

Do not perform unrelated:

- bug hunting
- vulnerability hunting
- duplicate-code analysis
- dead-code analysis
- dead-logic analysis
- code-smell hunting
- refactoring analysis
- quality scoring
- TODO discovery
- technical-debt discovery

If the human explicitly asks for a bug audit, security audit, refactoring review,
or similar analysis, perform that requested analysis.

Otherwise, stay focused on the assigned task.

If an unexpected behavior is discovered incidentally, only record it in the
Project Brain when it is durable knowledge that future agents need in order to
understand or safely work with the system.

---

## 6. Mandatory Project Brain Assessment

Before declaring a significant task complete, the agent MUST assess:

> Did this task create, remove, or change durable project knowledge?

This assessment is mandatory.

### If NO

Do not modify `/docs`.

### If YES

Update the relevant `/docs` document(s) before considering the task complete.

Examples:

- new/changed feature → `FEATURES.md`
- new/changed business rule → `DOMAIN.md`
- new/changed system flow → `FLOWS.md`
- new/changed schema/entity/relationship → `DATA_MODEL.md`
- new/changed HTTP contract → `API.md`
- new/important module structure → `CODEBASE_MAP.md`
- architecture change → `ARCHITECTURE.md`
- new architectural decision → `DECISIONS.md`
- new/changed integration → `INTEGRATIONS.md`
- new/changed convention → `CONVENTIONS.md`
- new/changed security behavior → `SECURITY.md`
- new/important constraint → `CONSTRAINTS.md`
- important surprising behavior → `GOTCHAS.md`
- changed testing behavior → `TESTING.md`
- changed development/deployment workflow → `WORKFLOWS.md`

Update only the documents actually affected.

---

## 7. Memory Maintenance Rules

When updating `/docs`:

1. Base the update on the actual implementation or verified project decision.
2. Preserve existing accurate knowledge.
3. Update only relevant sections.
4. Do not rewrite unrelated documents.
5. Do not duplicate the same knowledge across many documents unnecessarily.
6. Document concepts, contracts, relationships, and durable behavior.
7. Do not copy source code wholesale into `/docs`.
8. Do not record temporary debugging steps or conversation history.
9. Do not record every trivial file creation or variable rename.
10. Keep the Project Brain useful for fast future retrieval.

A new file/path should be documented only when it represents meaningful project
structure or a concept future agents need to understand.

---

## 8. New Features and Schema Changes

For a new feature:

1. Read the relevant Project Brain first.
2. Understand the existing architecture and domain flow.
3. Inspect the relevant implementation.
4. Implement the requested feature.
5. Verify it with appropriate tests.
6. Perform the mandatory Project Brain assessment.
7. Update the relevant Project Brain documents if durable knowledge changed.

For database/schema changes:

1. Review `DATA_MODEL.md` before implementation.
2. Review `CONSTRAINTS.md` for database/business constraints.
3. Review `DOMAIN.md` if business meaning changes.
4. Review `FLOWS.md` if state transitions or workflows change.
5. Review `DECISIONS.md` if the change represents an architectural decision.
6. Update the affected Project Brain documents after implementation.

---

## 9. Bug Investigations

When the human asks to investigate a bug:

1. Read the relevant Project Brain first.
2. Build the relevant system mental model.
3. Identify the affected flow/module.
4. Inspect the actual implementation.
5. Investigate the requested problem.
6. Use evidence rather than assumptions.
7. Fix the bug only if the task asks for a fix.
8. Afterward, assess whether the investigation/fix revealed durable knowledge.

Do not turn a bug investigation into a general code audit.

A bug should only enter `/docs` when the resulting knowledge is important for
future agents, such as a non-obvious system behavior or a durable gotcha.

---

## 10. Security and Sensitive Information

Never write secrets or sensitive data into `/docs`.

Never store:

- passwords
- password hashes of real users
- API keys
- access tokens
- JWT secrets
- database credentials
- private keys
- SSL private material
- production secret values
- raw sensitive customer or employee PII

It is acceptable to document how sensitive data is handled, where appropriate,
without recording the actual secret value.

---

## 11. Keep the Project Brain Clean

Do not create or use the Project Brain as a place for:

- temporary TODOs
- task progress logs
- bug lists
- audit reports
- refactoring backlogs
- duplicate-code reports
- dead-code reports
- temporary debug notes
- prompt/session transcripts

The Project Brain should answer:

> "What does this project know that a future AI agent needs to know?"

It should not answer:

> "What work should someone do next?"

---

## 12. Completion Requirement

Before declaring the task complete, verify:

1. The requested implementation/work is complete.
2. Relevant tests or verification were performed.
3. The relevant diff was reviewed when code was changed.
4. The mandatory Project Brain assessment was performed.
5. Any required `/docs` updates were made.
6. No unnecessary `/docs` files were changed.
7. No secrets or sensitive information were added to `/docs`.

The final response MUST contain a short Project Brain status:

### Project Brain
- `UPDATED` — list the affected `/docs` files and why
or
- `NO UPDATE REQUIRED` — explain briefly why no durable knowledge changed.

---

## 13. Core Principle

Think of the repository as:

```text
AGENTS.md
    ↓
How the AI must operate

/docs/README.md
    ↓
Where the knowledge is and which memory to read

/docs/*.md
    ↓
What the project knows

Actual source code
    ↓
What the system currently implements
```

The goal is not to make the AI audit the entire codebase every time.

The goal is to let the AI start with an accurate mental model, quickly reach the
relevant implementation, and continuously maintain that mental model as the
project evolves.
