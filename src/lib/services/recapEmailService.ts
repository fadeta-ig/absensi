import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { addCalendarDays, toWIBDateString } from "@/lib/timezone";
import { stripGelar } from "@/lib/utils/formatters";
import { webPush } from "@/lib/webPush";
import { EQUIPMENT_TOP_VIEWERS_KEY, getEquipmentApprovers, getEquipmentQcMembers, queryEquipmentRecap } from "@/lib/services/equipmentService";
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
    /** true bila diajukan (submittedAt) pada tanggal rekap tetapi draf dibuat sebelumnya. */
    isSusulan: boolean;
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
    /** Nama penandatangan yang status parafnya TERLAMBAT (sudah termasuk jam di rendering). */
    lateNames: string[];
    /** Item aktif yang ditandai "Tidak Ada di ruangan". */
    unavailableItems: string[];
}

/** Agregat paraf per reviewer untuk satu tanggal: sudah X dari total ruangannya. */
export interface CleaningReviewerStat {
    employeeId: string;
    name: string;
    role: "INSPECTED_BY" | "KNOWN_BY";
    roleLabel: string;
    signed: number;
    total: number;
    missing: number;
}

export interface EquipmentInspectorStat {
    name: string;
    submitted: number;
}

export interface EquipmentChainedStat {
    name: string;
    handled: number;
    total: number;
}

