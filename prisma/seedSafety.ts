import type { PrismaClient } from "@prisma/client";

type CountableDb = Pick<PrismaClient, "employee" | "userAccount" | "attendanceRecord">;

/**
 * Pengaman seed destruktif (seed.ts, seedCompanyStructure.ts).
 *
 * Aturan:
 * 1. NODE_ENV=production → selalu ditolak (tanpa kecuali).
 * 2. Database masih kosong (0 karyawan, 0 akun, 0 presensi) → boleh
 *    (alur setup awal: db push lalu db seed).
 * 3. Database sudah berisi data → hanya boleh bila env
 *    ALLOW_DESTRUCTIVE_SEED=1 diset eksplisit.
 *
 * Tujuan: salah ketik `npm run db:seed` tidak lagi menghapus data produksi.
 */
export async function assertSafeToWipe(prisma: CountableDb, label: string): Promise<void> {
    if (process.env.NODE_ENV === "production") {
        throw new Error(
            `REFUSED: ${label} dilarang berjalan di production (NODE_ENV=production). ` +
                "Seed destruktif hanya untuk database lokal/kosong."
        );
    }
    if (process.env.ALLOW_DESTRUCTIVE_SEED === "1") return;

    const [employees, users, attendance] = await Promise.all([
        prisma.employee.count(),
        prisma.userAccount.count(),
        prisma.attendanceRecord.count(),
    ]);
    if (employees + users + attendance > 0) {
        throw new Error(
            `REFUSED: ${label} akan menghapus data (karyawan: ${employees}, akun: ${users}, presensi: ${attendance}). ` +
                "Batalkan bila ini database produksi. " +
                "Untuk database sekali pakai, ulangi dengan ALLOW_DESTRUCTIVE_SEED=1."
        );
    }
}

/** Seed non-wipe (mis. seedDev) tetap dilarang di production. */
export function assertNotProduction(label: string): void {
    if (process.env.NODE_ENV === "production") {
        throw new Error(
            `REFUSED: ${label} dilarang berjalan di production (NODE_ENV=production).`
        );
    }
}
