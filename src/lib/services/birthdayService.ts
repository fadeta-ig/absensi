import { prisma } from "../prisma";
import { toWIBDateString } from "@/lib/timezone";
import logger from "@/lib/logger";
import type { BirthdayReminderEmailItem } from "./emailService";

export * from "@/lib/birthdayUtils";
import {
    type BirthdayOverviewResult,
    type BirthdayEmployeeDetail,
    type BirthdayPreparationInfo,
    calculateBirthdayMetrics,
    INDONESIAN_MONTHS,
} from "@/lib/birthdayUtils";


/**
 * Self-healing: ensure default statuses and settings exist in database.
 */
export async function ensureDefaultBirthdayData(): Promise<void> {
    try {
        const existingSettings = await prisma.birthdayReminderSetting.findUnique({
            where: { id: "default" },
        });

        // 1. First-time initialization
        if (!existingSettings) {
            await prisma.birthdayReminderSetting.create({
                data: {
                    id: "default",
                    isEmailEnabled: false,
                    recipientEmails: "",
                    reminderDays: "30,14,7",
                },
            });

            // Seed default statuses once
            const statusCount = await prisma.birthdayPreparationStatus.count();
            if (statusCount === 0) {
                await prisma.birthdayPreparationStatus.createMany({
                    data: [
                        { id: "status-kirim-ucapan", name: "Kirim Ucapan", color: "#0284c7", order: 1, isDefault: true, isActive: true },
                        { id: "status-kue-dipesan", name: "Kue Dipesan", color: "#eab308", order: 2, isDefault: true, isActive: true },
                        { id: "status-selesai", name: "Selesai", color: "#16a34a", order: 3, isDefault: true, isActive: true },
                    ],
                    skipDuplicates: true,
                });
            }
        }
    } catch (error) {
        logger.error("[BirthdayService] ensureDefaultBirthdayData error", { error });
    }
}

/**
 * Get comprehensive birthday overview for HR/Admin.
 */