/** Rekap peralatan 1 hari WIB (batas createdAt, pola getEquipmentRecap). */
export async function getDailyEquipmentRecap(wibDate: string) {
    const nextDay = addCalendarDays(wibDate, 1);
    const dayStart = new Date(wibDate + "T00:00:00+07:00");
    const nextStart = new Date(nextDay + "T00:00:00+07:00");
    const data = await queryEquipmentRecap({ from: wibDate, to: nextDay });
    const lines: EquipmentRecapLine[] = data.inspections.map((row) => ({        unitName: row.unit.name,
        starterName: stripGelar(row.startedBy.name),
        status: row.status,
        createdAt: row.createdAt,
        submittedAt: row.submittedAt,
        checkedAt: row.checkedAt,
        checkerName: row.checkedBy ? stripGelar(row.checkedBy.name) : (row.checkedByNameSnapshot ? stripGelar(row.checkedByNameSnapshot) : null),
        approvedAt: row.approvedAt,
        approverName: row.approvedBy ? stripGelar(row.approvedBy.name) : (row.approvedByNameSnapshot ? stripGelar(row.approvedByNameSnapshot) : null),
        isSusulan: false,
    }));
    // Roster penanggung jawab untuk kolom email: semua verifikator pool + approver tunggal.
    // Yang bertindak naik ke #1 + jam; sisanya (-) — agar pemilik tahu penanggung jawab tiap baris.
    const [qcMembers, approvers, submittedToday, checkedToday, approvedToday] = await Promise.all([
        getEquipmentQcMembers().catch(() => []),
        getEquipmentApprovers().catch(() => []),
        prisma.equipmentInspection.findMany({
            where: { submittedAt: { gte: dayStart, lt: nextStart } },
            select: { startedByEmployeeId: true, startedBy: { select: { name: true } } },
        }).catch(() => []),
        prisma.equipmentInspection.findMany({
            where: { checkedAt: { gte: dayStart, lt: nextStart } },
            select: { checkedByEmployeeId: true, checkedByNameSnapshot: true, checkedBy: { select: { name: true } } },
        }).catch(() => []),
        prisma.equipmentInspection.findMany({
            where: { approvedAt: { gte: dayStart, lt: nextStart } },
            select: { approvedByEmployeeId: true, approvedByNameSnapshot: true, approvedBy: { select: { name: true } } },
        }).catch(() => []),
    ]);
    const verifiers = qcMembers.map((m) => stripGelar(m.name ?? m.employeeId)).filter(Boolean);
    // Susulan: diajukan (submittedAt) pada tanggal rekap tetapi draf dibuat
    // sebelumnya — tidak tertangkap filter createdAt di queryEquipmentRecap.
    // Saling lepas dengan lines utama (createdAt < dayStart vs >= dayStart).
    const susulanRows = await prisma.equipmentInspection.findMany({
        where: {
            submittedAt: { gte: dayStart, lt: nextStart },
            createdAt: { lt: dayStart },
            status: { not: "CANCELLED" },
        },
        orderBy: { submittedAt: "desc" },
        include: {
            unit: { select: { id: true, name: true, brand: true, location: true } },
            startedBy: { select: { employeeId: true, name: true } },
            checkedBy: { select: { employeeId: true, name: true } },
            approvedBy: { select: { employeeId: true, name: true } },
        },
    }).catch(() => []);
    const susulanLines: EquipmentRecapLine[] = susulanRows.map((row) => ({
        unitName: row.unit.name,
        starterName: stripGelar(row.startedBy.name),
        status: row.status,
        createdAt: row.createdAt,
        submittedAt: row.submittedAt,
        checkedAt: row.checkedAt,
        checkerName: row.checkedBy ? stripGelar(row.checkedBy.name) : (row.checkedByNameSnapshot ? stripGelar(row.checkedByNameSnapshot) : null),
        approvedAt: row.approvedAt,
        approverName: row.approvedBy ? stripGelar(row.approvedBy.name) : (row.approvedByNameSnapshot ? stripGelar(row.approvedByNameSnapshot) : null),
        isSusulan: true,
    }));
    // Inspektor: cukup angka diajukan hari itu (basis tanggal-tindakan).
    const inspMap = new Map<string, EquipmentInspectorStat>();
    for (const r of submittedToday) {
        const cur = inspMap.get(r.startedByEmployeeId) ?? { name: stripGelar(r.startedBy.name) || r.startedByEmployeeId, submitted: 0 };
        cur.submitted += 1;
        inspMap.set(r.startedByEmployeeId, cur);
    }
    const inspectorStats = [...inspMap.values()].sort((a, b) => b.submitted - a.submitted || a.name.localeCompare(b.name));
    // Rantai pecahan: penyebut = keluaran tahap sebelumnya hari itu.
    // Verifikator X/diajukan, approver X/diverifikasi. Pelaku di luar roster
    // tetap tampil (mis. approver legacy) — roster + aktor digabung.
    function toChainedStats(
        roster: Array<{ employeeId: string; name: string | null }>,
        actions: Array<{ employeeId: string | null; name: string }>,
        denom: number
    ): EquipmentChainedStat[] {
        const counts = new Map<string, { name: string; handled: number }>();
        for (const a of actions) {
            const key = a.employeeId ?? `name:${a.name}`;
            const cur = counts.get(key) ?? { name: a.name, handled: 0 };
            cur.handled += 1;
            counts.set(key, cur);
        }
        const rows: EquipmentChainedStat[] = roster.map((r) => ({
            name: stripGelar(r.name ?? r.employeeId) || r.employeeId,
            handled: counts.get(r.employeeId)?.handled ?? 0,
            total: denom,
        }));
        const rosterIds = new Set(roster.map((r) => r.employeeId));
        for (const [key, v] of counts) {
            if (!key.startsWith("name:") && rosterIds.has(key)) continue;
            rows.push({ name: v.name, handled: v.handled, total: denom });
        }
        return rows.sort((a, b) => b.handled - a.handled || a.name.localeCompare(b.name));
    }
    const verifierStats = toChainedStats(
        qcMembers,
        checkedToday.map((r) => ({
            employeeId: r.checkedByEmployeeId,
            name: stripGelar(r.checkedBy?.name ?? r.checkedByNameSnapshot ?? r.checkedByEmployeeId ?? "-") || "-",
        })),
        submittedToday.length
    );
    const approverStats = toChainedStats(
        approvers,
        approvedToday.map((r) => ({
            employeeId: r.approvedByEmployeeId,
            name: stripGelar(r.approvedBy?.name ?? r.approvedByNameSnapshot ?? r.approvedByEmployeeId ?? "-") || "-",
        })),
        checkedToday.length
    );
    return {
        summary: data.summary,
        lines: [...lines, ...susulanLines],
        verifiers,
        approverNames: approvers.map((m) => stripGelar(m.name ?? m.employeeId)).filter(Boolean),
        inspectorStats,
        verifierStats,
        approverStats,
        verificationQueue: data.summary.submitted,
        approvalQueue: data.summary.done,
    };
}

