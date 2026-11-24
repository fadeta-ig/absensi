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

const MAX_RANGE_DAYS = 366;
const SETTING_CACHE_TTL_MS = 30_000;

let enabledCache: { value: boolean; expiresAt: number } | null = null;

/** Hanya untuk kebutuhan pengujian unit agar cache antar-test bersih. */
export function clearStressmeterSettingCache(): void {
    enabledCache = null;
}

export class StressmeterDomainError extends Error {
    public readonly status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.name = "StressmeterDomainError";
        this.status = status;
    }
}

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
    let resolvedFrom = from && isValidCalendarDate(from) ? from : defaultFrom;
    let finalTo = resolvedTo;

    if (resolvedFrom > finalTo) {
        const tmp = resolvedFrom;
        resolvedFrom = finalTo;
        finalTo = tmp;
    }

    // Batasi rentang maksimal 366 hari inklusif agar kueri tetap cepat dan memori terkendali
    const minAllowedFrom = addCalendarDays(finalTo, -(MAX_RANGE_DAYS - 1));
    if (resolvedFrom < minAllowedFrom) {
        resolvedFrom = minAllowedFrom;
    }

    return { from: resolvedFrom, to: finalTo };
}

// ─── Feature Toggle Setting (AppSetting + 30s TTL Cache) ─────────

