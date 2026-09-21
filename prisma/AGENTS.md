# Prisma data layer

## Overview

This area owns the MariaDB and MySQL schema, migration history, seed programs, and data repair utilities. Application code reaches this schema through the shared client in `src/lib/prisma.ts`.

## Key files

* `schema.prisma` owns models, relations, indexes, database names, and the MySQL provider.
* `migrations/` preserves historical schema changes.
* `seed.ts` owns the main seed and creates random initial administrator passwords.
* `seedDev.ts` owns deterministic development data used by API tests.
* The other `seed*.ts` files own focused HR, GA, employee, asset, shift, company, RBAC, and Green Meeting data.

## Commands

```bash
npm run db:push
npm run db:seed
npm run db:seed:dev
npm run db:studio
```

## Conventions

* Name Prisma models and enums with PascalCase and fields with camelCase.
* Map database tables and columns to plural snake case names with `@@map` and `@map`.
* Give important indexes and foreign key constraints explicit mapped names.
* Keep personal data encrypted and maintain its blind index fields together.
* Review related services, tests, and `docs/DATA_MODEL.md` whenever the schema changes.

## Gotchas

* The operating workflow uses `prisma db push`, even though migration history is retained. Do not assume `_prisma_migrations` exists.
* Every `db:reset*` script destroys database data. Use it only against a confirmed disposable database.
* The main seed prints random temporary passwords. API tests expect the deterministic development seed instead.
* Date fields are real `DateTime` values. Build WIB calendar ranges with the shared time helpers.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
