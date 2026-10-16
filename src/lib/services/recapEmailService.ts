import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { toWIBDateString } from "@/lib/timezone";
import { stripGelar } from "@/lib/utils/formatters";
import { webPush } from "@/lib/webPush";
import { EQUIPMENT_TOP_VIEWERS_KEY, getEquipmentApprover, getEquipmentQcMembers, queryEquipmentRecap } from "@/lib/services/equipmentService";
import { getCleaningTopViewerEmployeeIds } from "@/lib/services/appSettingsService";
import { getParafStatus } from "@/lib/services/cleaningParafService";
import { sendDailyRecapEmail } from "@/lib/services/emailService";

export const IT_TEST_EMAIL = "it.wijayainovasigemilang@gmail.com" as const;

function formatWibDateLabel(wibDate: string): string {
    try {
        return new Date(wibDate + "T00:00:00+07:00").toLocaleDateString("id-ID", {
            timeZone: "Asia/Jakarta",
            weekday: "long",
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    } catch {
        return wibDate;
    }
}

export interface RecapRecipient {
    employeeId: string;
    name: string;
    email: string;
}

export interface MissingRecipient {
    employeeId: string;
    name: string | null;
}

function parseIdList(value: string | null | undefined): string[] {
    if (!value) return [];
    try {
        const parsed: unknown = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return [...new Set(parsed.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))];
    } catch {
        return [];
    }
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Resolve email Top Reviewer (equipment + cleaning, union dedup).
 * Hanya yang aktif + email terisi yang dikirimi; sisanya dilaporkan (tanpa error).
 */
export async function resolveTopViewerEmails(): Promise<{ to: RecapRecipient[]; missing: MissingRecipient[] }> {
    const today = toWIBDateString();
    const todayDate = new Date(today + "T00:00:00+07:00");
    const [eqRow, clIds] = await Promise.all([
        prisma.appSetting.findUnique({ where: { key: EQUIPMENT_TOP_VIEWERS_KEY } }),
        getCleaningTopViewerEmployeeIds().catch(() => [] as string[]),
    ]);
    const ids = [...new Set([...parseIdList(eqRow?.value), ...clIds])];
    if (ids.length === 0) return { to: [], missing: [] };
    const employees = (await prisma.employee.findMany({
        where: { employeeId: { in: ids } },
        select: {
            employeeId: true,
            name: true,
            email: true,
            isActive: true,
            employmentStartDate: true,
            employmentEndDate: true,
            userAccount: { select: { email: true, isActive: true } },
        },
    }).catch(() => [])) ?? [];
    const byId = new Map(employees.map((e) => [e.employeeId, e]));
    const to: RecapRecipient[] = [];
    const missing: MissingRecipient[] = [];
    for (const id of ids) {
        const emp = byId.get(id);
        const active =
            !!emp &&
            emp.isActive === true &&
            emp.userAccount?.isActive === true &&
            (emp.employmentStartDate === null || emp.employmentStartDate <= todayDate) &&
            (emp.employmentEndDate === null || emp.employmentEndDate >= todayDate);
        const email = (emp?.email?.trim() || emp?.userAccount?.email?.trim() || "").toLowerCase();
        if (active && isValidEmail(email)) {
            to.push({ employeeId: id, name: emp?.name ?? id, email });
        } else {
            missing.push({ employeeId: id, name: emp?.name ?? null });
        }
    }
    return { to, missing };
}

export interface EquipmentRecapLine {
    unitName: string;
    starterName: string;
    status: string;
    createdAt: Date;
    submittedAt: Date | null;
    checkedAt: Date | null;
    checkerName: string | null;
    approvedAt: Date | null;
    approverName: string | null;
}

export interface CleaningRecapLine {
    roomName: string;
    isFree: boolean;
    exists: boolean;
    percent: number;
    complete: boolean;
    unavailableCount: number;
    parafDone: number;
    parafMissing: number;
    doneParafs: { name: string; signedAt: Date }[];
    pendingNames: string[];
    pendingItems: string[];
}

/** Rekap peralatan 1 hari WIB (batas createdAt, pola getEquipmentRecap). */
export async function getDailyEquipmentRecap(wibDate: string) {
    const next = new Date(wibDate + "T00:00:00+07:00");
    next.setDate(next.getDate() + 1);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, "0");
    const dd = String(next.getDate()).padStart(2, "0");
    const data = await queryEquipmentRecap({ from: wibDate, to: `${yyyy}-${mm}-${dd}` });
    const lines: EquipmentRecapLine[] = data.inspections.map((row) => ({        unitName: row.unit.name,
        starterName: stripGelar(row.startedBy.name),
        status: row.status,
        createdAt: row.createdAt,
        submittedAt: row.submittedAt,
        checkedAt: row.checkedAt,
        checkerName: row.checkedBy ? stripGelar(row.checkedBy.name) : (row.checkedByNameSnapshot ? stripGelar(row.checkedByNameSnapshot) : null),
        approvedAt: row.approvedAt,
        approverName: row.approvedBy ? stripGelar(row.approvedBy.name) : (row.approvedByNameSnapshot ? stripGelar(row.approvedByNameSnapshot) : null),
    }));
    // Roster penanggung jawab untuk kolom email: semua verifikator pool + approver tunggal.
    // Yang bertindak naik ke #1 + jam; sisanya (-) — agar pemilik tahu penanggung jawab tiap baris.
    const [qcMembers, approver] = await Promise.all([
        getEquipmentQcMembers().catch(() => []),
        getEquipmentApprover().catch(() => null),
    ]);
    const verifiers = qcMembers.map((m) => stripGelar(m.name ?? m.employeeId)).filter(Boolean);
    return { summary: data.summary, lines, verifiers, approverName: approver ? stripGelar(approver.name ?? approver.employeeId) : null };
}

/** Rekap kebersihan 1 hari WIB per ruangan (read-only, reuse getParafStatus). */
export async function getDailyCleaningRecap(wibDate: string) {
    const rooms = await prisma.cleaningRoom.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
    });
    const lines: CleaningRecapLine[] = [];
    for (const room of rooms) {
        try {
            const st = await getParafStatus(room.id, wibDate);
            const doneParafs = (st.parafs ?? [])
                .map((p) => ({ name: stripGelar(p.signerName ?? p.signerEmployeeId ?? ""), signedAt: p.signedAt }))
                .filter((p) => p.name.length > 0);
            const pendingNames = (st.missingRoles ?? [])
                .map((role) => {
                    const raw =
                        role === "INSPECTED_BY"
                            ? (st.reviewers?.inspectedByName ?? "")
                            : (st.reviewers?.knownByName ?? "");
                    return stripGelar(raw);
                })
                .filter((n) => n.length > 0);
            // Item aktif yang belum selesai & tidak dikecualikan (untuk kolom "Belum dibersihkan").
            let pendingItems: string[] = [];
            try {
                const checklist = await prisma.cleaningDailyChecklist.findUnique({
                    where: { roomId_wibDate: { roomId: room.id, wibDate } },
                    select: {
                        items: {
                            select: { itemNameSnapshot: true, sortOrder: true, isActive: true, isComplete: true, isUnavailable: true },
                            orderBy: { sortOrder: "asc" },
                        },
                    },
                });
                pendingItems = (checklist?.items ?? [])
                    .filter((it) => it.isActive && !it.isComplete && !it.isUnavailable)
                    .map((it) => it.itemNameSnapshot);
            } catch {
                pendingItems = [];
            }
            lines.push({
                roomName: st.roomName,
                isFree: st.isFree,
                exists: st.checklist.exists,
                percent: st.checklist.percent,
                complete: st.checklist.isComplete,
                unavailableCount: st.checklist.unavailableCount,
                parafDone: st.parafs.length,
                parafMissing: st.missingRoles.length,
                doneParafs,
                pendingNames,
                pendingItems,
            });
        } catch (err) {
            logger.warn("rekap cleaning per ruangan dilewati", { roomId: room.id, wibDate, err });
        }
    }
    return { lines };
}

