# Workflows & Operational Commands — Presensi & HRIS WIG

> **Purpose**: Development, build, test, and deployment procedures.  
> **Source of Truth**: `package.json` scripts, dev environment, and testing tools.  
> **Last Verified**: 2026-09-10  

Dokumen ini memuat panduan langkah demi langkah untuk instalasi, pengembangan lokal, sinkronisasi basis data, testing, build, dan deployment.


---

## 1. Local Development Setup

### Prasyarat Sistem
- **Node.js**: v20.x atau lebih tinggi
- **Database**: MariaDB 10.11+ atau MySQL 8.0+ (dapat menggunakan instalasi lokal, Docker container, atau stack lingkungan seperti Laragon)
- **Package Manager**: `npm`


### Langkah Instalasi Awal
1. **Clone repository dan install dependensi**:
   ```bash
   git clone https://github.com/fadeta-ig/absensi.git
   cd absensi
   npm install
   ```

2. **Konfigurasi Environment**:
   Salin `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
   Pastikan minimal mengisi:
   - `DATABASE_URL`: URI koneksi basis data (contoh: `mysql://root@localhost:3306/hris_local`).
   - `JWT_SECRET`: String acak minimal 16 karakter (disarankan 32+ karakter).

3. **Inisialisasi & Sinkronisasi Skema Basis Data**:
   ```bash
   npm run db:push
   ```

4. **Seeding Data Awal (Master Data & Akun Admin)**:
   ```bash
   npm run db:seed
   ```
   *Catatan: Script ini akan menghasilkan akun admin sistem `WIG001` (Super Admin HR) dan `WIG002` (GA Admin) serta mencetak kata sandi acak sementara di konsol.*

   Untuk environment pengujian lokal/development yang menyertakan data karyawan dummy:
   ```bash
   npm run db:seed:dev
   ```

5. **Menjalankan Server Pengembangan**:
   ```bash
   npm run dev
   ```
   Aplikasi akan berjalan di `http://localhost:3000`.

---

## 2. Important NPM Commands Reference

Berikut daftar perintah yang terkonfigurasi pada `package.json`:

| Perintah | Deskripsi |
|---|---|
| `npm run dev` | Menjalankan server pengembangan Next.js dengan Webpack (`next dev --webpack`) |
| `npm run dev:host` | Menjalankan server dev dengan binding ke `0.0.0.0` agar dapat diakses dari smartphone dalam satu LAN |
| `npm run build` | Melakukan kompilasi bundle produksi Next.js dengan Webpack |
| `npm run start` | Menjalankan server produksi lokal di port 3000 |
| `npm run start:host` | Menjalankan server produksi terikat ke `0.0.0.0` pada port 3000 |
| `npm run lint` | Menjalankan pemeriksaan ESLint 9 |
| `npm run db:push` | Mendorong perubahan skema `prisma/schema.prisma` langsung ke MariaDB |
| `npm run db:seed` | Menjalankan script seed utama `prisma/seed.ts` (master data + akun admin) |
| `npm run db:seed:dev` | Menjalankan seed dev dengan dataset karyawan (`prisma/seedDev.ts`) |
| `npm run db:seed:hr` | Menjalankan seed khusus master data HR (`prisma/seedHR.ts`) |
| `npm run db:seed:ga` | Menjalankan seed khusus master data GA & aset (`prisma/seedGA.ts`) |
| `npm run db:seed:employee`| Menjalankan seed khusus profil karyawan (`prisma/seedEmployee.ts`) |
| `npm run db:seed:dummy50` | Menjalankan seed 50 karyawan dummy realistis untuk pengujian UX (`prisma/seedDummy50.ts`) |
| `npm run db:seed:assets` | Menjalankan seed khusus aset fisik (`prisma/seedAssets.ts`) |
| `npm run db:reset` | Mereset paksa database dan mengeksekusi seed utama (`prisma db push --force-reset && npm run db:seed`) |
| `npm run db:reset:only` | Hanya mereset tabel database tanpa menjalankan seed |
| `npm run db:reset:dev` | Mereset paksa database dan mengeksekusi seed dev (`prisma db push --force-reset && npm run db:seed:dev`) |
| `npm run db:studio` | Membuka antarmuka grafis Prisma Studio pada browser |
| `npm test` | Menjalankan test suite menggunakan Vitest |
| `npm run test:coverage` | Menjalankan test suite dengan laporan coverage kode |

---

## 3. Testing Workflows

1. **Menjalankan Seluruh Test Suite**:
   ```bash
   npm test -- --run
   ```
2. **Menjalankan Test Khusus Service / Unit (Tanpa Kebutuhan Server HTTP)**:
   ```bash
   npx vitest run tests/services/
   ```
