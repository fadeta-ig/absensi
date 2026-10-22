import { prisma } from "@/lib/prisma";

/**
 * Status baca notifikasi in-app (bell).
 *
 * Notifikasi bersifat derived (diagregasi dari Approve/Reject, invite, task, dst),
 * sehingga "sudah dibaca" disimpan terpisah per (userId, key).
 * Bell hanya menampilkan yang belum dibaca; riwayat tetap terbaca via flag.
 */

const ALLOWED_KEY_PREFIXES = [
    "leave-",
    "overtime-",
    "correction-",
    "news-",
    "letter-",
    "appointment-",
    "appointment-invite-",
    "appointment-today-",
    "appointment-follow-",
    "appointment-declined-",
    "meeting-task-",
    "meeting-task-ext-",
    "meeting-task-new-",
    "absent-",
    "visit-",
] as const;

const MAX_KEY_LENGTH = 191;
const MAX_BATCH = 200;

export function isValidNotificationKey(key: unknown): key is string {
    return (
        typeof key === "string" &&
        key.length > 0 &&
        key.length <= MAX_KEY_LENGTH &&
        ALLOWED_KEY_PREFIXES.some((p) => key.startsWith(p))
    );
}

export async function getReadKeys(userId: string, keys: string[]): Promise<Set<string>> {
    const clean = [...new Set(keys.filter(isValidNotificationKey))].slice(0, MAX_BATCH);
    if (clean.length === 0) return new Set();
    const rows = await prisma.notificationRead.findMany({
        where: { userId, key: { in: clean } },
        select: { key: true },
    });
    return new Set(rows.map((r) => r.key));
}

export async function markNotificationsRead(userId: string, keys: string[]): Promise<{ marked: number }> {
    const clean = [...new Set(keys.filter(isValidNotificationKey))].slice(0, MAX_BATCH);
    if (clean.length === 0) return { marked: 0 };
    const res = await prisma.notificationRead.createMany({
        data: clean.map((key) => ({ userId, key })),
        skipDuplicates: true,
    });
    return { marked: res.count };
}
