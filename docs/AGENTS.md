# Project Brain

## Overview

This area stores durable knowledge about the product, architecture, domain, security, data, testing, and operations. `README.md` is the routing index, while `AGENT_RULES.md` defines how every coding agent should use and maintain this knowledge.

## Key files

* `README.md` owns the reading order, topic routing, and source priority.
* `AGENT_RULES.md` owns the operating contract for agents.
* `PROJECT.md`, `ARCHITECTURE.md`, and `CODEBASE_MAP.md` explain the system and its boundaries.
* `DOMAIN.md`, `DATA_MODEL.md`, `FEATURES.md`, `FLOWS.md`, and `API.md` hold product and implementation knowledge.
* `SECURITY.md`, `CONSTRAINTS.md`, `GOTCHAS.md`, `TESTING.md`, and `WORKFLOWS.md` hold safety and operating guidance.

## Conventions

* Update a document only when a task changes durable project knowledge.
* Route each fact to the document that owns that topic. Do not duplicate whole explanations across files.
* Keep claims supported by active source, executable configuration, tests, schemas, or migrations.
* Mark facts that cannot be verified as `UNKNOWN, requires verification`.
* Keep temporary plans, progress logs, debugging notes, audit findings, and backlog items out of this directory.
* Never record live secrets, credentials, tokens, password hashes, or real employee personal data.

## Gotchas

* Active implementation has higher priority than these documents when they disagree.
* Do not change documentation merely to make an incorrect implementation appear correct.
* Before finishing a code task, decide whether durable knowledge changed and report the Project Brain status.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