3. **Menjalankan Test API Endpoint (`tests/api/`)**:
   > [!IMPORTANT]
   > Test suite di `tests/api/*.test.ts` melakukan panggilan HTTP `fetch` ke `http://localhost:3000/api`. Pastikan server Next.js aktif pada terminal terpisah (`npm run dev` atau `npm start`) sebelum mengeksekusi test API.

---

## 4. Production Build & Deployment Workflow (VPS)

> **Peta port VPS (audit `ss` + `nginx -T`, 2026-10-06):** hris → **3002**
> (nginx `hris.wijayainovasi.co.id` proxy ke `127.0.0.1:3002`), dashboard-infra
> → **3000** (pemilik sah, jangan direbut/dimatikan). Start hris SELALU
> dengan port eksplisit `-p 3002` seperti di bawah. Prinsip: **audit dulu
> (`ss`, nginx, `pm2 show`), eksekusi kemudian** — jangan `kill`, `reset`,
> `seed`, atau `reload` tanpa bukti.

1. **Audit pra-deploy (read-only, di VPS):**
   ```bash
   cd /var/www/hris
   git status --short
   git log -1 --oneline
   pm2 list
   ss -ltnp | grep -E "next-server|node"
   grep -rn "proxy_pass" /etc/nginx/sites-enabled/ | head -n 20
   sudo nginx -t
   ```
   Pastikan tree bersih, tahu app apa di port berapa, dan vhost nginx
   mengarah ke mana. Port 3002 harus kosong (atau ditempati hris sendiri
   yang memang mau di-restart).

2. **Backup (wajib):**
   ```bash
   mysqldump -u root -p hris_db > ~/backups/hris/hris_db-$(date +%F_%H%M).sql
   cp .env .env.bak-$(date +%F)
   ```

3. **Tarik kode + dependensi + cek:**
   ```bash
   git pull
   npm ci
   npm run lint
   npx tsc --noEmit
   ```

4. **Skema database (preview dulu, tanpa `--force-reset` selamanya):**
   ```bash
   npx prisma validate
   export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env | sed -e 's/^"//' -e 's/"$//' -e 's/\r$//')"
   npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > /tmp/db-diff.sql
   cat /tmp/db-diff.sql
   ```
   Catatan `.env` berquote: nilai terbungkus `"..."`, jadi export mentah
   menghasilkan URL invalid (P1013). Selalu strip kutip seperti di atas.
   Lanjut `db:push` HANYA bila diff aditif (`ADD COLUMN NULL`,
   `CREATE TABLE/INDEX`, `ALTER ... DEFAULT`). Bila ada `DROP`, hentikan.
   ```bash
   npm run db:push
   npx prisma generate
   ```
   Bila `db:push` memberi peringatan data-loss, jawab `N` dulu lalu
   verifikasi read-only (contoh: `SELECT DISTINCT` kolom yang di-cast; cek
   duplikat via `GROUP BY ... HAVING COUNT(*)>1`). Baru ulangi dan jawab `y`.

5. **Build + start + verifikasi:**
   ```bash
   npm run build
   pm2 delete hris
   pm2 start ./node_modules/next/dist/bin/next --name hris --max-memory-restart 1G -- start -H 127.0.0.1 -p 3002
   pm2 save
   sleep 8
   curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002
   pm2 logs hris --lines 10 --nostream
   ```
   Pakai `restart`/`delete+start` (bukan `reload`: mode fork + wrapper `npm`
   rawan race EADDRINUSE). Bila `EADDRINUSE`: JANGAN kill membabi buta —
   identifikasi penghuni (`ss -ltnp`, `ps -o pid,ppid,cmd -p <pid>`,
   `readlink /proc/<pid>/cwd`, cocokkan `proxy_pass` nginx). Hanya sentuh
   proses yang terbukti sisa hris sendiri.
   Smoke test: login + 1 presensi + buka halaman fitur yang di-deploy.

6. **Konfigurasi Auto-Start saat VPS Reboot:**
   ```bash
   pm2 startup
   # Jalankan perintah 'sudo env PATH=...' yang direkomendasikan di terminal
   pm2 save
   ```

7. **Larangan production:**
   `db:seed*`, `db:reset*`, `migrate reset/dev`, `db push --force-reset` /
   `--accept-data-loss`, `ALLOW_DESTRUCTIVE_SEED=1`, update mayor
   Prisma/Next tanpa panduan resmi, `kill [-9]` tanpa audit, `pm2 reload`
   untuk app ini, commit `.env`/`*.sql`/`storage`/`logs`.