export async function getBirthdayOverview(options?: {
    month?: number;
    year?: number;
}): Promise<BirthdayOverviewResult> {
    await ensureDefaultBirthdayData();

    const wibToday = toWIBDateString();
    const [currentYear, currentMonth] = wibToday.split("-").map(Number);

    const selectedMonth = options?.month && options.month >= 1 && options.month <= 12
        ? options.month
        : currentMonth;
    const selectedYear = options?.year && options.year >= 2000
        ? options.year
        : currentYear;

    // Fetch active employees with non-null birthDate
    const employees = await prisma.employee.findMany({
        where: {
            isActive: true,
            privateProfile: { is: { birthDate: { not: null } } },
        },
        select: {
            id: true,
            employeeId: true,
            name: true,
            avatarUrl: true,
            gender: true,
            departmentRel: { select: { name: true } },
            divisionRel: { select: { name: true } },
            positionRel: { select: { name: true } },
            privateProfile: { select: { birthDate: true } },
            birthdayPreparations: {
                where: { year: selectedYear },
                select: {
                    id: true,
                    statusId: true,
                    notes: true,
                    updatedBy: true,
                    updatedAt: true,
                    status: {
                        select: {
                            id: true,
                            name: true,
                            color: true,
                        },
                    },
                },
            },
        },
        orderBy: { name: "asc" },
    });

    const detailedEmployees: BirthdayEmployeeDetail[] = [];

    for (const emp of employees) {
        const birthDate = emp.privateProfile?.birthDate;
        if (!birthDate) continue;

        const metrics = calculateBirthdayMetrics(birthDate);
        const prep = emp.birthdayPreparations[0] || null;

        const preparation: BirthdayPreparationInfo | null = prep ? {
            id: prep.id,
            statusId: prep.statusId,
            statusName: prep.status?.name || null,
            statusColor: prep.status?.color || null,
            notes: prep.notes,
            updatedBy: prep.updatedBy,
            updatedAt: prep.updatedAt ? prep.updatedAt.toISOString() : null,
        } : null;

        detailedEmployees.push({
            id: emp.id,
            employeeId: emp.employeeId,
            name: emp.name,
            avatarUrl: emp.avatarUrl,
            department: emp.departmentRel?.name || "-",
            division: emp.divisionRel?.name || null,
            position: emp.positionRel?.name || "-",
            gender: emp.gender,
            birthDate: birthDate.toISOString().split("T")[0],
            birthDateFormatted: metrics.birthDateFormatted,
            birthMonth: metrics.birthMonth,
            birthDay: metrics.birthDay,
            birthYear: metrics.birthYear,
            ageTurning: metrics.ageTurning,
            daysUntil: metrics.daysUntil,
            isToday: metrics.isToday,
            milestone: metrics.milestone,
            weekCategory: metrics.weekCategory,
            preparation,
        });
    }

    // Sort all by daysUntil ascending, then by name
    detailedEmployees.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name, "id-ID"));

    // Month overview (filtered by selectedMonth)
    const monthEmployees = detailedEmployees
        .filter((e) => e.birthMonth === selectedMonth)
        .sort((a, b) => a.birthDay - b.birthDay || a.name.localeCompare(b.name, "id-ID"));

    const week1 = monthEmployees.filter((e) => e.weekCategory === "week-1");
    const week2 = monthEmployees.filter((e) => e.weekCategory === "week-2");
    const nextWeeks = monthEmployees.filter((e) => e.weekCategory === "next-weeks");

    // Upcoming categories
    const h0 = detailedEmployees.filter((e) => e.daysUntil === 0);
    const h7 = detailedEmployees.filter((e) => e.daysUntil > 0 && e.daysUntil <= 7);
    const h14 = detailedEmployees.filter((e) => e.daysUntil > 7 && e.daysUntil <= 14);
    const h30 = detailedEmployees.filter((e) => e.daysUntil > 14 && e.daysUntil <= 30);
    const allUpcoming = detailedEmployees.filter((e) => e.daysUntil <= 60);

    return {
        selectedMonth,
        selectedYear,
        currentMonth: {
            month: selectedMonth,
            year: selectedYear,
            monthName: INDONESIAN_MONTHS[selectedMonth - 1] || "",
            total: monthEmployees.length,
            week1,
            week2,
            nextWeeks,
            all: monthEmployees,
        },
        upcoming: {
            h0,
            h7,
            h14,
            h30,
            all: allUpcoming,
        },
        summary: {
            totalThisMonth: monthEmployees.length,
            totalToday: h0.length,
            totalH7: h7.length,
            totalH14: h14.length,
            totalH30: h30.length,
            totalEmployeesWithBirthDate: detailedEmployees.length,
        },
        allEmployees: detailedEmployees,
    };
}

// ────────────────────────────────────────────────────────────────
// ─── Status Management ──────────────────────────────────────────
// ────────────────────────────────────────────────────────────────

