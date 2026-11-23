import { AnonymousShareStatus, Prisma, StressmeterTopic } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
    addCalendarDays,
    isValidCalendarDate,
    toUTCDateKey,
    toWIBDateString,
} from "@/lib/timezone";
import {
    STRESSMETER_SETTING_KEY,
    getWibTimePeriodLabel,
    type AnonymousShareStatusValue,
    type StressmeterTopicValue,
} from "@/lib/stressmeterConstants";

function formatDateKey(date: Date): string {
    const year = String(date.getUTCFullYear()).padStart(4, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function roundOneDecimal(value: number): number {
    return Math.round(value * 10) / 10;
}

function resolveDateRange(from?: string | null, to?: string | null): {
    from: string;
    to: string;
} {
    const todayWib = toWIBDateString();
    const resolvedTo = to && isValidCalendarDate(to) ? to : todayWib;
    const defaultFrom = addCalendarDays(resolvedTo, -29);
    const resolvedFrom = from && isValidCalendarDate(from) ? from : defaultFrom;
    if (resolvedFrom > resolvedTo) {
        return { from: resolvedTo, to: resolvedFrom };
    }
    return { from: resolvedFrom, to: resolvedTo };
}

// ─── Feature Toggle Setting (AppSetting) ─────────────────────────

export async function isStressmeterEnabled(): Promise<boolean> {
    const row = await prisma.appSetting.findUnique({
        where: { key: STRESSMETER_SETTING_KEY },
        select: { value: true },
    });
    if (!row) return true;
    return row.value !== "false";
}

export async function setStressmeterEnabled(
    enabled: boolean,
    actorUserId: string
): Promise<{ enabled: boolean }> {
    await prisma.appSetting.upsert({
        where: { key: STRESSMETER_SETTING_KEY },
        update: {
            value: enabled ? "true" : "false",
            updatedByUserId: actorUserId,
        },
        create: {
            key: STRESSMETER_SETTING_KEY,
            value: enabled ? "true" : "false",
            updatedByUserId: actorUserId,
        },
    });
    return { enabled };
}

// ─── Employee Portal Operations ──────────────────────────────────

export async function getEmployeeTodayCheckinStatus(
    employeeId: string,
    shiftDateInput?: string | null
) {
    const shiftDate =
        shiftDateInput && isValidCalendarDate(shiftDateInput)
            ? shiftDateInput
            : toWIBDateString();
    const shiftDateKey = toUTCDateKey(shiftDate);

    const [enabled, attendance, existing] = await Promise.all([
        isStressmeterEnabled(),
        prisma.attendanceRecord.findUnique({
            where: {
                employeeId_date: {
                    employeeId,
                    date: shiftDateKey,
                },
            },
            select: { clockIn: true },
        }),
        prisma.stressmeterCheckin.findUnique({
            where: {
                employeeId_shiftDate: {
                    employeeId,
                    shiftDate: shiftDateKey,
                },
            },
            select: {
                id: true,
                rating: true,
                skipped: true,
            },
        }),
    ]);

    const hasClockedIn = Boolean(attendance?.clockIn);
    const hasSubmitted = Boolean(existing);
    const shouldPrompt = enabled && hasClockedIn && !hasSubmitted;

    return {
        enabled,
        shiftDate,
        hasClockedIn,
        hasSubmitted,
        shouldPrompt,
        timePeriodLabel: getWibTimePeriodLabel(),
        checkin: existing
            ? {
                  id: existing.id,
                  shiftDate,
                  rating: existing.rating,
                  skipped: existing.skipped,
              }
            : null,
    };
}

export async function submitEmployeeCheckin(
    employeeId: string,
    input: {
        shiftDate: string;
        skipped: boolean;
        rating?: number | null;
    }
) {
    if (!isValidCalendarDate(input.shiftDate)) {
        throw new Error("Tanggal shift tidak valid.");
    }
    const shiftDateKey = toUTCDateKey(input.shiftDate);

    const existing = await prisma.stressmeterCheckin.findUnique({
        where: {
            employeeId_shiftDate: {
                employeeId,
                shiftDate: shiftDateKey,
            },
        },
        select: {
            id: true,
            rating: true,
            skipped: true,
        },
    });

    if (existing) {
        return {
            alreadySubmitted: true,
            checkin: {
                id: existing.id,
                shiftDate: input.shiftDate,
                rating: existing.rating,
                skipped: existing.skipped,
            },
        };
    }

    const ratingValue = input.skipped ? null : (input.rating ?? null);

    try {
        const created = await prisma.stressmeterCheckin.create({
            data: {
                employeeId,
                shiftDate: shiftDateKey,
                rating: ratingValue,
                skipped: input.skipped,
            },
            select: {
                id: true,
                rating: true,
                skipped: true,
            },
        });

        return {
            alreadySubmitted: false,
            checkin: {
                id: created.id,
                shiftDate: input.shiftDate,
                rating: created.rating,
                skipped: created.skipped,
            },
        };
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const raceExisting = await prisma.stressmeterCheckin.findUnique({
                where: {
                    employeeId_shiftDate: {
                        employeeId,
                        shiftDate: shiftDateKey,
                    },
                },
                select: {
                    id: true,
                    rating: true,
                    skipped: true,
                },
            });
            if (raceExisting) {
                return {
                    alreadySubmitted: true,
                    checkin: {
                        id: raceExisting.id,
                        shiftDate: input.shiftDate,
                        rating: raceExisting.rating,
                        skipped: raceExisting.skipped,
                    },
                };
            }
        }
        throw error;
    }
}

/**
 * Menyimpan curhat anonim tanpa parameter employeeId/userId/checkinId sama sekali
 * sehingga anonimitas terjaga secara struktural di level database.
 */
export async function submitAnonymousShare(input: {
    topic?: StressmeterTopicValue;
    message: string;
}) {
    const submittedWibDate = toWIBDateString();
    const created = await prisma.stressmeterAnonymousShare.create({
        data: {
            submittedWibDate,
            topic: (input.topic ?? "OTHER") as StressmeterTopic,
            message: input.message.trim(),
            status: AnonymousShareStatus.NEW,
        },
        select: {
            id: true,
            submittedWibDate: true,
            topic: true,
        },
    });

    return created;
}

// ─── HR Dashboard Operations ─────────────────────────────────────

export interface HrStressmeterOverviewParams {
    from?: string | null;
    to?: string | null;
    departmentId?: string | null;
    ratingFilter?: string | null;
    search?: string | null;
    page?: number;
    limit?: number;
}

export async function getHrStressmeterOverview(params: HrStressmeterOverviewParams) {
    const { from, to } = resolveDateRange(params.from, params.to);
    const fromDateKey = toUTCDateKey(from);
    const toDateKey = toUTCDateKey(to);
    const departmentId = params.departmentId?.trim() || undefined;
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(5, params.limit ?? 20));

    const todayWib = toWIBDateString();
    const attentionFromDateKey = toUTCDateKey(addCalendarDays(todayWib, -13));
    const attentionToDateKey = toUTCDateKey(todayWib);

    const checkinWhere: Prisma.StressmeterCheckinWhereInput = {
        shiftDate: {
            gte: fromDateKey,
            lte: toDateKey,
        },
        ...(departmentId ? { employee: { departmentId } } : {}),
    };

    const attendanceWhere: Prisma.AttendanceRecordWhereInput = {
        date: {
            gte: fromDateKey,
            lte: toDateKey,
        },
        clockIn: { not: null },
        ...(departmentId ? { employee: { departmentId } } : {}),
    };

    const attentionWhere: Prisma.StressmeterCheckinWhereInput = {
        shiftDate: {
            gte: attentionFromDateKey,
            lte: attentionToDateKey,
        },
        skipped: false,
        rating: { not: null },
        ...(departmentId ? { employee: { departmentId } } : {}),
    };

    const [enabled, checkins, totalClockIns, recent14dCheckins, newAnonymousShares, departments] =
        await Promise.all([
            isStressmeterEnabled(),
            prisma.stressmeterCheckin.findMany({
                where: checkinWhere,
                orderBy: [{ shiftDate: "desc" }, { createdAt: "desc" }],
                select: {
                    id: true,
                    employeeId: true,
                    shiftDate: true,
                    rating: true,
                    skipped: true,
                    employee: {
                        select: {
                            name: true,
                            departmentId: true,
                            departmentRel: { select: { name: true } },
                        },
                    },
                },
            }),
            prisma.attendanceRecord.count({ where: attendanceWhere }),
            prisma.stressmeterCheckin.findMany({
                where: attentionWhere,
                orderBy: { shiftDate: "desc" },
                select: {
                    employeeId: true,
                    shiftDate: true,
                    rating: true,
                    employee: {
                        select: {
                            name: true,
                            departmentRel: { select: { name: true } },
                        },
                    },
                },
            }),
            prisma.stressmeterAnonymousShare.count({
                where: { status: AnonymousShareStatus.NEW },
            }),
            prisma.department.findMany({
                orderBy: { name: "asc" },
                select: { id: true, name: true },
            }),
        ]);

    // 1. KPI & Distribusi
    const ratedCheckins = checkins.filter((c) => !c.skipped && typeof c.rating === "number");
    const totalRated = ratedCheckins.length;
    const totalSkipped = checkins.length - totalRated;
    const ratingSum = ratedCheckins.reduce((sum, c) => sum + (c.rating ?? 0), 0);
    const averageRating = totalRated > 0 ? roundOneDecimal(ratingSum / totalRated) : null;
    const lowMoodCount = ratedCheckins.filter((c) => (c.rating ?? 5) <= 2).length;
    const participationRate =
        totalClockIns > 0
            ? Math.min(100, roundOneDecimal((totalRated / totalClockIns) * 100))
            : 0;

    const countsByRating: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const c of ratedCheckins) {
        if (c.rating && c.rating >= 1 && c.rating <= 5) {
            countsByRating[c.rating] += 1;
        }
    }

    const distribution = ([5, 4, 3, 2, 1] as const).map((star) => ({
        rating: star,
        count: countsByRating[star],
        percentage: totalRated > 0 ? roundOneDecimal((countsByRating[star] / totalRated) * 100) : 0,
    }));

    // 2. Tren Harian
    const dailyMap = new Map<
        string,
        { sum: number; ratedCount: number; lowCount: number; skippedCount: number }
    >();
    for (const c of checkins) {
        const key = formatDateKey(c.shiftDate);
        const cur = dailyMap.get(key) ?? { sum: 0, ratedCount: 0, lowCount: 0, skippedCount: 0 };
        if (c.skipped || c.rating === null) {
            cur.skippedCount += 1;
        } else {
            cur.sum += c.rating;
            cur.ratedCount += 1;
            if (c.rating <= 2) cur.lowCount += 1;
        }
        dailyMap.set(key, cur);
    }

    const dailyTrend = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, agg]) => ({
            date,
            averageRating: agg.ratedCount > 0 ? roundOneDecimal(agg.sum / agg.ratedCount) : null,
            ratedCount: agg.ratedCount,
            lowCount: agg.lowCount,
            skippedCount: agg.skippedCount,
        }));

    // 3. Per Departemen
    const deptMap = new Map<
        string,
        {
            departmentId: string;
            departmentName: string;
            sum: number;
            ratedCount: number;
            lowCount: number;
            skippedCount: number;
        }
    >();
    for (const c of checkins) {
        const dId = c.employee.departmentId;
        const dName = c.employee.departmentRel?.name ?? "Tanpa Departemen";
        const cur = deptMap.get(dId) ?? {
            departmentId: dId,
            departmentName: dName,
            sum: 0,
            ratedCount: 0,
            lowCount: 0,
            skippedCount: 0,
        };
        if (c.skipped || c.rating === null) {
            cur.skippedCount += 1;
        } else {
            cur.sum += c.rating;
            cur.ratedCount += 1;
            if (c.rating <= 2) cur.lowCount += 1;
        }
        deptMap.set(dId, cur);
    }

    const departmentBreakdown = Array.from(deptMap.values())
        .map((d) => ({
            departmentId: d.departmentId,
            departmentName: d.departmentName,
            averageRating: d.ratedCount > 0 ? roundOneDecimal(d.sum / d.ratedCount) : null,
            ratedCount: d.ratedCount,
            lowCount: d.lowCount,
            skippedCount: d.skippedCount,
        }))
        .sort((a, b) => {
            if (a.averageRating === null && b.averageRating === null) {
                return a.departmentName.localeCompare(b.departmentName, "id");
            }
            if (a.averageRating === null) return 1;
            if (b.averageRating === null) return -1;
            return a.averageRating - b.averageRating;
        });

    // 4. Deteksi Dini (14 hari terakhir: skor rendah 1–2 berulang >= 2 kali)
    const attentionMap = new Map<
        string,
        {
            employeeId: string;
            employeeName: string;
            departmentName: string;
            lowCount: number;
            totalCount: number;
            sum: number;
            latestRating: number;
            latestShiftDate: string;
        }
    >();
    for (const c of recent14dCheckins) {
        if (c.rating === null) continue;
        const dateStr = formatDateKey(c.shiftDate);
        const cur = attentionMap.get(c.employeeId);
        if (!cur) {
            attentionMap.set(c.employeeId, {
                employeeId: c.employeeId,
                employeeName: c.employee.name,
                departmentName: c.employee.departmentRel?.name ?? "-",
                lowCount: c.rating <= 2 ? 1 : 0,
                totalCount: 1,
                sum: c.rating,
                latestRating: c.rating,
                latestShiftDate: dateStr,
            });
        } else {
            cur.totalCount += 1;
            cur.sum += c.rating;
            if (c.rating <= 2) cur.lowCount += 1;
            if (dateStr > cur.latestShiftDate) {
                cur.latestShiftDate = dateStr;
                cur.latestRating = c.rating;
            }
        }
    }

    const attentionList = Array.from(attentionMap.values())
        .map((item) => ({
            employeeId: item.employeeId,
            employeeName: item.employeeName,
            departmentName: item.departmentName,
            lowCount: item.lowCount,
            totalCount: item.totalCount,
            averageRating: roundOneDecimal(item.sum / item.totalCount),
            latestRating: item.latestRating,
            latestShiftDate: item.latestShiftDate,
        }))
        .filter((item) => item.lowCount >= 2 || (item.lowCount >= 1 && item.latestRating === 1))
        .sort((a, b) => {
            if (b.lowCount !== a.lowCount) return b.lowCount - a.lowCount;
            return a.averageRating - b.averageRating;
        });

    // 5. Log Respons Karyawan (filtered + paginated)
    const searchQuery = params.search?.trim().toLowerCase() ?? "";
    const ratingFilter = params.ratingFilter?.trim().toUpperCase() || "ALL";

    const filteredLogs = checkins.filter((c) => {
        if (ratingFilter === "SKIPPED") {
            if (!c.skipped) return false;
        } else if (ratingFilter === "LOW") {
            if (c.skipped || c.rating === null || c.rating > 2) return false;
        } else if (/^[1-5]$/.test(ratingFilter)) {
            if (c.skipped || c.rating !== Number(ratingFilter)) return false;
        }

        if (searchQuery) {
            const hay = `${c.employee.name} ${c.employeeId} ${c.employee.departmentRel?.name ?? ""}`.toLowerCase();
            if (!hay.includes(searchQuery)) return false;
        }
        return true;
    });

    const totalLogs = filteredLogs.length;
    const totalPages = Math.max(1, Math.ceil(totalLogs / limit));
    const safePage = Math.min(page, totalPages);
    const startIdx = (safePage - 1) * limit;
    const logs = filteredLogs.slice(startIdx, startIdx + limit).map((c) => ({
        id: c.id,
        employeeId: c.employeeId,
        employeeName: c.employee.name,
        departmentName: c.employee.departmentRel?.name ?? "-",
        shiftDate: formatDateKey(c.shiftDate),
        rating: c.rating,
        skipped: c.skipped,
    }));

    return {
        enabled,
        range: { from, to },
        kpi: {
            averageRating,
            totalRated,
            totalSkipped,
            totalClockIns,
            participationRate,
            lowMoodCount,
            newAnonymousShares,
        },
        distribution,
        dailyTrend,
        departmentBreakdown,
        attentionList,
        logs,
        pagination: {
            page: safePage,
            limit,
            total: totalLogs,
            totalPages,
        },
        departments,
    };
}