/** Notifikasi in-app via push ke akun WIG002 (best-effort, tak pernah melempar). */
async function notifyWig002Missing(missing: MissingRecipient[], wibDate: string): Promise<void> {
    try {
        if (missing.length === 0) return;
        const users = await prisma.userAccount.findMany({
            where: { username: "WIG002", isActive: true },
            select: { id: true },
        });
        if (users.length === 0) return;
        const subs = await prisma.pushSubscription.findMany({
            where: { userId: { in: users.map((u) => u.id) } },
        });
        if (subs.length === 0) {
            logger.warn("rekap: topviewer tanpa email, WIG002 tanpa push subscription", {
                missing: missing.map((m) => m.employeeId),
                wibDate,
            });
            return;
        }
        const body = JSON.stringify({
            title: "Rekap harian: email atasan belum lengkap",
            body: `${missing.map((m) => m.name ?? m.employeeId).join(", ")} belum punya email HR — rekap ${wibDate} tidak terkirim ke mereka.`,
            icon: "/icons/android-chrome-192x192.png",
            badge: "/icons/android-chrome-192x192.png",
            tag: `recap-missing-${wibDate}`,
            url: "/ga/equipment/settings",
        });
        for (const sub of subs) {
            try {
                await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
            } catch (err) {
                logger.warn("push missing-email ke WIG002 gagal", { err });
            }
        }
    } catch (err) {
        logger.warn("notifikasi missing-email dilewati", { err });
    }
}