export async function getBirthdayPreparationStatuses() {
    await ensureDefaultBirthdayData();
    return prisma.birthdayPreparationStatus.findMany({
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
}

export async function createBirthdayPreparationStatus(data: {
    name: string;
    color?: string;
    order?: number;
}) {
    return prisma.birthdayPreparationStatus.create({
        data: {
            name: data.name.trim(),
            color: data.color?.trim() || "#800020",
            order: data.order ?? 0,
            isDefault: false,
            isActive: true,
        },
    });
}

export async function updateBirthdayPreparationStatus(
    id: string,
    data: {
        name?: string;
        color?: string;
        order?: number;
        isActive?: boolean;
    }
) {
    return prisma.birthdayPreparationStatus.update({
        where: { id },
        data: {
            ...(data.name ? { name: data.name.trim() } : {}),
            ...(data.color ? { color: data.color.trim() } : {}),
            ...(data.order !== undefined ? { order: data.order } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
    });
}

export async function deleteBirthdayPreparationStatus(id: string) {
    // 1. Unlink any employee preparations using this status so they transition safely to 'Belum Diproses'
    await prisma.employeeBirthdayPreparation.updateMany({
        where: { statusId: id },
        data: { statusId: null },
    });

    // 2. Delete the status
    return prisma.birthdayPreparationStatus.delete({
        where: { id },
    });
}

// ────────────────────────────────────────────────────────────────
// ─── Preparation Tracking ───────────────────────────────────────
// ────────────────────────────────────────────────────────────────

export async function upsertEmployeeBirthdayPreparation(
    employeeId: string,
    year: number,
    statusId: string | null,
    notes?: string | null,
    actorName?: string
) {
    return prisma.employeeBirthdayPreparation.upsert({
        where: {
            employeeId_year: {
                employeeId,
                year,
            },
        },
        update: {
            statusId,
            notes: notes !== undefined ? notes : undefined,
            updatedBy: actorName || "HR Admin",
        },
        create: {
            employeeId,
            year,
            statusId,
            notes: notes || null,
            updatedBy: actorName || "HR Admin",
        },
        include: {
            status: true,
        },
    });
}

// ────────────────────────────────────────────────────────────────
// ─── Settings & Reminders ───────────────────────────────────────
// ────────────────────────────────────────────────────────────────

export async function getBirthdayReminderSettings() {
    await ensureDefaultBirthdayData();
    return prisma.birthdayReminderSetting.findUnique({
        where: { id: "default" },
    });
}

export async function updateBirthdayReminderSettings(
    data: {
        isEmailEnabled: boolean;
        recipientEmails: string;
        reminderDays?: string;
    },
    actorName?: string
) {
    return prisma.birthdayReminderSetting.upsert({
        where: { id: "default" },
        update: {
            isEmailEnabled: data.isEmailEnabled,
            recipientEmails: data.recipientEmails.trim(),
            reminderDays: data.reminderDays?.trim() || "30,14,7",
            updatedBy: actorName || "HR Admin",
        },
        create: {
            id: "default",
            isEmailEnabled: data.isEmailEnabled,
            recipientEmails: data.recipientEmails.trim(),
            reminderDays: data.reminderDays?.trim() || "30,14,7",
            updatedBy: actorName || "HR Admin",
        },
    });
}

/**
 * Execute birthday reminder scanner and send emails if active.
 */
export async function runBirthdayReminderCheck(): Promise<{
    success: boolean;
    triggered: boolean;
    reason?: string;
    sentRecipients?: string[];
    matchingEmployees?: number;
}> {
    const settings = await getBirthdayReminderSettings();

    if (!settings || !settings.isEmailEnabled) {
        return {
            success: true,
            triggered: false,
            reason: "Email reminder dinonaktifkan dalam pengaturan.",
        };
    }

    const recipients = settings.recipientEmails
        .split(/[,;\n]+/)
        .map((e: string) => e.trim())
        .filter((e: string) => e.length > 0 && e.includes("@"));

    if (recipients.length === 0) {
        return {
            success: false,
            triggered: false,
            reason: "Email reminder aktif namun belum ada alamat email penerima yang valid.",
        };
    }

    // Days to check (e.g. 30, 14, 7, 0)
    const targetDays: number[] = settings.reminderDays
        .split(",")
        .map((s: string) => parseInt(s.trim(), 10))
        .filter((n: number) => !Number.isNaN(n));

    // Also include day 0 (today) by default
    if (!targetDays.includes(0)) targetDays.push(0);

    const overview = await getBirthdayOverview();
    const matching = overview.allEmployees.filter((emp: BirthdayEmployeeDetail) =>
        targetDays.includes(emp.daysUntil)
    );

    if (matching.length === 0) {
        return {
            success: true,
            triggered: false,
            reason: `Tidak ada pegawai dengan ulang tahun pada milestone target (${targetDays.join(", ")} hari).`,
        };
    }

    const emailItems: BirthdayReminderEmailItem[] = matching.map((emp: BirthdayEmployeeDetail) => ({
        employeeId: emp.employeeId,
        name: emp.name,
        position: emp.position,
        department: emp.department,
        birthDateFormatted: emp.birthDateFormatted,
        ageTurning: emp.ageTurning,
        daysUntil: emp.daysUntil,
        milestone: emp.milestone,
        statusName: emp.preparation?.statusName || null,
    }));

    const milestoneDesc = targetDays.map((d: number) => (d === 0 ? "Hari H" : `H-${d}`)).join(" / ");
    const { sendBirthdayReminderEmail } = await import("./emailService");
    const sendResult = await sendBirthdayReminderEmail(
        recipients,
        emailItems,
        `Pengingat Persiapan Ulang Tahun Pegawai (${milestoneDesc})`
    );

    if (sendResult.success) {
        await prisma.birthdayReminderSetting.update({
            where: { id: "default" },
            data: { lastRunAt: new Date() },
        });
    }

    return {
        success: sendResult.success,
        triggered: true,
        sentRecipients: recipients,
        matchingEmployees: matching.length,
        reason: sendResult.message,
    };
}