export interface HrAnonymousSharesParams {
    status?: string | null;
    topic?: string | null;
    from?: string | null;
    to?: string | null;
    page?: number;
    limit?: number;
}

const VALID_STATUSES = new Set<string>(["NEW", "READ", "FOLLOWED_UP"]);
const VALID_TOPICS = new Set<string>([
    "WORKLOAD",
    "TEAM_LEADERSHIP",
    "FACILITIES",
    "PERSONAL",
    "OTHER",
]);

export async function getHrAnonymousShares(params: HrAnonymousSharesParams) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(5, params.limit ?? 15));

    const dateFilter: Prisma.StringFilter = {};
    if (params.from && isValidCalendarDate(params.from)) {
        dateFilter.gte = params.from;
    }
    if (params.to && isValidCalendarDate(params.to)) {
        dateFilter.lte = params.to;
    }
    const hasDateFilter = Boolean(dateFilter.gte || dateFilter.lte);

    const baseWhere: Prisma.StressmeterAnonymousShareWhereInput = {
        ...(hasDateFilter ? { submittedWibDate: dateFilter } : {}),
        ...(params.topic && VALID_TOPICS.has(params.topic)
            ? { topic: params.topic as StressmeterTopic }
            : {}),
    };

    const listWhere: Prisma.StressmeterAnonymousShareWhereInput = {
        ...baseWhere,
        ...(params.status && VALID_STATUSES.has(params.status)
            ? { status: params.status as AnonymousShareStatus }
            : {}),
    };

    const [total, items, groupedStatuses] = await Promise.all([
        prisma.stressmeterAnonymousShare.count({ where: listWhere }),
        prisma.stressmeterAnonymousShare.findMany({
            where: listWhere,
            // Urutkan berdasarkan tanggal WIB + UUID acak (bukan createdAt) agar urutan jam tidak bocor
            orderBy: [{ submittedWibDate: "desc" }, { id: "desc" }],
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                submittedWibDate: true,
                topic: true,
                message: true,
                status: true,
                hrNote: true,
                reviewedAt: true,
            },
        }),
        prisma.stressmeterAnonymousShare.groupBy({
            by: ["status"],
            where: baseWhere,
            _count: { _all: true },
        }),
    ]);

    const counts: Record<"ALL" | AnonymousShareStatusValue, number> = {
        ALL: 0,
        NEW: 0,
        READ: 0,
        FOLLOWED_UP: 0,
    };
    for (const row of groupedStatuses) {
        counts[row.status] = row._count._all;
        counts.ALL += row._count._all;
    }

    return {
        items,
        counts,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
    };
}

export async function updateAnonymousShareStatus(
    id: string,
    input: { status: AnonymousShareStatusValue; hrNote?: string | null },
    actorUserId: string
) {
    const existing = await prisma.stressmeterAnonymousShare.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!existing) return null;

    const updated = await prisma.stressmeterAnonymousShare.update({
        where: { id },
        data: {
            status: input.status as AnonymousShareStatus,
            hrNote: input.hrNote?.trim() ? input.hrNote.trim() : null,
            reviewedAt: new Date(),
            reviewedByUserId: actorUserId,
        },
        select: {
            id: true,
            submittedWibDate: true,
            topic: true,
            message: true,
            status: true,
            hrNote: true,
            reviewedAt: true,
        },
    });

    return updated;
}
