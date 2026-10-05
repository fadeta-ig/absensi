import { prisma } from "@/lib/prisma";
import { CleaningError, monthWibDateRange } from "@/lib/services/cleaningService";
import { isWibDateInWeeklyOffDays } from "@/lib/services/cleaningParafService";
import { getCleaningWeeklyOffDays } from "@/lib/services/appSettingsService";

export interface TopViewerRoomOverview {
    roomId: string;
    roomName: string;
    checklist: { total: number; selesai: number; belum: number; percent: number };
    paraf: {
        tepat: number;
        terlambat: number;
        missing: number;
        lateBySigner: Array<{ employeeId: string; name: string; terlambat: number; tepat: number }>;
    };
    reviewers: {
        inspectedByEmployeeId: string;
        inspectedByName: string;
        knownByEmployeeId: string;
        knownByName: string;
    } | null;
    signatures: {
        inspectedSigned: boolean;
        knownSigned: boolean;
        derivedStatus: "WAITING_FOR_SIGNATURES" | "PARTIALLY_SIGNED" | "COMPLETE";
    } | null;
}

export interface TopViewerOverview {
    monthWib: string;
    rooms: TopViewerRoomOverview[];
}

/**
 * Agregat bulanan sekali panggil untuk atasan tertinggi viewer:
 * checklist per ruangan + paraf TEPAT/TERLAMBAT per peran + reviewer + TTD.
 * Read-only; guard (WIG002 / topViewer / reviewer ruangan) ada di route.
 * Bila reviewerEmployeeId diisi, hanya ruangan yang ditugaskan kepadanya.
 */
export async function getTopViewerOverview(monthWib: string, reviewerEmployeeId?: string | null): Promise<TopViewerOverview> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthWib)) {
        throw new CleaningError("Format bulan tidak valid. Gunakan YYYY-MM.", 400);
    }

    let rooms = await prisma.cleaningRoom.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
    });
    if (reviewerEmployeeId) {
        const assigned = await prisma.cleaningMonthlyApproval.findMany({
            where: {
                monthWib,
                OR: [
                    { inspectedByEmployeeId: reviewerEmployeeId },
                    { knownByEmployeeId: reviewerEmployeeId },
                ],
            },
            select: { roomId: true },
        });
        const allowed = new Set(assigned.map((a) => a.roomId));
        rooms = rooms.filter((room) => allowed.has(room.id));
    }
    if (rooms.length === 0) return { monthWib, rooms: [] };

    const roomIds = rooms.map((room) => room.id);
    const monthRange = monthWibDateRange(monthWib);
    const [checklists, parafs, approvals, holidays, weeklyOffDays] = await Promise.all([
        prisma.cleaningDailyChecklist.findMany({
            where: { roomId: { in: roomIds }, wibDate: { gte: monthRange.gte, lt: monthRange.lt } },
            select: {
                roomId: true,
                wibDate: true,
                items: { select: { isActive: true, isComplete: true } },
            },
        }),
        prisma.cleaningDailyParaf.findMany({
            where: { roomId: { in: roomIds }, wibDate: { gte: monthRange.gte, lt: monthRange.lt } },
            select: {
                roomId: true,
                wibDate: true,
                signerRole: true,
                signerEmployeeId: true,
                signerNameSnapshot: true,
                status: true,
            },
        }),
        prisma.cleaningMonthlyApproval.findMany({
            where: { roomId: { in: roomIds }, monthWib },
            include: {
                inspectedByEmployee: { select: { employeeId: true, name: true } },
                knownByEmployee: { select: { employeeId: true, name: true } },
                signatures: {
                    where: { status: "SIGNED" },
                    select: { role: true },
                },
            },
        }),
        prisma.cleaningHoliday.findMany({
            where: { wibDate: { gte: monthRange.gte, lt: monthRange.lt } },
            select: { wibDate: true },
        }),
        getCleaningWeeklyOffDays().catch(() => [0, 6]),
    ]);
    const holidaySet = new Set(holidays.map((h) => h.wibDate));
    const isFreeDate = (wibDate: string) =>
        holidaySet.has(wibDate) || isWibDateInWeeklyOffDays(wibDate, weeklyOffDays);

    const approvalByRoom = new Map(approvals.map((approval) => [approval.roomId, approval]));

    return {
        monthWib,
        rooms: rooms.map((room) => {
            // Hari libur bukan hari kerja: dikeluarkan dari total agar tidak
            // dihitung sebagai tunggakan paraf.
            const roomLists = checklists.filter((cl) => cl.roomId === room.id && !isFreeDate(cl.wibDate));
            let selesai = 0;
            for (const cl of roomLists) {
                const active = cl.items.filter((item) => item.isActive);
                if (active.length > 0 && active.every((item) => item.isComplete)) selesai += 1;
            }
            const total = roomLists.length;
            const percent = total === 0 ? 0 : Math.round((selesai / total) * 100);

            const roomParafs = parafs.filter((paraf) => paraf.roomId === room.id && !isFreeDate(paraf.wibDate));
            const tepat = roomParafs.filter((paraf) => paraf.status === "TEPAT").length;
            const terlambat = roomParafs.filter((paraf) => paraf.status === "TERLAMBAT").length;
            const lateByMap = new Map<string, { employeeId: string; name: string; terlambat: number; tepat: number }>();
            for (const paraf of roomParafs) {
                const entry = lateByMap.get(paraf.signerEmployeeId) ?? {
                    employeeId: paraf.signerEmployeeId,
                    name: paraf.signerNameSnapshot,
                    terlambat: 0,
                    tepat: 0,
                };
                if (paraf.status === "TERLAMBAT") entry.terlambat += 1;
                else entry.tepat += 1;
                lateByMap.set(paraf.signerEmployeeId, entry);
            }
            const lateBySigner = [...lateByMap.values()]
                .filter((entry) => entry.terlambat > 0)
                .sort((a, b) => b.terlambat - a.terlambat);

            const approval = approvalByRoom.get(room.id) ?? null;
            // Paraf yang diharapkan = 2 peran × checklist SELESAI.
            const missing = Math.max(0, selesai * 2 - roomParafs.length);

            return {
                roomId: room.id,
                roomName: room.name,
                checklist: { total, selesai, belum: total - selesai, percent },
                paraf: { tepat, terlambat, missing, lateBySigner },
                reviewers: approval
                    ? {
                          inspectedByEmployeeId: approval.inspectedByEmployeeId,
                          inspectedByName: approval.inspectedByEmployee.name,
                          knownByEmployeeId: approval.knownByEmployeeId,
                          knownByName: approval.knownByEmployee.name,
                      }
                    : null,
                signatures: approval
                    ? {
                          inspectedSigned: approval.signatures.some((s) => s.role === "INSPECTED_BY"),
                          knownSigned: approval.signatures.some((s) => s.role === "KNOWN_BY"),
                          derivedStatus:
                              approval.signatures.some((s) => s.role === "INSPECTED_BY") &&
                              approval.signatures.some((s) => s.role === "KNOWN_BY")
                                  ? ("COMPLETE" as const)
                                  : approval.signatures.length > 0
                                      ? ("PARTIALLY_SIGNED" as const)
                                      : ("WAITING_FOR_SIGNATURES" as const),
                      }
                    : null,
            };
        }),
    };
}