/** Rekap kebersihan 1 hari WIB per ruangan (read-only, reuse getParafStatus). */
export async function getDailyCleaningRecap(wibDate: string) {
    const rooms = await prisma.cleaningRoom.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
    });
    const lines: CleaningRecapLine[] = [];
    const stats = new Map<string, CleaningReviewerStat>();
    for (const room of rooms) {
        try {
            const st = await getParafStatus(room.id, wibDate);
            // Agregat per reviewer: hanya ruang non-libur yang punya reviewer
            // terpasang (penentu paraf = missingRoles, bukan kehadiran baris).
            if (!st.isFree && st.reviewers) {
                const slots = [
                    { role: "INSPECTED_BY", employeeId: st.reviewers.inspectedByEmployeeId, name: st.reviewers.inspectedByName },
                    { role: "KNOWN_BY", employeeId: st.reviewers.knownByEmployeeId, name: st.reviewers.knownByName },
                ] as const;
                for (const s of slots) {
                    const key = `${s.role}:${s.employeeId}`;
                    let stat = stats.get(key);
                    if (!stat) {
                        stat = {
                            employeeId: s.employeeId,
                            name: stripGelar(s.name) || s.employeeId,
                            role: s.role,
                            roleLabel: s.role === "INSPECTED_BY" ? "Diperiksa" : "Mengetahui",
                            signed: 0,
                            total: 0,
                            missing: 0,
                        };
                        stats.set(key, stat);
                    }
                    stat.total += 1;
                    if (!st.missingRoles.includes(s.role)) stat.signed += 1;
                }
            }
            const doneParafs = (st.parafs ?? [])
                .map((p) => ({ name: stripGelar(p.signerName ?? p.signerEmployeeId ?? ""), signedAt: p.signedAt, terlambat: (p as { status?: string }).status === "TERLAMBAT" }))
                .filter((p) => p.name.length > 0);
            const lateNames = doneParafs.filter((p) => p.terlambat).map((p) => p.name);
            const pendingNames = st.isFree
                ? []
                : (st.missingRoles ?? [])
                    .map((role) => {
                        const raw =
                            role === "INSPECTED_BY"
                                ? (st.reviewers?.inspectedByName ?? "")
                                : (st.reviewers?.knownByName ?? "");
                        return stripGelar(raw);
                    })
                    .filter((n) => n.length > 0);
            // Item aktif yang belum selesai & tidak dikecualikan (untuk kolom "Belum dibersihkan"),
            // plus item "Tidak Ada di ruangan" (untuk kolom sendiri agar tak disangka belum dikerjakan).
            let pendingItems: string[] = [];
            let unavailableItems: string[] = [];
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
                const items = checklist?.items ?? [];
                pendingItems = st.isFree ? [] : items.filter((it) => it.isActive && !it.isComplete && !it.isUnavailable).map((it) => it.itemNameSnapshot);
                unavailableItems = st.isFree ? [] : items.filter((it) => it.isActive && it.isUnavailable).map((it) => it.itemNameSnapshot);
            } catch {
                pendingItems = [];
                unavailableItems = [];
            }
            // Ruang libur bebas paraf: tidak ada yang "kurang" paraf.
            const parafMissing = st.isFree ? 0 : st.missingRoles.length;
            lines.push({
                roomName: st.roomName,
                isFree: st.isFree,
                exists: st.checklist.exists,
                percent: st.checklist.percent,
                complete: st.checklist.isComplete,
                unavailableCount: st.checklist.unavailableCount,
                parafDone: st.parafs.length,
                parafMissing,
                doneParafs: doneParafs.map(({ name, signedAt }) => ({ name, signedAt })),
                pendingNames,
                pendingItems,
                lateNames,
                unavailableItems,
            });
        } catch (err) {
            logger.warn("rekap cleaning per ruangan dilewati", { roomId: room.id, wibDate, err });
        }
    }
    const reviewerStats = [...stats.values()]
        .map((s) => ({ ...s, missing: s.total - s.signed }))
        .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
    return { lines, reviewerStats };
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
        const ok = await sendDailyRecapEmail({ to, wibDate, dateLabel: formatWibDateLabel(wibDate), equipment: { ...equipment.summary, lines: equipment.lines, verifiers: equipment.verifiers, approverNames: equipment.approverNames, inspectorStats: equipment.inspectorStats, verifierStats: equipment.verifierStats, approverStats: equipment.approverStats, verificationQueue: equipment.verificationQueue, approvalQueue: equipment.approvalQueue }, cleaning });
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