export interface DailyRecapResult {
    wibDate: string;
    sent: boolean;
    skipped?: boolean;
    to: string[];
    missing: MissingRecipient[];
    equipmentTotal: number;
    cleaningTotal: number;
}

/**
 * Jalankan rekap harian: kumpulkan alat + kebersihan, kirim ke Top Reviewer SAJA.
 * Exactly-once per tanggal via daily_recap_email_logs (P2002 = sudah terkirim).
 * `toOverride` HANYA untuk testing ke email IT — jangan isi email employee asli.
 */
export async function runDailyRecap(
    wibDate: string,
    opts?: { toOverride?: string[] }
): Promise<DailyRecapResult> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wibDate)) throw new Error("Tanggal tidak valid (YYYY-MM-DD).");
    try {
        await prisma.dailyRecapEmailLog.create({
            data: { wibDate, status: "PENDING", detail: "dimulai" },
        });
    } catch (err) {
        if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
            logger.warn("rekap harian duplikat, dilewati", { wibDate });
            return { wibDate, sent: false, skipped: true, to: [], missing: [], equipmentTotal: 0, cleaningTotal: 0 };
        }
        throw err;
    }

    try {
        const [equipment, cleaning, resolved] = await Promise.all([
            getDailyEquipmentRecap(wibDate),
            getDailyCleaningRecap(wibDate),
            resolveTopViewerEmails(),
        ]);
        const to = (opts?.toOverride ?? resolved.to.map((r) => r.email)).filter(isValidEmail);
        const missing = opts?.toOverride ? [] : resolved.missing;
        if (to.length === 0) {
            await prisma.dailyRecapEmailLog.update({
                where: { wibDate },
                data: { status: "SKIPPED", detail: "tidak ada penerima aktif beremail" },
            });
            await notifyWig002Missing(missing, wibDate);
            return { wibDate, sent: false, skipped: true, to, missing, equipmentTotal: equipment.lines.length, cleaningTotal: cleaning.lines.length };
        }
        const ok = await sendDailyRecapEmail({ to, wibDate, dateLabel: formatWibDateLabel(wibDate), equipment: { ...equipment.summary, lines: equipment.lines, verifiers: equipment.verifiers, approverName: equipment.approverName }, cleaning });
        await prisma.dailyRecapEmailLog.update({
            where: { wibDate },
            data: {
                status: ok ? "SENT" : "FAILED",
                detail: `to=${to.length}, missing=${missing.map((m) => m.employeeId).join(",") || "-"}, alat=${equipment.lines.length}, bersih=${cleaning.lines.length}`,
            },
        });
        await notifyWig002Missing(missing, wibDate);
        return { wibDate, sent: ok, to, missing, equipmentTotal: equipment.lines.length, cleaningTotal: cleaning.lines.length };
    } catch (err) {
        await prisma.dailyRecapEmailLog
            .update({ where: { wibDate }, data: { status: "FAILED", detail: err instanceof Error ? err.message.slice(0, 500) : "gagal" } })
            .catch(() => undefined);
        throw err;
    }
}