export async function isStressmeterEnabled(): Promise<boolean> {
    const now = Date.now();
    if (enabledCache && now < enabledCache.expiresAt) {
        return enabledCache.value;
    }

    const row = await prisma.appSetting.findUnique({
        where: { key: STRESSMETER_SETTING_KEY },
        select: { value: true },
    });
    const enabled = row ? row.value !== "false" : true;
    enabledCache = { value: enabled, expiresAt: now + SETTING_CACHE_TTL_MS };
    return enabled;
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
    enabledCache = { value: enabled, expiresAt: Date.now() + SETTING_CACHE_TTL_MS };
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
    const timePeriodLabel = getWibTimePeriodLabel();

    const enabled = await isStressmeterEnabled();
    // Short-circuit: bila fitur sedang dijeda HR, hemat 2 kueri DB per karyawan pada jam sibuk Clock In
    if (!enabled) {
        return {
            enabled: false,
            shiftDate,
            hasClockedIn: false,
            hasSubmitted: false,
            shouldPrompt: false,
            timePeriodLabel,
            checkin: null,
        };
    }

    const shiftDateKey = toUTCDateKey(shiftDate);
    const [attendance, existing] = await Promise.all([
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
    const shouldPrompt = hasClockedIn && !hasSubmitted;

    return {
        enabled: true,
        shiftDate,
        hasClockedIn,
        hasSubmitted,
        shouldPrompt,
        timePeriodLabel,
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
        throw new StressmeterDomainError("Tanggal shift tidak valid.", 400);
    }
    const shiftDateKey = toUTCDateKey(input.shiftDate);

    const [attendance, existing] = await Promise.all([
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

    if (!attendance?.clockIn) {
        throw new StressmeterDomainError(
            "Presensi Clock In untuk tanggal shift ini belum tercatat.",
            400
        );
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
 * Mengambil nama lengkap otoritatif karyawan dari master Employee hanya ketika
 * karyawan secara eksplisit memilih opt-in menyertakan nama pada Ruang Sharing.
 */
export async function getEmployeeFullNameForShare(
    employeeId: string,
    fallbackName?: string | null
): Promise<string | null> {
    const employee = await prisma.employee.findUnique({
        where: { employeeId },
        select: { name: true },
    });
    const resolved = (employee?.name ?? fallbackName ?? "").trim().slice(0, 150);
    return resolved || null;
}

/**
 * Menyimpan curhat anonim tanpa parameter employeeId/userId/checkinId sama sekali
 * sehingga anonimitas terjaga secara struktural di level database.
 * Field senderName hanya terisi (snapshot nama lengkap) bila karyawan opt-in.
 */
export async function submitAnonymousShare(input: {
    topic?: StressmeterTopicValue;
    message: string;
    senderName?: string | null;
}) {
    const submittedWibDate = toWIBDateString();
    const normalizedSenderName = input.senderName?.trim()
        ? input.senderName.trim().slice(0, 150)
        : null;

    const created = await prisma.stressmeterAnonymousShare.create({
        data: {
            submittedWibDate,
            topic: (input.topic ?? "OTHER") as StressmeterTopic,
            message: input.message.trim(),
            senderName: normalizedSenderName,
            status: AnonymousShareStatus.NEW,
        },
        select: {
            id: true,
            submittedWibDate: true,
            topic: true,
            senderName: true,
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

interface AttentionSourceRow {
    employeeId: string;
    shiftDate: Date;
    rating: number | null;
    skipped?: boolean;
    employee: {
        name: string;
        departmentRel: { name: string } | null;
    };
}

export async function getHrStressmeterOverview(params: HrStressmeterOverviewParams) {
    const { from, to } = resolveDateRange(params.from, params.to);
    const fromDateKey = toUTCDateKey(from);
    const toDateKey = toUTCDateKey(to);
    const departmentId = params.departmentId?.trim() || undefined;
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(5, params.limit ?? 20));

    const todayWib = toWIBDateString();
    const attentionFromStr = addCalendarDays(todayWib, -13);
    const attentionCoveredByPeriod = from <= attentionFromStr && to >= todayWib;

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
            gte: toUTCDateKey(attentionFromStr),
            lte: toUTCDateKey(todayWib),
        },
        skipped: false,
        rating: { not: null },
        ...(departmentId ? { employee: { departmentId } } : {}),
    };

    // Hindari kueri 14 hari duplikat bila rentang terpilih sudah sepenuhnya mencakup 14 hari terakhir
    const [enabled, checkins, totalClockIns, separate14dCheckins, newAnonymousShares, departments] =
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
            attentionCoveredByPeriod
                ? Promise.resolve<AttentionSourceRow[] | null>(null)
                : prisma.stressmeterCheckin.findMany({
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

    // Single-pass aggregation untuk KPI, distribusi, tren harian, per departemen, dan filter log
    let totalRated = 0;
    let totalSkipped = 0;
    let ratingSum = 0;
    let lowMoodCount = 0;
    const countsByRating: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    const dailyMap = new Map<
        string,
        { sum: number; ratedCount: number; lowCount: number; skippedCount: number }
    >();
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

    const searchQuery = params.search?.trim().toLowerCase() ?? "";
    const ratingFilter = params.ratingFilter?.trim().toUpperCase() || "ALL";
    const ratingFilterNumber = /^[1-5]$/.test(ratingFilter) ? Number(ratingFilter) : null;

    const filteredLogs: Array<{
        id: string;
        employeeId: string;
        employeeName: string;
        departmentName: string;
        shiftDate: string;
        rating: number | null;
        skipped: boolean;
    }> = [];

    const attentionSourceRows: AttentionSourceRow[] = separate14dCheckins ?? [];

    for (const c of checkins) {
        const shiftDateStr = formatDateKey(c.shiftDate);
        const deptName = c.employee.departmentRel?.name ?? "Tanpa Departemen";
        const isRated = !c.skipped && typeof c.rating === "number" && c.rating >= 1 && c.rating <= 5;

        // Kumpulkan sumber deteksi dini 14 hari tanpa kueri tambahan bila tercakup rentang
        if (!separate14dCheckins && isRated && shiftDateStr >= attentionFromStr && shiftDateStr <= todayWib) {
            attentionSourceRows.push(c);
        }

        const dailyCur = dailyMap.get(shiftDateStr) ?? {
            sum: 0,
            ratedCount: 0,
            lowCount: 0,
            skippedCount: 0,
        };
        const deptCur = deptMap.get(c.employee.departmentId) ?? {
            departmentId: c.employee.departmentId,
            departmentName: deptName,
            sum: 0,
            ratedCount: 0,
            lowCount: 0,
            skippedCount: 0,
        };

        if (isRated) {
            const score = c.rating as number;
            totalRated += 1;
            ratingSum += score;
            countsByRating[score] += 1;
            if (score <= 2) {
                lowMoodCount += 1;
                dailyCur.lowCount += 1;
                deptCur.lowCount += 1;
            }
            dailyCur.sum += score;
            dailyCur.ratedCount += 1;
            deptCur.sum += score;
            deptCur.ratedCount += 1;
        } else {
            totalSkipped += 1;
            dailyCur.skippedCount += 1;
            deptCur.skippedCount += 1;
        }

        dailyMap.set(shiftDateStr, dailyCur);
        deptMap.set(c.employee.departmentId, deptCur);

        // Evaluasi filter log pada pass yang sama
        let matchFilter = true;
        if (ratingFilter === "SKIPPED") {
            matchFilter = c.skipped;
        } else if (ratingFilter === "LOW") {
            matchFilter = isRated && (c.rating as number) <= 2;
        } else if (ratingFilterNumber !== null) {
            matchFilter = isRated && c.rating === ratingFilterNumber;
        }

        if (matchFilter && searchQuery) {
            const hay = `${c.employee.name} ${c.employeeId} ${deptName}`.toLowerCase();
            matchFilter = hay.includes(searchQuery);
        }

        if (matchFilter) {
            filteredLogs.push({
                id: c.id,
                employeeId: c.employeeId,
                employeeName: c.employee.name,
                departmentName: c.employee.departmentRel?.name ?? "-",
                shiftDate: shiftDateStr,
                rating: c.rating,
                skipped: c.skipped,
            });
        }
    }

    const averageRating = totalRated > 0 ? roundOneDecimal(ratingSum / totalRated) : null;
    const participationRate =
        totalClockIns > 0
            ? Math.min(100, roundOneDecimal((totalRated / totalClockIns) * 100))
            : 0;

    const distribution = ([5, 4, 3, 2, 1] as const).map((star) => ({
        rating: star,
        count: countsByRating[star],
        percentage: totalRated > 0 ? roundOneDecimal((countsByRating[star] / totalRated) * 100) : 0,
    }));

    const dailyTrend = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, agg]) => ({
            date,
            averageRating: agg.ratedCount > 0 ? roundOneDecimal(agg.sum / agg.ratedCount) : null,
            ratedCount: agg.ratedCount,
            lowCount: agg.lowCount,
            skippedCount: agg.skippedCount,
        }));

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

    // Deteksi Dini (14 hari terakhir: skor rendah 1–2 berulang >= 2 kali atau skor 1 terbaru)
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
    for (const c of attentionSourceRows) {
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

    const totalLogs = filteredLogs.length;
    const totalPages = Math.max(1, Math.ceil(totalLogs / limit));
    const safePage = Math.min(page, totalPages);
    const startIdx = (safePage - 1) * limit;
    const logs = filteredLogs.slice(startIdx, startIdx + limit);

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
    identity?: string | null;
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
    const requestedPage = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(5, params.limit ?? 15));

    const dateFilter: Prisma.StringFilter = {};
    if (params.from && isValidCalendarDate(params.from)) {
        dateFilter.gte = params.from;
    }
    if (params.to && isValidCalendarDate(params.to)) {
        dateFilter.lte = params.to;
    }
    const hasDateFilter = Boolean(dateFilter.gte || dateFilter.lte);

    const identityUpper = params.identity?.toUpperCase();
    const baseWhere: Prisma.StressmeterAnonymousShareWhereInput = {
        ...(hasDateFilter ? { submittedWibDate: dateFilter } : {}),
        ...(params.topic && VALID_TOPICS.has(params.topic)
            ? { topic: params.topic as StressmeterTopic }
            : {}),
        ...(identityUpper === "ANONYMOUS"
            ? { senderName: null }
            : identityUpper === "NAMED"
                ? { senderName: { not: null } }
                : {}),
    };

    const listWhere: Prisma.StressmeterAnonymousShareWhereInput = {
        ...baseWhere,
        ...(params.status && VALID_STATUSES.has(params.status)
            ? { status: params.status as AnonymousShareStatus }
            : {}),
    };

    const [total, groupedStatuses] = await Promise.all([
        prisma.stressmeterAnonymousShare.count({ where: listWhere }),
        prisma.stressmeterAnonymousShare.groupBy({
            by: ["status"],
            where: baseWhere,
            _count: { _all: true },
        }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(requestedPage, totalPages);

    const items =
        total === 0
            ? []
            : await prisma.stressmeterAnonymousShare.findMany({
                  where: listWhere,
                  // Urutkan berdasarkan tanggal WIB + UUID acak (bukan createdAt) agar urutan jam tidak bocor
                  orderBy: [{ submittedWibDate: "desc" }, { id: "desc" }],
                  skip: (safePage - 1) * limit,
                  take: limit,
                  select: {
                      id: true,
                      submittedWibDate: true,
                      topic: true,
                      message: true,
                      senderName: true,
                      status: true,
                      hrNote: true,
                      reviewedAt: true,
                  },
              });

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
            page: safePage,
            limit,
            total,
            totalPages,
        },
    };
}

export async function updateAnonymousShareStatus(
    id: string,
    input: { status: AnonymousShareStatusValue; hrNote?: string | null },
    actorUserId: string
) {
    try {
        return await prisma.stressmeterAnonymousShare.update({
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
                senderName: true,
                status: true,
                hrNote: true,
                reviewedAt: true,
            },
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
            return null;
        }
        throw error;
    }
}
