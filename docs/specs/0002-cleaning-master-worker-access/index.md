# 0002. Cleaning master dan akses petugas

**Date**: 2026-09-22
**Status**: Implemented

## Summary

Perluasan ini menambahkan dukungan petugas internal dan outsource pada modul cleaning yang sudah berjalan. WIG002 tetap menjadi satu satunya pengelola master, sedangkan akun petugas tetap dibuat melalui modul manajemen pengguna dan hanya ditetapkan ke ruangan melalui cleaning. Penugasan disimpan sebagai riwayat sehingga pergantian petugas tidak menghapus jejak kerja lama.

## Context

Core cleaning loop sudah menyediakan template, ruangan, checklist harian bersama, role `CLEANING_WORKER`, dan penugasan berbasis `UserAccount`. Penugasan saat ini memakai satu record untuk setiap pasangan ruangan dan akun, sehingga riwayat pengangkatan ulang pasangan yang sama tidak dapat disimpan dengan baik. Model saat ini juga belum membedakan petugas internal dari outsource.

Di lapangan, petugas sering berganti. Petugas internal berasal dari master `Employee`, sedangkan petugas outsource memakai akun `UserAccount` tanpa relasi `Employee`. Ketika employee internal atau akun outsource dinonaktifkan, akses cleaning harus dicabut agar akun lama tidak tetap dapat membuka pekerjaan.

Administrasi harus tetap sempit. WIG002 tetap wajib memiliki username tepat `WIG002` dan permission `ga.manage`. Petugas internal dan outsource memiliki kemampuan checklist yang sama, tetapi tipe penugasannya perlu terlihat dan dapat difilter untuk membantu pergantian operasional.

## Requirements

**User stories**:

* Sebagai WIG002, saya ingin memilih petugas internal atau outsource dan menetapkannya ke satu atau beberapa ruangan agar pekerjaan cleaning dapat disesuaikan dengan kondisi lapangan.
* Sebagai WIG002, saya ingin melihat tipe dan riwayat penugasan agar pergantian petugas dapat ditelusuri.
* Sebagai petugas yang ditetapkan, saya ingin tetap mengerjakan checklist bersama sesuai ruangan aktif saya, tanpa perbedaan akses antara internal dan outsource.
* Sebagai sistem, saya ingin mencabut akses cleaning ketika akun atau employee dinonaktifkan agar akses lama berhenti.

**Acceptance criteria**:

* **AC-1**: WIG002 dengan username tepat `WIG002` dan permission `ga.manage` tetap menjadi satu satunya pihak yang dapat mengelola master cleaning dan penugasan.
* **AC-2**: Penugasan memiliki tipe wajib `INTERNAL` atau `OUTSOURCE`. Petugas `INTERNAL` hanya dapat dipilih dari `UserAccount` aktif yang terhubung ke `Employee` aktif. Petugas `OUTSOURCE` hanya dapat dipilih dari `UserAccount` aktif tanpa relasi `Employee`.
* **AC-3**: Satu akun dapat memiliki penugasan aktif pada beberapa ruangan. Penugasan internal dan outsource mempunyai akses checklist yang sama, yaitu role `CLEANING_WORKER`, permission `cleaning.execute`, dan pemeriksaan penugasan aktif per ruangan.
* **AC-4**: Penugasan baru dan perubahan normal mulai berlaku pada tanggal WIB berikutnya. `applyToToday: true` hanya diproses dari aksi WIG002 yang telah dikonfirmasi di antarmuka dan berlaku segera pada tanggal WIB hari ini.
* **AC-5**: Riwayat penugasan bersifat append only. Setiap penugasan memakai interval tanggal WIB setengah terbuka `[startsOnWibDate, endsOnWibDate)`: tanggal mulai termasuk, tanggal berakhir tidak termasuk, dan `null` berarti belum berakhir. Penugasan lama tidak diubah menjadi tipe lain dan tidak dihapus. Untuk satu pasangan akun dan ruangan, interval tidak boleh tumpang tindih. Penggantian tipe dilakukan dengan mengakhiri penugasan lama lalu membuat penugasan baru.
* **AC-6**: Saat penugasan dicabut atau diganti dengan `applyToToday: true`, akses petugas lama berhenti segera setelah transaksi berhasil, checklist hari itu tetap satu snapshot bersama, dan petugas baru dapat melanjutkan checklist yang sama. Aktor perubahan sebelumnya tetap tersimpan pada item checklist.
* **AC-7**: Saat penugasan baru memakai `applyToToday: false`, petugas lama tetap berlaku sampai akhir tanggal WIB berjalan dan petugas baru mulai pada tanggal WIB berikutnya. Sistem tidak membuat checklist baru hanya karena pergantian petugas.
* **AC-8**: Ketika employee atau akun yang menjadi sumber kelayakan dinonaktifkan, relasinya dilepas, atau relasinya berubah sehingga tidak lagi sesuai dengan tipe penugasan, seluruh penugasan cleaning yang terdampak diakhiri otomatis pada tanggal efektif yang ditetapkan oleh alur status sumber. Role `CLEANING_WORKER` dicabut bila tidak ada penugasan yang efektif pada tanggal WIB hari ini. Operasi pencabutan, audit, sinkronisasi role, dan perubahan status sumber atomik dalam transaksi sumber.
* **AC-9**: Pencabutan otomatis membuat satu `AuditLog` untuk setiap penugasan yang dicabut dengan alasan, aktor sistem, waktu server, akun, ruangan, tipe petugas, dan periode penugasan. Audit tidak menyimpan kredensial atau data sensitif yang tidak diperlukan.
* **AC-10**: Halaman pengaturan WIG002 menampilkan tipe petugas pada setiap penugasan, menyediakan filter `INTERNAL` dan `OUTSOURCE`, menampilkan penugasan aktif serta riwayat tidak aktif, dan menampilkan tanggal mulai serta tanggal berakhir bila ada.
* **AC-11**: Perubahan terhadap data akun atau employee yang menjadi sumber kelayakan tidak membuat akun yang sudah memiliki riwayat penugasan kehilangan riwayat. Akun nonaktif tidak dapat dipilih untuk penugasan baru.
* **AC-12**: Endpoint dan service mempertahankan kontrak core cleaning loop untuk checklist harian, otorisasi per ruangan, status WIB, snapshot immutable, status turunan, dan audit perubahan item.

## Options considered

### Option 1: Memperbaiki model penugasan yang ada

Menambahkan tipe dan periode tanggal pada `CleaningWorkerAssignment`, lalu mengubah operasi upsert menjadi pembuatan dan penutupan record historis.

**Pros**:

* Perubahan paling dekat dengan implementasi yang sudah berjalan.
* Checklist, role, API, dan halaman yang ada dapat diperluas tanpa domain baru.
* Riwayat dapat diterapkan dengan migrasi terarah.

**Cons**:

* Constraint unik lama harus diganti dengan aturan periode yang dijaga service dan transaksi.
* Alur status employee dan akun harus disentuh agar pencabutan otomatis konsisten.

### Option 2: Membuat profil petugas cleaning terpisah

Membuat entitas identitas petugas baru yang menyimpan tipe internal atau outsource, lalu menghubungkannya ke akun dan penugasan.

**Pros**:

* Dapat menampung metadata operasional cleaning yang lebih luas di masa depan.
* Identitas outsource tidak tercampur dengan model akun umum.

**Cons**:

* Menambah entitas, alur administrasi, validasi, dan sumber kebenaran baru tanpa kebutuhan saat ini.
* Berisiko menggandakan identitas `UserAccount` dan membuat sinkronisasi status lebih sulit.

### Option 3: Menentukan tipe otomatis dari relasi Employee

Menganggap akun dengan `employeeId` sebagai internal dan akun tanpa `employeeId` sebagai outsource.

**Pros**:

* Tidak menambah field tipe pada penugasan.
* Pemilihan akun terlihat sederhana.

**Cons**:

* Tidak menyimpan keputusan tipe pada saat penugasan.
* Perubahan relasi akun ke employee dapat mengubah makna riwayat lama.
* Tidak memenuhi kebutuhan audit pergantian petugas dan filter tipe yang eksplisit.

## Decision

**Chosen option**: Option 1: Memperbaiki model penugasan yang ada

Pertahankan `UserAccount` sebagai identitas login dan `CleaningWorkerAssignment` sebagai sumber akses cleaning, tambahkan tipe petugas dan periode WIB, lalu ubah penugasan menjadi riwayat append only dengan aturan tidak boleh ada periode aktif yang tumpang tindih.

## Rationale

Perluasan ini tidak membutuhkan profil identitas baru. Codebase sudah memisahkan `UserAccount` dari `Employee`, dan core cleaning loop sudah menggunakan `CleaningWorkerAssignment` sebagai sumber role serta otorisasi ruangan. Memperluas boundary yang sama menjaga satu sumber kebenaran dan mengurangi risiko akses yang berbeda antara internal dan outsource.

Riwayat append only dipilih karena pergantian petugas adalah kebutuhan operasional nyata, bukan sekadar label tampilan. Periode WIB dan transaksi diperlukan agar penggantian hari ini tidak meninggalkan dua akses aktif atau mengubah checklist harian menjadi dua record. Ketika employee atau akun dinonaktifkan, pencabutan ditempatkan pada transaksi status sumber agar revokasi sesi, penugasan, dan role tidak terpisah.

## Feature design

**Data model sketch**:

| Entity | Required fields | Relationships and constraints |
|---|---|---|
| `CleaningWorkerAssignment` | `id`, `roomId`, `userId`, `workerType`, `startsOnWibDate`, nullable `endsOnWibDate`, `createdAt`, `updatedAt` | Relasi ke `CleaningRoom` dan `UserAccount`. `workerType` adalah `INTERNAL` atau `OUTSOURCE`. `roomId`, `userId`, `workerType`, dan `startsOnWibDate` immutable setelah dibuat. Satu pasangan ruangan dan akun tidak boleh memiliki interval yang tumpang tindih. |
| `UserAccount` | Existing fields, termasuk `isActive` dan nullable `employeeId` | `employeeId` aktif menjadi sumber kelayakan internal. Akun aktif tanpa `employeeId` menjadi sumber kelayakan outsource. |
| `Employee` | Existing `isActive` and status fields | Employee nonaktif memicu pencabutan semua penugasan cleaning akun terkait dalam transaksi status employee. |
| `CleaningDailyChecklist` | Existing fields | Tetap satu record per ruangan dan tanggal WIB. Tidak berubah saat petugas berganti. |
| `CleaningDailyChecklistItem` | Existing actor and timestamp fields | Menyimpan aktor terakhir dan waktu server. Riwayat aktor sebelumnya tetap berada pada audit log yang sudah ada. |
| `AuditLog` | Existing fields | Mencatat pencabutan otomatis dan metadata aman penugasan. |

**State transitions**:

* Penugasan baru: `planned` menuju `active` pada `startsOnWibDate`.
* Interval penugasan adalah `[startsOnWibDate, endsOnWibDate)`. Akses berlaku jika `startsOnWibDate <= currentWibDate` dan (`endsOnWibDate` null atau `currentWibDate < endsOnWibDate`).
* Penugasan aktif: `active` menuju `ended` pada `endsOnWibDate`.
* Pencabutan segera: penugasan aktif diakhiri pada tanggal WIB hari ini dan role disinkronkan dalam transaksi.
* Pencabutan terjadwal: penugasan aktif diakhiri pada tanggal efektif dan akses berakhir ketika tanggal tersebut berlaku.
* Tipe penugasan tidak berubah. Perubahan tipe selalu membuat record baru setelah record lama diakhiri.
* Pergantian dan validasi overlap mengunci baris assignment untuk pasangan `roomId` dan `userId` dalam transaksi serializable. Konflik transaksi dicoba ulang terbatas lalu dikembalikan sebagai `409` tanpa perubahan parsial.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/ga/cleaning/assignments` | `GET` | optional `roomId`, optional `workerType`, optional `includeInactive` | assignments with user, room, type, start, end, active state | WIG002 only | 401, 403, 422 |
| `/api/ga/cleaning/assignments` | `POST` | `roomId`, `userId`, `workerType`, optional `applyToToday`, required `reason` for replacement | created assignment and effective date | WIG002 only, current database backed session | 403, 409 overlap, 422 ineligible user |
| `/api/ga/cleaning/assignments` | `PATCH` | `assignmentId`, action `END` or `REPLACE`, optional `applyToToday`, required reason | ended assignment, optional replacement, and role access result | WIG002 only, current database backed session | 403, 404, 409, 422 |
| `/api/ga/cleaning/assignments/available-users` | `GET` | required `workerType` equal to `INTERNAL` or `OUTSOURCE` | eligible active accounts with employee identity when internal | WIG002 only, current database backed session | 401, 403, 422 |
| `/api/cleaning/rooms` | `GET` | none | active rooms assigned to current account and effective today | Cleaning Worker | 401, 403 |
| `/api/cleaning/checklists` | `GET`, `POST` | `roomId`, valid date where applicable | existing shared snapshot or created snapshot | Cleaning Worker with effective assignment | 403, 404, `ROOM_NOT_READY` |
| `/api/cleaning/checklist-items/[id]` | `PATCH` | `isComplete` | saved item, actor, server time, derived status | Cleaning Worker with effective assignment | 403, 422 non current date |
| `/api/employees/[id]/status` | `PUT` | existing status input | updated employee status and revoked cleaning assignments when applicable | Existing employee status permission | existing errors plus transactional failure |
| Existing user management account status endpoint | existing method | existing account status input | updated account and revoked cleaning assignments when applicable | Existing user management permission | existing errors plus transactional failure |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Current WIB date and time | date comparison, end date, audit timestamp | `toWIBDateString(new Date())` and server `new Date()` from the existing timezone helper and server clock |
| System audit actor | actor identifier and name | fixed system actor values defined by the audit service, never client input |
| Assignment active state | active or ended display and access decision | derived from the interval predicate, never a separate mutable `isActive` field |
| Replacement reason | audit detail and history explanation | sanitized required request field for `REPLACE` or automatic source status reason |
| Worker history visibility | allowed or denied checklist history | WIG002 authorization from current database backed session; revoked workers retain no room history access, consistent with core cleaning security |
| WIG002 assignment target | self assignment and administrator assignment behavior | WIG002 may assign any eligible account except the current WIG002 account and accounts with `SUPER_ADMIN`, `HR_ADMIN`, or `GA_ADMIN` roles |
| Select internal users | active account identity and employee name | active `UserAccount` with non null `employeeId`, joined `Employee` with `isActive: true` |
| Select outsource users | active account identity and display name | active `UserAccount` with null `employeeId` |
| Assignment type | `INTERNAL` or `OUTSOURCE` | validated `workerType` input stored on assignment |
| Assignment start | effective WIB date | current WIB date or next WIB date derived from `applyToToday` |
| Assignment end | ended WIB date | revocation action and its effective date |
| Worker room list | rooms available today | active assignments with `startsOnWibDate <= currentWibDate` and `endsOnWibDate` absent or later than current date, plus active room state |
| Worker access | role and permission result | current session plus active effective assignment and `CLEANING_WORKER` role |
| Daily checklist | one shared snapshot | existing `CleaningDailyChecklist` keyed by room and current WIB date, or current room template at first creation |
| Checklist actor | display name and server time | `lastChangedByUserId`, `lastChangedAt`, and joined `UserAccount` |
| Assignment history | type, dates, room, user, active state | append only `CleaningWorkerAssignment` records |
| Automatic revocation | revoked assignment, reason, actor, time | source status transaction, assignment row, server time, and system audit actor |
| Filter counts | active and inactive totals by type | filtered assignment rows, not derived from current account relation |

**Key invariants**:

* WIG002 authorization remains exact username `WIG002` plus `ga.manage`.
* A worker must have an active account, the system managed `CLEANING_WORKER` role, `cleaning.execute`, and an effective assignment for the requested room.
* `CLEANING_WORKER` is system managed only from effective assignments. Direct manual grants are rejected for this role, and the migration reports existing direct grants before enforcement.
* Internal assignment eligibility requires active `Employee`. Outsource assignment eligibility requires no `Employee` relation. Any account status or employee relation transition that breaks this eligibility revokes affected assignments.
* Assignment type is immutable after creation.
* No room and account pair may have overlapping assignment periods.
* A user may have several rooms, and several users may share one room.
* A same day replacement ends the old assignment before the new assignment becomes effective in one transaction.
* A next day replacement does not revoke the current worker before the current WIB date ends.
* The checklist remains one room and date snapshot regardless of worker changes.
* Account or employee deactivation, employee link removal, or link reassignment ends every affected assignment that no longer satisfies its stored worker type. Role removal is based on effective assignments for the current WIB date, not merely on stored rows.
* Assignment mutation, source status change, role synchronization, and automatic revocation audit rows use the same Prisma transaction client. Audit failure rolls back the complete transaction.
* Automatic revocation records one safe audit entry per ended assignment.
* Historical assignments are never deleted or rewritten to another worker type.
* Existing core cleaning invariants remain unchanged.

**Security model**:

* WIG002 alone may read and mutate cleaning master data and assignment history.
* Petugas internal and outsource have identical checklist permissions, limited by current account status, role, permission, effective assignment, active room, and current WIB date for mutation.
* The portal and every API route remain protected independently. The page guard is not the authorization boundary.
* Account deactivation and employee deactivation revoke cleaning assignments in the same Node transaction as the source status update.
* Audit metadata contains identifiers, type, dates, reason, actor, and time. It does not contain password, token, or sensitive employee data.
* The design adds no public route, external integration, secret, or personal data category.

**Configuration required**:

No new environment variable, secret, feature flag, or external provider is required.

**Critical test scenarios**:

* Happy path: WIG002 assigns an active internal account and an active outsource account to different rooms, both enter `/cleaning`, and both update shared checklists with identical permissions, verifies **AC-1**, **AC-2**, **AC-3**, **AC-12**.
* History: the same account and room is ended and later assigned again with a different type, both records remain visible and their periods do not overlap, verifies **AC-5**, **AC-10**, **AC-11**.
* Same day replacement: `applyToToday` ends the old assignment, starts the new assignment, preserves one checklist snapshot, and denies the old worker immediately, verifies **AC-4**, **AC-6**.
* Next day replacement: without `applyToToday`, the old worker remains effective today and the new worker starts tomorrow, verifies **AC-4**, **AC-7**.
* Eligibility: internal selection excludes accounts without an active employee and outsource selection excludes accounts linked to an employee, verifies **AC-2**, **AC-11**.
* Automatic revocation: employee and outsource account deactivation end all active assignments, remove the role when appropriate, increment session version through the existing source transaction, and create one audit entry per assignment, verifies **AC-8**, **AC-9**.
* Overlap failure: an assignment that overlaps an existing period returns a conflict and changes nothing, verifies **AC-5**.
* Authorization: a non WIG002 GA account, WIG002 without `ga.manage`, a worker without an effective room assignment, and an inactive account are denied, verifies **AC-1**, **AC-3**, **AC-8**.

## Build plan

1. Extend the cleaning assignment data model with immutable type and WIB period fields, replace the pair upsert constraint with a safe historical representation, preserve existing rows, and add service level tests for period overlap, satisfies **AC-2**, **AC-5**, **AC-11**.
2. Refactor the cleaning service to create and end append only assignments, validate internal and outsource eligibility, synchronize the worker role from effective assignments, and keep the existing checklist behavior unchanged, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-12**.
3. Integrate automatic revocation into employee status and user account deactivation transactions, including safe per assignment audit entries and session invalidation preservation, satisfies **AC-8**, **AC-9**, **AC-11**.
4. Update assignment APIs and validation for worker type, periods, filters, history, eligibility lists, conflict responses, and explicit same day replacement actions, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-10**.
5. Update the WIG002 settings interface with type selection, eligible user lists, confirmation for `applyToToday`, active and historical views, type filters, and replacement actions without changing the core checklist portal, satisfies **AC-1**, **AC-4**, **AC-6**, **AC-10**.
6. Add focused service, API, proxy, and integration regression tests for eligibility, overlap, role synchronization, source status revocation, audit records, same day and next day replacement, and preservation of core cleaning behavior, satisfies **AC-1** through **AC-12**.

## Consequences

**Positive**:

* Internal and outsource operations use one access model while preserving their operational type.
* Petugas changes are auditable and can be repeated without losing history.
* Employee resignation and outsource account deactivation no longer leave stale cleaning access.
* The existing checklist snapshot and shared room workflow remain stable.

**Negative / tradeoffs**:

* The assignment model and source status transactions require a coordinated database and service change.
* Overlap validation is a business invariant enforced in the service and transaction path, not a simple pair unique constraint.
* Historical assignment records will grow over time and the WIG002 page must distinguish active rows from history.
* Automatic revocation can remove access unexpectedly when an employee or account is deactivated, so the source status flow must show a clear result.

**Neutral**:

* Existing accounts remain the source of login identity. This spec does not create outsource accounts.
* This spec does not add vendor master data, schedules, holidays, item overrides, monthly signatures, export, or audit browsing.

## Follow-up

* [ ] Design vendor outsourcing master separately if the system later needs company contracts, service periods, or vendor contacts.
* [ ] Reconcile the existing scope wording about outsource account creation with the chosen boundary that account creation remains in user management.
* [ ] Design the monthly signature flow separately before adding signature eligibility rules to worker access.

## Migration plan

**Strategy**: strangler

**Phases**:

1. Add nullable type and period fields, preserve existing assignment IDs, and run a preflight report. Use the existing `effectiveWibDate` as the legacy start date. Set the legacy end date to `null` for the current active row. Classify the type from the stored account and employee relation only when unambiguous. Stop the migration when duplicate or ambiguous rows are found; do not silently guess.
2. Deploy readers that support the legacy shape and new intervals, then deploy append only assignment writes, serializable overlap validation, source status revocation, and transactional audit. Verify every existing effective worker before enforcing required fields.
3. Enforce required fields and immutable columns, remove the obsolete pair upsert path, reject direct manual `CLEANING_WORKER` grants, and enable the full WIG002 history interface after the preflight report is clear. Preserve migrated row IDs and record the classification result in the migration audit.

**Rollback**: Revert writes to the legacy compatible path while retaining the new fields. Do not delete migrated history. If source status revocation fails, roll back the source transaction and leave the account or employee status unchanged.

**Risks**: Existing rows may have ambiguous effective dates or duplicate historical intent. The backfill must use the current active assignment state and record the migration decision in deployment logs without changing checklist history. Concurrent replacement requests must be serialized by the transaction and conflict safely.

## References

**Project sources**:

* `docs/specs/0001-core-cleaning-loop/index.md`, existing cleaning access and checklist contract
* `docs/scope/scope.md`, Slice 2 intent and Tracer Bullet approach
* `prisma/schema.prisma`, `UserAccount`, `Employee`, and cleaning models
* `src/lib/services/cleaningService.ts`, current assignment and role synchronization
* `src/lib/services/employeeStatusService.ts`, employee status transaction
* `src/lib/services/userService.ts`, account status transaction
* `src/lib/permissions.ts`, current role and permission definitions
* `src/proxy.ts`, portal route guard
* `docs/AGENT_RULES.md`, source priority and security rules

**Practices and standards**:

* Append only history for operational assignments
* Transactional authorization revocation
* Effective dated access control
* Service layer authorization with defense in depth
* Tracer Bullet delivery
