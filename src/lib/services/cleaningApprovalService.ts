import { prisma } from "@/lib/prisma";
import { toWIBDateString } from "@/lib/timezone";
import { PERMISSIONS } from "@/lib/permissions";
import { isWig002, requireWig002OrTopViewer, monthWibDateRange, CleaningError } from "@/lib/services/cleaningService";
import type { SessionPayload } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import crypto from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getUploadLimit, isCleaningTopViewer } from "@/lib/services/appSettingsService";
import logger from "@/lib/logger";

/**
 * Kapabilitas cleaning per employee untuk gating menu (ringan: 2 query hitung).
 * isReviewer = ditugaskan sebagai INSPECTED_BY/KNOWN_BY pada bulan berjalan
 * atau bulan mendatang; isTopViewer = employeeId == setting atasan tertinggi.
 */
export async function getEmployeeCleaningCapabilities(
    session: SessionPayload
): Promise<{ isReviewer: boolean; isTopViewer: boolean }> {
    if (!session.employeeId) return { isReviewer: false, isTopViewer: false };
    const currentMonth = toWIBDateString(new Date()).slice(0, 7);
    const [reviewerCount, topViewer] = await Promise.all([
        prisma.cleaningMonthlyApproval.count({
            where: {
                monthWib: { gte: currentMonth },
                OR: [
                    { inspectedByEmployeeId: session.employeeId },
                    { knownByEmployeeId: session.employeeId },
                ],
            },
        }),
        isCleaningTopViewer(session).catch(() => false),
    ]);
    return { isReviewer: reviewerCount > 0, isTopViewer: topViewer };
}

export type ApprovalDerivedStatus = "WAITING_FOR_SIGNATURES" | "PARTIALLY_SIGNED" | "COMPLETE";

function requireWig002(session: SessionPayload): void {
    if (!isWig002(session)) {
        throw new CleaningError("Hanya WIG002 dengan izin ga.manage yang dapat mengelola persetujuan kebersihan.", 403);
    }
}

export function validateMonthWib(month: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        throw new CleaningError("Format bulan tidak valid. Gunakan YYYY-MM.", 400);
    }
}

export function getDaysInMonth(month: string): number {
    const [year, m] = month.split("-").map(Number);
    const isLeapYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
    const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return daysInMonth[m - 1];
}

const ID_MONTH_LONG = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
];

const ID_MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function formatMonthWibId(monthWib: string): string {
    const [y, m] = monthWib.split("-").map(Number);
    if (!y || !m || m < 1 || m > 12) return monthWib;
    return `${ID_MONTH_LONG[m - 1]} ${y}`;
}

export function formatWibDateShortId(wibDate: string): string {
    const [y, m, d] = wibDate.split("-").map(Number);
    if (!y || !m || !d || m < 1 || m > 12) return wibDate;
    return `${d} ${ID_MONTH_SHORT[m - 1]} ${y}`;
}

/** Tanggal terakhir kalender bulan itu (pure calendar, tanpa host timezone). */
export function getLastDateOfMonth(monthWib: string): string {
    validateMonthWib(monthWib);
    const [year, m] = monthWib.split("-").map(Number);
    const isLeapYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
    const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return `${monthWib}-${String(daysInMonth[m - 1]).padStart(2, "0")}`;
}

export function getMonthSignInfo(monthWib: string, wibToday: string = toWIBDateString(new Date())): {
    lastDate: string;
    opensOnWibDate: string;
    wibToday: string;
    isSignable: boolean;
} {
    const lastDate = getLastDateOfMonth(monthWib);
    return { lastDate, opensOnWibDate: lastDate, wibToday, isSignable: wibToday >= lastDate };
}

/**
 * Kunci TTD akhir bulan — satu logika untuk INSPECTED_BY + KNOWN_BY.
 * Boleh mulai tanggal terakhir bulan itu jam 00.00 WIB; susulan bulan lalu tetap boleh.
 */
export function assertMonthSignable(
    monthWib: string,
    role: "INSPECTED_BY" | "KNOWN_BY",
    wibToday: string = toWIBDateString(new Date())
): void {
    const info = getMonthSignInfo(monthWib, wibToday);
    if (info.isSignable) return;
    const roleLabel = role === "INSPECTED_BY" ? "Diperiksa Oleh" : "Mengetahui";
    throw new CleaningError(
        `Tanda tangan ${roleLabel} untuk periode ${formatMonthWibId(monthWib)} baru dapat dilakukan mulai ${formatWibDateShortId(info.opensOnWibDate)} pukul 00.00 WIB (akhir bulan). Silakan kembali setelah tanggal tersebut.`,
        422
    );
}

export function deriveApprovalStatus(
    inspectedSig: { status: string } | null | undefined,
    knownSig: { status: string } | null | undefined
): ApprovalDerivedStatus {
    const inspectedSigned = inspectedSig?.status === "SIGNED";
    const knownSigned = knownSig?.status === "SIGNED";

    if (inspectedSigned && knownSigned) {
        return "COMPLETE";
    }
    if (inspectedSigned || knownSigned) {
        return "PARTIALLY_SIGNED";
    }
    return "WAITING_FOR_SIGNATURES";
}

// ─── Tanda tangan disk storage (Gel.2c: baru ke disk+path, base64 lama hanya dibaca) ─__

export const CLEANING_SIGNATURE_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "signatures");

const CLEANING_SIGNATURE_RELATIVE_PATTERN = /^[A-Za-z0-9_-]+\/(INSPECTED_BY|KNOWN_BY)_[A-Za-z0-9-]+\.png$/;

function formatSignatureLimit(maxBytes: number): string {
    if (maxBytes === 256 * 1024) return "256 KB";
    if (maxBytes >= 1024 * 1024) {
        const mb = maxBytes / (1024 * 1024);
        return `${Number.isInteger(mb) ? String(mb) : mb.toFixed(2)} MB`;
    }
    return `${Math.round(maxBytes / 1024)} KB`;
}

/** Kembalikan absolute path bila relative path valid dan di dalam root; selain itu null. */
export function resolveCleaningSignaturePath(relativePath: string): string | null {
    if (typeof relativePath !== "string" || !CLEANING_SIGNATURE_RELATIVE_PATTERN.test(relativePath)) return null;
    const resolved = path.resolve(CLEANING_SIGNATURE_STORAGE_ROOT, relativePath);
    if (!resolved.startsWith(`${CLEANING_SIGNATURE_STORAGE_ROOT}${path.sep}`)) return null;
    return resolved;
}

/** Baca berkas PNG tanda tangan dari relative path yang tervalidasi. */
export async function readCleaningSignatureFile(relativePath: string): Promise<Buffer> {
    const absolutePath = resolveCleaningSignaturePath(relativePath);
    if (!absolutePath) {
        throw new CleaningError("Lokasi penyimpanan tanda tangan tidak valid.", 400);
    }
    return readFile(absolutePath);
}

/**
 * Dual-read payload tanda tangan untuk respons/API/PDF:
 * path ada → baca file disk dan kembalikan sebagai data URL;
 * kosong/gagal → fallback ke payload base64 lama bila valid; selain itu null.
 */
export async function resolveSignatureDataUrl(
    sig: { signaturePayload?: string | null; signaturePath?: string | null } | null | undefined
): Promise<string | null> {
    if (!sig) return null;
    if (sig.signaturePath) {
        try {
            const absolutePath = resolveCleaningSignaturePath(sig.signaturePath);
            if (absolutePath) {
                const fileBuffer = await readFile(absolutePath);
                if (fileBuffer.length > 0) {
                    return `data:image/png;base64,${fileBuffer.toString("base64")}`;
                }
            }
        } catch {
            // Abaikan dan lanjut ke fallback blob lama.
        }
    }
    if (typeof sig.signaturePayload === "string" && sig.signaturePayload.startsWith("data:image/png;base64,")) {
        return sig.signaturePayload;
    }
    return null;
}

export function validateSignaturePayload(payload: string, maxBytes = 256 * 1024): Buffer {
    if (typeof payload !== "string" || !payload.startsWith("data:image/png;base64,")) {
        throw new CleaningError("Format tanda tangan tidak valid. Harus berupa PNG data URL.", 400);
    }
    const base64Data = payload.replace(/^data:image\/png;base64,/, "");
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
        throw new CleaningError("Karakter base64 pada tanda tangan tidak valid.", 400);
    }
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > maxBytes) {
        throw new CleaningError(`Ukuran tanda tangan melebihi batas ${formatSignatureLimit(maxBytes)}.`, 413);
    }
    if (buffer.length < 100) {
        throw new CleaningError("Tanda tangan kosong atau tidak valid.", 400);
    }
    // Check PNG header
    if (
        buffer[0] !== 0x89 ||
        buffer[1] !== 0x50 ||
        buffer[2] !== 0x4e ||
        buffer[3] !== 0x47 ||
        buffer[4] !== 0x0d ||
        buffer[5] !== 0x0a ||
        buffer[6] !== 0x1a ||
        buffer[7] !== 0x0a
    ) {
        throw new CleaningError("Payload bukan gambar PNG yang valid.", 400);
    }
    return buffer;
}

export async function getLatestChecklistChange(
    db: Prisma.TransactionClient | typeof prisma,
    roomId: string,
    monthWib: string
): Promise<{ timestamp: Date; actorName: string | null } | null> {
    const checklists = await db.cleaningDailyChecklist.findMany({
        where: {
            roomId,
            wibDate: { startsWith: monthWib },
        },
        select: {
            updatedAt: true,
            items: {
                select: {
                    updatedAt: true,
                    lastChangedAt: true,
                    lastChangedBy: {
                        select: {
                            displayName: true,
                        },
                    },
                },
            },
        },
    });

    if (checklists.length === 0) return null;

    let maxTimestamp: Date | null = null;
    let actorName: string | null = null;

    for (const cl of checklists) {
        if (!maxTimestamp || cl.updatedAt > maxTimestamp) {
            maxTimestamp = cl.updatedAt;
        }
        for (const item of cl.items) {
            const itemTime = item.lastChangedAt || item.updatedAt;
            if (!maxTimestamp || itemTime > maxTimestamp) {
                maxTimestamp = itemTime;
                actorName = item.lastChangedBy?.displayName ?? null;
            }
        }
    }

    return maxTimestamp ? { timestamp: maxTimestamp, actorName } : null;
}

/**
 * Batch 1 query untuk banyak ruangan: perubahan checklist terakhir per room
 * dalam satu bulan. Hindari N+1 `getLatestChecklistChange` per approval.
 */
export async function getLatestChecklistChangeMap(
    db: Prisma.TransactionClient | typeof prisma,
    roomIds: string[],
    monthWib: string
): Promise<Map<string, { timestamp: Date; actorName: string | null }>> {
    const result = new Map<string, { timestamp: Date; actorName: string | null }>();
    if (roomIds.length === 0) return result;
    const mapRange = monthWibDateRange(monthWib);
    const checklists = await db.cleaningDailyChecklist.findMany({
        where: {
            roomId: { in: roomIds },
            wibDate: { gte: mapRange.gte, lt: mapRange.lt },
        },
        select: {
            roomId: true,
            updatedAt: true,
            items: {
                select: {
                    updatedAt: true,
                    lastChangedAt: true,
                    lastChangedBy: {
                        select: {
                            displayName: true,
                        },
                    },
                },
            },
        },
    });

    for (const cl of checklists) {
        let maxTimestamp: Date = cl.updatedAt;
        let actorName: string | null = null;
        for (const item of cl.items) {
            const itemTime = item.lastChangedAt || item.updatedAt;
            if (itemTime > maxTimestamp) {
                maxTimestamp = itemTime;
                actorName = item.lastChangedBy?.displayName ?? null;
            }
        }
        if (maxTimestamp) {
            const current = result.get(cl.roomId);
            if (!current || maxTimestamp > current.timestamp) {
                result.set(cl.roomId, { timestamp: maxTimestamp, actorName });
            }
        }
    }
    return result;
}

export async function getValidatedInternalEmployee(
    db: Prisma.TransactionClient | typeof prisma,
    employeeId: string,
    wibToday: string
) {
    const todayDate = new Date(wibToday + "T00:00:00+07:00");
    const employee = await db.employee.findFirst({
        where: {
            OR: [{ employeeId }, { id: employeeId }],
            isActive: true,
            userAccount: {
                isActive: true,
            },
            AND: [
                {
                    OR: [
                        { employmentStartDate: null },
                        { employmentStartDate: { lte: todayDate } },
                    ],
                },
                {
                    OR: [
                        { employmentEndDate: null },
                        { employmentEndDate: { gte: todayDate } },
                    ],
                },
            ],
        },
        include: {
            userAccount: true,
        },
    });

    if (!employee) {
        throw new CleaningError(`Karyawan ${employeeId} tidak aktif atau tidak memenuhi syarat internal.`, 422);
    }
    return employee;
}

export async function getEligibleReviewers(session: SessionPayload) {
    requireWig002(session);
    const wibToday = toWIBDateString(new Date());
    const todayDate = new Date(wibToday + "T00:00:00+07:00");

    return prisma.employee.findMany({
        where: {
            isActive: true,
            userAccount: {
                isActive: true,
            },
            OR: [
                { employmentStartDate: null },
                { employmentStartDate: { lte: todayDate } },
            ],
            AND: [
                {
                    OR: [
                        { employmentEndDate: null },
                        { employmentEndDate: { gte: todayDate } },
                    ],
                },
            ],
        },
        select: {
            id: true,
            employeeId: true,
            name: true,
            userAccount: {
                select: {
                    id: true,
                    username: true,
                    displayName: true,
                },
            },
        },
        orderBy: { name: "asc" },
    });
}

export async function openApprovalPeriod(
    session: SessionPayload,
    data: {
        roomId: string;
        monthWib: string;
        inspectedByEmployeeId: string;
        knownByEmployeeId: string;
    }
) {
    requireWig002(session);
    validateMonthWib(data.monthWib);

    if (data.inspectedByEmployeeId === data.knownByEmployeeId) {
        throw new CleaningError("Karyawan Diperiksa Oleh dan Mengetahui harus berbeda.", 422);
    }

    const room = await prisma.cleaningRoom.findUnique({
        where: { id: data.roomId },
        select: { id: true, name: true, isActive: true },
    });
    if (!room) {
        throw new CleaningError("Ruangan tidak ditemukan.", 404);
    }

    const wibToday = toWIBDateString(new Date());

    const [inspectedEmp, knownEmp] = await Promise.all([
        getValidatedInternalEmployee(prisma, data.inspectedByEmployeeId, wibToday),
        getValidatedInternalEmployee(prisma, data.knownByEmployeeId, wibToday),
    ]);

    const existing = await prisma.cleaningMonthlyApproval.findUnique({
        where: {
            roomId_monthWib: {
                roomId: data.roomId,
                monthWib: data.monthWib,
            },
        },
        include: {
            signatures: {
                where: { status: "SIGNED" },
            },
        },
    });

    if (existing) {
        const inspectedSig = existing.signatures.find((s) => s.role === "INSPECTED_BY");
        const knownSig = existing.signatures.find((s) => s.role === "KNOWN_BY");
        const derivedStatus = deriveApprovalStatus(inspectedSig, knownSig);
        return {
            approval: existing,
            derivedStatus,
            isNew: false,
        };
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const created = await tx.cleaningMonthlyApproval.create({
                data: {
                    roomId: data.roomId,
                    roomNameSnapshot: room.name,
                    monthWib: data.monthWib,
                    inspectedByEmployeeId: inspectedEmp.employeeId,
                    knownByEmployeeId: knownEmp.employeeId,
                },
                include: {
                    signatures: {
                        where: { status: "SIGNED" },
                    },
                },
            });

            await tx.auditLog.create({
                data: {
                    action: "OPEN_CLEANING_APPROVAL",
                    entity: "CLEANING_APPROVAL",
                    entityId: created.id,
                    actorType: "USER",
                    actorUserId: session.userId,
                    actorIdentifier: session.username,
                    actorName: session.name,
                    actorRole: session.primaryRole,
                    details: JSON.stringify({
                        roomId: data.roomId,
                        roomName: room.name,
                        monthWib: data.monthWib,
                        inspectedByEmployeeId: inspectedEmp.employeeId,
                        knownByEmployeeId: knownEmp.employeeId,
                    }),
                },
            });

            return created;
        });

        return {
            approval: result,
            derivedStatus: "WAITING_FOR_SIGNATURES" as const,
            isNew: true,
        };
    } catch (err: unknown) {
        if (
            typeof err === "object" &&
            err !== null &&
            "code" in err &&
            (err as { code: string }).code === "P2002"
        ) {
            const reloaded = await prisma.cleaningMonthlyApproval.findUniqueOrThrow({
                where: {
                    roomId_monthWib: {
                        roomId: data.roomId,
                        monthWib: data.monthWib,
                    },
                },
                include: {
                    signatures: {
                        where: { status: "SIGNED" },
                    },
                },
            });
            const inspectedSig = reloaded.signatures.find((s) => s.role === "INSPECTED_BY");
            const knownSig = reloaded.signatures.find((s) => s.role === "KNOWN_BY");
            return {
                approval: reloaded,
                derivedStatus: deriveApprovalStatus(inspectedSig, knownSig),
                isNew: false,
            };
        }
        throw err;
    }
}

/**
 * Pastikan baris approval ruangan-bulan ada, memakai pasangan default global.
 * Tanpa fallback-baca: pembaca tetap strict (tanpa baris = terkunci), baris
 * dibuat otomatis di sini (paraf/TTD pertama) atau via open-all / modal.
 * Idempoten (unique room+month + P2002 → reload).
 */
export async function ensureMonthlyApproval(
    db: Prisma.TransactionClient | typeof prisma,
    roomId: string,
    monthWib: string,
    actor?: { userId?: string | null; identifier: string; name?: string | null; role?: string | null }
) {
    validateMonthWib(monthWib);
    const existing = await db.cleaningMonthlyApproval.findUnique({
        where: { roomId_monthWib: { roomId, monthWib } },
    });
    if (existing) return { approval: existing, isNew: false };

    const room = await db.cleaningRoom.findUnique({
        where: { id: roomId },
        select: { id: true, name: true, isActive: true },
    });
    if (!room || !room.isActive) {
        throw new CleaningError("Ruangan tidak ditemukan atau tidak aktif.", 404);
    }

    const { getCleaningDefaultReviewers } = await import("@/lib/services/appSettingsService");
    const defaults = await getCleaningDefaultReviewers();
    if (!defaults.inspectedByEmployeeId || !defaults.knownByEmployeeId) {
        throw new CleaningError(
            "Pasangan default reviewer belum ditetapkan. Minta WIG002 mengaturnya di Pengaturan > Atasan.",
            422
        );
    }

    const wibToday = toWIBDateString(new Date());
    const inspectedEmp = await getValidatedInternalEmployee(db, defaults.inspectedByEmployeeId, wibToday);
    const knownEmp = await getValidatedInternalEmployee(db, defaults.knownByEmployeeId, wibToday);
    if (inspectedEmp.employeeId === knownEmp.employeeId) {
        throw new CleaningError("Diperiksa Oleh dan Mengetahui harus orang yang berbeda.", 422);
    }

    try {
        const created = await db.cleaningMonthlyApproval.create({
            data: {
                roomId: room.id,
                roomNameSnapshot: room.name,
                monthWib,
                inspectedByEmployeeId: inspectedEmp.employeeId,
                knownByEmployeeId: knownEmp.employeeId,
            },
        });
        await db.auditLog.create({
            data: {
                action: "OPEN_CLEANING_APPROVAL",
                entity: "CLEANING_APPROVAL",
                entityId: created.id,
                actorType: "USER",
                actorUserId: actor?.userId ?? null,
                actorIdentifier: actor?.identifier ?? "SYSTEM",
                actorName: actor?.name ?? null,
                actorRole: actor?.role ?? null,
                details: JSON.stringify({
                    roomId: room.id,
                    roomName: room.name,
                    monthWib,
                    inspectedByEmployeeId: inspectedEmp.employeeId,
                    knownByEmployeeId: knownEmp.employeeId,
                    source: "default",
                }),
            },
        });
        return { approval: created, isNew: true };
    } catch (err: unknown) {
        if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
            const reloaded = await db.cleaningMonthlyApproval.findUniqueOrThrow({
                where: { roomId_monthWib: { roomId, monthWib } },
            });
            return { approval: reloaded, isNew: false };
        }
        throw err;
    }
}

/**
 * Buka periode untuk SEMUA ruangan aktif sekaligus (bulk idempoten).
 * Hanya WIG002 (ditegakkan di route).
 */
export async function openAllMonthlyApprovals(
    session: SessionPayload,
    monthWib: string
): Promise<{ created: number; skipped: number; monthWib: string }> {
    requireWig002(session);
    validateMonthWib(monthWib);

    const { getCleaningDefaultReviewers } = await import("@/lib/services/appSettingsService");
    const defaults = await getCleaningDefaultReviewers();
    if (!defaults.inspectedByEmployeeId || !defaults.knownByEmployeeId) {
        throw new CleaningError(
            "Pasangan default reviewer belum ditetapkan. Atur dulu di Pengaturan > Atasan.",
            422
        );
    }

    const wibToday = toWIBDateString(new Date());
    const inspectedEmp = await getValidatedInternalEmployee(prisma, defaults.inspectedByEmployeeId, wibToday);
    const knownEmp = await getValidatedInternalEmployee(prisma, defaults.knownByEmployeeId, wibToday);
    if (inspectedEmp.employeeId === knownEmp.employeeId) {
        throw new CleaningError("Diperiksa Oleh dan Mengetahui harus orang yang berbeda.", 422);
    }

    const rooms = await prisma.cleaningRoom.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
    });
    const existing = await prisma.cleaningMonthlyApproval.findMany({
        where: { monthWib, roomId: { in: rooms.map((room) => room.id) } },
        select: { roomId: true },
    });
    const existingSet = new Set(existing.map((row) => row.roomId));
    const missing = rooms.filter((room) => !existingSet.has(room.id));
    if (missing.length === 0) {
        return { created: 0, skipped: rooms.length, monthWib };
    }

    const result = await prisma.cleaningMonthlyApproval.createMany({
        data: missing.map((room) => ({
            roomId: room.id,
            roomNameSnapshot: room.name,
            monthWib,
            inspectedByEmployeeId: inspectedEmp.employeeId,
            knownByEmployeeId: knownEmp.employeeId,
        })),
        skipDuplicates: true,
    });

    await prisma.auditLog.create({
        data: {
            action: "OPEN_ALL_CLEANING_APPROVAL",
            entity: "CLEANING_APPROVAL",
            entityId: null,
            actorType: "USER",
            actorUserId: session.userId,
            actorIdentifier: session.username,
            actorName: session.name,
            actorRole: session.primaryRole,
            details: JSON.stringify({
                monthWib,
                inspectedByEmployeeId: inspectedEmp.employeeId,
                knownByEmployeeId: knownEmp.employeeId,
                requested: missing.length,
                created: result.count,
            }),
        },
    });

    return { created: result.count, skipped: rooms.length - result.count, monthWib };
}

export async function reopenApprovalSlot(
    session: SessionPayload,
    data: {
        approvalId: string;
        role: "INSPECTED_BY" | "KNOWN_BY";
        reopenReason: string;
        replacementEmployeeId?: string;
    }
) {
    requireWig002(session);
    if (data.role !== "INSPECTED_BY" && data.role !== "KNOWN_BY") {
        throw new CleaningError("Role harus INSPECTED_BY atau KNOWN_BY.", 400);
    }
    const trimmedReason = (data.reopenReason || "").trim();
    if (!trimmedReason || trimmedReason.length < 3) {
        throw new CleaningError("Alasan pembukaan kembali wajib diisi minimal 3 karakter.", 400);
    }

    const wibToday = toWIBDateString(new Date());

    return prisma.$transaction(async (tx) => {
        const approval = await tx.cleaningMonthlyApproval.findUnique({
            where: { id: data.approvalId },
            include: {
                signatures: {
                    where: { role: data.role, status: "SIGNED" },
                },
            },
        });
        if (!approval) {
            throw new CleaningError("Periode persetujuan tidak ditemukan.", 404);
        }

        const otherAssignedId =
            data.role === "INSPECTED_BY"
                ? approval.knownByEmployeeId
                : approval.inspectedByEmployeeId;

        let newEmployeeId =
            data.role === "INSPECTED_BY"
                ? approval.inspectedByEmployeeId
                : approval.knownByEmployeeId;

        if (data.replacementEmployeeId) {
            if (data.replacementEmployeeId === otherAssignedId) {
                throw new CleaningError("Karyawan pengganti tidak boleh sama dengan reviewer peran lainnya.", 422);
            }
            const replacementEmp = await getValidatedInternalEmployee(
                tx,
                data.replacementEmployeeId,
                wibToday
            );
            newEmployeeId = replacementEmp.employeeId;
        } else {
            // Tanpa pengganti: karyawan saat ini wajib lolos validasi kontrak
            // yang sama (aktif + masa kerja mencakup hari ini).
            try {
                const currentEmp = await getValidatedInternalEmployee(tx, newEmployeeId, wibToday);
                newEmployeeId = currentEmp.employeeId;
            } catch {
                throw new CleaningError(
                    "Karyawan saat ini tidak aktif. Wajib menyertakan karyawan pengganti yang aktif.",
                    422
                );
            }
        }

        const activeSig = approval.signatures[0];
        if (!activeSig) {
            throw new CleaningError("Belum ada tanda tangan pada peran ini sehingga tidak ada yang dibuka kembali.", 404);
        }
        await tx.cleaningMonthlyApprovalSignature.update({
            where: { id: activeSig.id },
            data: {
                status: "REOPENED",
                reopenedAt: new Date(),
                reopenedByUserId: session.userId,
                reopenReason: trimmedReason,
            },
        });

        const updateData: { inspectedByEmployeeId?: string; knownByEmployeeId?: string } = {};
        if (data.role === "INSPECTED_BY" && newEmployeeId !== approval.inspectedByEmployeeId) {
            updateData.inspectedByEmployeeId = newEmployeeId;
        }
        if (data.role === "KNOWN_BY" && newEmployeeId !== approval.knownByEmployeeId) {
            updateData.knownByEmployeeId = newEmployeeId;
        }

        const updatedApproval = await tx.cleaningMonthlyApproval.update({
            where: { id: approval.id },
            data: updateData,
            include: {
                signatures: {
                    where: { status: "SIGNED" },
                },
            },
        });

        await tx.auditLog.create({
            data: {
                action: "REOPEN_CLEANING_APPROVAL_SLOT",
                entity: "CLEANING_APPROVAL",
                entityId: approval.id,
                actorType: "USER",
                actorUserId: session.userId,
                actorIdentifier: session.username,
                actorName: session.name,
                actorRole: session.primaryRole,
                details: JSON.stringify({
                    role: data.role,
                    reason: trimmedReason,
                    previousSignatureId: activeSig?.id ?? null,
                    replacementEmployeeId: data.replacementEmployeeId ?? null,
                }),
            },
        });

        const inspectedSig = updatedApproval.signatures.find((s) => s.role === "INSPECTED_BY");
        const knownSig = updatedApproval.signatures.find((s) => s.role === "KNOWN_BY");
        const derivedStatus = deriveApprovalStatus(inspectedSig, knownSig);

        return {
            success: true,
            approval: updatedApproval,
            reopenedRole: data.role,
            derivedStatus,
        };
    });
}

export async function signApprovalPeriod(
    session: SessionPayload,
    data: {
        approvalId: string;
        role: "INSPECTED_BY" | "KNOWN_BY";
        signaturePayload: string;
        idempotencyKey?: string;
    }
) {
    if (!session.employeeId) {
        throw new CleaningError("Akun Anda tidak terhubung dengan data karyawan.", 403);
    }
    if (!session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
        throw new CleaningError("Anda tidak memiliki izin employee.self.", 403);
    }
    if (data.role !== "INSPECTED_BY" && data.role !== "KNOWN_BY") {
        throw new CleaningError("Role tanda tangan harus INSPECTED_BY atau KNOWN_BY.", 400);
    }

    // Batas ukuran via app settings (fallback bawaan 0,25 MB bila DB belum ada/gagal).
    const signatureMaxMb = await getUploadLimit("upload.signature.maxMb");
    const signatureMaxBytes = Math.floor(signatureMaxMb * 1024 * 1024);
    const signatureBuffer = validateSignaturePayload(data.signaturePayload, signatureMaxBytes);

    const requestHash = crypto
        .createHash("sha256")
        .update(JSON.stringify({
            approvalId: data.approvalId,
            role: data.role,
            signaturePayload: data.signaturePayload,
        }))
        .digest("hex");

    if (data.idempotencyKey) {
        const existingIdem = await prisma.cleaningApprovalIdempotency.findUnique({
            where: {
                actorId_endpointScope_idempotencyKey: {
                    actorId: session.userId,
                    endpointScope: "employee_sign_cleaning_approval",
                    idempotencyKey: data.idempotencyKey,
                },
            },
        });
        if (existingIdem) {
            if (existingIdem.requestHash === requestHash) {
                return JSON.parse(existingIdem.responsePayload);
            }
            throw new CleaningError("Idempotency key telah digunakan untuk payload berbeda.", 409);
        }
    }

    const wibToday = toWIBDateString(new Date());

    // Kunci akhir bulan sebelum tulis file agar request yang ditolak tidak meninggalkan berkas yatim.
    const approvalMeta = await prisma.cleaningMonthlyApproval.findUnique({
        where: { id: data.approvalId },
        select: { monthWib: true },
    });
    if (!approvalMeta) {
        throw new CleaningError("Periode persetujuan tidak ditemukan.", 404);
    }
    assertMonthSignable(approvalMeta.monthWib, data.role, wibToday);

    // Simpan PNG baru ke disk privat (bukan base64 ke DB).
    const signatureRelativePath = path
        .join(data.approvalId, `${data.role}_${randomUUID()}.png`)
        .replace(/\\/g, "/");
    const signatureAbsolutePath = resolveCleaningSignaturePath(signatureRelativePath);
    if (!signatureAbsolutePath) {
        throw new CleaningError("Lokasi penyimpanan tanda tangan tidak valid.", 400);
    }
    await mkdir(path.dirname(signatureAbsolutePath), { recursive: true });
    try {
        await writeFile(signatureAbsolutePath, signatureBuffer, { flag: "wx" });
    } catch (err) {
        await unlink(signatureAbsolutePath).catch(() => undefined);
        throw err;
    }

    let result;
    try {
        result = await prisma.$transaction(async (tx) => {
        // Kunci baris approval selama transaksi agar dua TTD konkuren untuk
        // peran yang sama tidak sama-sama lolos cek duplikat (tanpa migrasi schema).
        await tx.$queryRaw`SELECT id FROM cleaning_monthly_approvals WHERE id = ${data.approvalId} FOR UPDATE`;
        const employee = await getValidatedInternalEmployee(tx, session.employeeId!, wibToday);

        const approval = await tx.cleaningMonthlyApproval.findUnique({
            where: { id: data.approvalId },
            include: {
                signatures: true,
            },
        });
        if (!approval) {
            throw new CleaningError("Periode persetujuan tidak ditemukan.", 404);
        }

        // Tegakkan lagi di dalam transaksi (antisipasi lewat tengah malam WIB).
        assertMonthSignable(approval.monthWib, data.role, toWIBDateString(new Date()));

        const assignedEmployeeId =
            data.role === "INSPECTED_BY"
                ? approval.inspectedByEmployeeId
                : approval.knownByEmployeeId;

        if (assignedEmployeeId !== employee.employeeId) {
            throw new CleaningError("Anda tidak ditugaskan untuk menandatangani peran ini.", 403);
        }

        const activeSig = approval.signatures.find(
            (s) => s.role === data.role && s.status === "SIGNED"
        );
        if (activeSig) {
            throw new CleaningError("Peran ini sudah ditandatangani.", 409);
        }

        const roleSignatures = approval.signatures.filter((s) => s.role === data.role);
        const maxVersion = roleSignatures.reduce((max, s) => Math.max(max, s.version), 0);
        const nextVersion = maxVersion + 1;

        const signature = await tx.cleaningMonthlyApprovalSignature.create({
            data: {
                approvalId: approval.id,
                role: data.role,
                version: nextVersion,
                employeeId: employee.employeeId,
                employeeNameSnapshot: employee.name,
                signaturePayload: "",
                signaturePath: signatureRelativePath,
                status: "SIGNED",
                signedAt: new Date(),
            },
        });

        await tx.auditLog.create({
            data: {
                action: "SIGN_CLEANING_APPROVAL",
                entity: "CLEANING_APPROVAL",
                entityId: approval.id,
                actorType: "USER",
                actorUserId: session.userId,
                actorIdentifier: session.username,
                actorName: session.name,
                actorRole: session.primaryRole,
                details: JSON.stringify({
                    signatureId: signature.id,
                    role: data.role,
                    version: nextVersion,
                    employeeId: employee.employeeId,
                    monthWib: approval.monthWib,
                    roomId: approval.roomId,
                }),
            },
        });

        const otherRole = data.role === "INSPECTED_BY" ? "KNOWN_BY" : "INSPECTED_BY";
        const otherSig = approval.signatures.find(
            (s) => s.role === otherRole && s.status === "SIGNED"
        );
        const inspectedSig = data.role === "INSPECTED_BY" ? signature : otherSig;
        const knownSig = data.role === "KNOWN_BY" ? signature : otherSig;
        const derivedStatus = deriveApprovalStatus(inspectedSig, knownSig);

        const latestChange = await getLatestChecklistChange(tx, approval.roomId, approval.monthWib);

        const responseData = {
            success: true,
            signatureId: signature.id,
            role: signature.role,
            version: signature.version,
            signedAt: signature.signedAt,
            derivedStatus,
            latestChange,
            hasChangedAfterSigning: latestChange ? signature.signedAt < latestChange.timestamp : false,
        };

        if (data.idempotencyKey) {
            await tx.cleaningApprovalIdempotency.create({
                data: {
                    actorId: session.userId,
                    endpointScope: "employee_sign_cleaning_approval",
                    idempotencyKey: data.idempotencyKey,
                    requestHash,
                    responsePayload: JSON.stringify(responseData),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                },
            });
        }

        return responseData;
        });
    } catch (err) {
        // Bersihkan berkas yatim bila transaksi DB gagal (abaikan bila sudah tidak ada).
        try {
            await unlink(signatureAbsolutePath);
        } catch (unlinkErr) {
            if ((unlinkErr as NodeJS.ErrnoException)?.code !== "ENOENT") {
                logger.warn("Cleaning signature cleanup failed", {
                    approvalId: data.approvalId,
                    role: data.role,
                    signaturePath: signatureRelativePath,
                    error: unlinkErr,
                });
            }
        }
        throw err;
    }

    return result;
}

export async function getGaApprovalDetail(
    session: SessionPayload,
    roomId: string,
    monthWib: string
) {
    await requireWig002OrTopViewer(session);
    validateMonthWib(monthWib);

    const room = await prisma.cleaningRoom.findUnique({
        where: { id: roomId },
        select: { id: true, name: true, isActive: true },
    });
    if (!room) {
        throw new CleaningError("Ruangan tidak ditemukan.", 404);
    }

    const approval = await prisma.cleaningMonthlyApproval.findUnique({
        where: {
            roomId_monthWib: {
                roomId,
                monthWib,
            },
        },
        include: {
            inspectedByEmployee: {
                select: { id: true, employeeId: true, name: true, isActive: true },
            },
            knownByEmployee: {
                select: { id: true, employeeId: true, name: true, isActive: true },
            },
            signatures: {
                orderBy: { createdAt: "desc" },
                include: {
                    reopenedByUser: {
                        select: { id: true, displayName: true, username: true },
                    },
                },
            },
        },
    });

    const latestChange = await getLatestChecklistChange(prisma, roomId, monthWib);

    if (!approval) {
        return {
            status: "UNOPENED" as const,
            roomId: room.id,
            roomName: room.name,
            monthWib,
            latestChange,
            approval: null,
            signable: getMonthSignInfo(monthWib, toWIBDateString(new Date())),
        };
    }

    const activeInspectedSig = approval.signatures.find(
        (s) => s.role === "INSPECTED_BY" && s.status === "SIGNED"
    );
    const activeKnownSig = approval.signatures.find(
        (s) => s.role === "KNOWN_BY" && s.status === "SIGNED"
    );
    const derivedStatus = deriveApprovalStatus(activeInspectedSig, activeKnownSig);

    const daysInMonth = getDaysInMonth(monthWib);
    const dates = Array.from({ length: daysInMonth }, (_, i) => {
        const day = String(i + 1).padStart(2, "0");
        return `${monthWib}-${day}`;
    });

    const detailRange = monthWibDateRange(monthWib);
    const checklists = await prisma.cleaningDailyChecklist.findMany({
        where: {
            roomId,
            wibDate: { gte: detailRange.gte, lt: detailRange.lt },
        },
        include: {
            items: {
                select: { isActive: true, isComplete: true },
            },
        },
    });

    const clMap = new Map(checklists.map((c) => [c.wibDate, c]));
    const wibToday = toWIBDateString(new Date());
    const { getCleaningWeeklyOffDays } = await import("@/lib/services/appSettingsService");
    const { isWibDateInWeeklyOffDays } = await import("@/lib/services/cleaningParafService");
    const [gaHolidays, gaWeeklyOff] = await Promise.all([
        prisma.cleaningHoliday.findMany({
            where: { wibDate: { gte: detailRange.gte, lt: detailRange.lt } },
            select: { wibDate: true },
        }),
        getCleaningWeeklyOffDays().catch(() => [0, 6]),
    ]);
    const gaHolidaySet = new Set(gaHolidays.map((h) => h.wibDate));

    const days = dates.map((date) => {
        const cl = clMap.get(date);
        const isFuture = date > wibToday;
        if (isFuture) {
            return { date, status: "FUTURE" as const, activeCount: 0, completedCount: 0 };
        }
        if (gaHolidaySet.has(date) || isWibDateInWeeklyOffDays(date, gaWeeklyOff)) {
            return { date, status: "LIBUR" as const, activeCount: 0, completedCount: 0 };
        }
        if (!cl) {
            return { date, status: "BELUM" as const, activeCount: 0, completedCount: 0 };
        }
        const activeItems = cl.items.filter((i) => i.isActive);
        const completedItems = activeItems.filter((i) => i.isComplete);
        const status = activeItems.length > 0 && activeItems.length === completedItems.length ? "SELESAI" : "BELUM";
        return {
            date,
            status,
            activeCount: activeItems.length,
            completedCount: completedItems.length,
        };
    });

    const [inspectedPayload, knownPayload] = await Promise.all([
        activeInspectedSig ? resolveSignatureDataUrl(activeInspectedSig) : Promise.resolve(null),
        activeKnownSig ? resolveSignatureDataUrl(activeKnownSig) : Promise.resolve(null),
    ]);
    // Riwayat tanpa payload gambar (UI hanya tampilkan teks versi/status) —
    // payload aktif tersedia di slot inspectedBy/knownBy di atas.
    const history = approval.signatures.map((s) => ({
        id: s.id,
        role: s.role,
        version: s.version,
        employeeId: s.employeeId,
        employeeName: s.employeeNameSnapshot,
        status: s.status,
        signedAt: s.signedAt,
        reopenedAt: s.reopenedAt,
        reopenReason: s.reopenReason,
        reopenedByName: s.reopenedByUser?.displayName ?? null,
        signaturePayload: null as string | null,
    }));

    return {
        id: approval.id,
        status: derivedStatus,
        roomId: approval.roomId,
        roomName: approval.roomNameSnapshot,
        monthWib: approval.monthWib,
        dates,
        days,
        inspectedBy: {
            employeeId: approval.inspectedByEmployeeId,
            employeeName: approval.inspectedByEmployee.name,
            isActive: approval.inspectedByEmployee.isActive,
            signature: activeInspectedSig
                ? {
                      id: activeInspectedSig.id,
                      version: activeInspectedSig.version,
                      signedAt: activeInspectedSig.signedAt,
                      signaturePayload: inspectedPayload,
                      hasChangedAfter: latestChange ? activeInspectedSig.signedAt < latestChange.timestamp : false,
                  }
                : null,
        },
        knownBy: {
            employeeId: approval.knownByEmployeeId,
            employeeName: approval.knownByEmployee.name,
            isActive: approval.knownByEmployee.isActive,
            signature: activeKnownSig
                ? {
                      id: activeKnownSig.id,
                      version: activeKnownSig.version,
                      signedAt: activeKnownSig.signedAt,
                      signaturePayload: knownPayload,
                      hasChangedAfter: latestChange ? activeKnownSig.signedAt < latestChange.timestamp : false,
                  }
                : null,
        },
        latestChange,
        history,
        createdAt: approval.createdAt,
        updatedAt: approval.updatedAt,
        signable: getMonthSignInfo(approval.monthWib, toWIBDateString(new Date())),
    };
}

export async function listGaApprovals(
    session: SessionPayload,
    query: {
        monthWib?: string;
        roomId?: string;
        status?: string;
        page?: number;
        limit?: number;
    }
) {
    await requireWig002OrTopViewer(session);
    const monthWib = query.monthWib || toWIBDateString(new Date()).substring(0, 7);
    validateMonthWib(monthWib);

    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CleaningMonthlyApprovalWhereInput = {
        monthWib,
        ...(query.roomId ? { roomId: query.roomId } : {}),
    };

    // Ambil semua kandidat dulu (tanpa skip/take): status turunan dihitung
    // dari signatures di memori, sehingga filter status wajib sebelum paging
    // agar total/halaman konsisten. latestChange di-batch 1 query per bulan.
    const rawApprovals = await prisma.cleaningMonthlyApproval.findMany({
        where,
        include: {
            inspectedByEmployee: {
                select: { employeeId: true, name: true, isActive: true },
            },
            knownByEmployee: {
                select: { employeeId: true, name: true, isActive: true },
            },
            signatures: {
                where: { status: "SIGNED" },
            },
        },
        orderBy: [{ monthWib: "desc" }, { roomNameSnapshot: "asc" }, { id: "asc" }],
    });

    const latestChangeByRoom = await getLatestChecklistChangeMap(
        prisma,
        [...new Set(rawApprovals.map((approval) => approval.roomId))],
        monthWib
    );

    const listSignInfo = getMonthSignInfo(monthWib, toWIBDateString(new Date()));

    const mapped = rawApprovals.map((approval) => {
        const inspectedSig = approval.signatures.find((s) => s.role === "INSPECTED_BY");
        const knownSig = approval.signatures.find((s) => s.role === "KNOWN_BY");
        const derivedStatus = deriveApprovalStatus(inspectedSig, knownSig);
        const latestChange = latestChangeByRoom.get(approval.roomId) ?? null;

        return {
            id: approval.id,
            roomId: approval.roomId,
            roomName: approval.roomNameSnapshot,
            monthWib: approval.monthWib,
            derivedStatus,
            inspectedBy: {
                employeeId: approval.inspectedByEmployeeId,
                employeeName: approval.inspectedByEmployee.name,
                isActive: approval.inspectedByEmployee.isActive,
                signedAt: inspectedSig?.signedAt ?? null,
                hasChangedAfter: inspectedSig && latestChange ? inspectedSig.signedAt < latestChange.timestamp : false,
            },
            knownBy: {
                employeeId: approval.knownByEmployeeId,
                employeeName: approval.knownByEmployee.name,
                isActive: approval.knownByEmployee.isActive,
                signedAt: knownSig?.signedAt ?? null,
                hasChangedAfter: knownSig && latestChange ? knownSig.signedAt < latestChange.timestamp : false,
            },
            latestChange,
            createdAt: approval.createdAt,
            updatedAt: approval.updatedAt,
            isSignable: listSignInfo.isSignable,
            opensOnWibDate: listSignInfo.opensOnWibDate,
        };
    });

    const filtered = query.status && query.status !== "ALL"
        ? mapped.filter((a) => a.derivedStatus === query.status)
        : mapped;
    const total = filtered.length;
    const data = filtered.slice(skip, skip + limit);

    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

export async function listEmployeeApprovalTasks(
    session: SessionPayload,
    query: {
        monthWib?: string;
        status?: string;
        page?: number;
        limit?: number;
    }
) {
    if (!session.employeeId) {
        throw new CleaningError("Akun Anda tidak terhubung dengan data karyawan.", 403);
    }
    if (!session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
        throw new CleaningError("Anda tidak memiliki izin employee.self.", 403);
    }

    if (query.monthWib) {
        validateMonthWib(query.monthWib);
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CleaningMonthlyApprovalWhereInput = {
        ...(query.monthWib ? { monthWib: query.monthWib } : {}),
        OR: [
            { inspectedByEmployeeId: session.employeeId },
            { knownByEmployeeId: session.employeeId },
        ],
    };

    // Ambil semua kandidat dulu: filter status + paging di level task agar
    // total konsisten (1 approval = 1-2 task). latestChange di-batch per bulan.
    const approvals = await prisma.cleaningMonthlyApproval.findMany({
        where,
        include: {
            signatures: {
                where: { status: "SIGNED" },
                orderBy: { createdAt: "desc" },
            },
        },
        orderBy: [{ monthWib: "desc" }, { roomNameSnapshot: "asc" }, { id: "asc" }],
    });

    const roomIdsByMonth = new Map<string, string[]>();
    for (const app of approvals) {
        const list = roomIdsByMonth.get(app.monthWib) ?? [];
        list.push(app.roomId);
        roomIdsByMonth.set(app.monthWib, list);
    }
    const latestChangeByKey = new Map<string, { timestamp: Date; actorName: string | null }>();
    await Promise.all(
        [...roomIdsByMonth.entries()].map(async ([monthWib, roomIds]) => {
            const monthMap = await getLatestChecklistChangeMap(
                prisma,
                [...new Set(roomIds)],
                monthWib
            );
            for (const [roomId, change] of monthMap) {
                latestChangeByKey.set(`${roomId}|${monthWib}`, change);
            }
        })
    );

    const tasks: Array<{
        approvalId: string;
        roomId: string;
        roomName: string;
        monthWib: string;
        role: "INSPECTED_BY" | "KNOWN_BY";
        roleLabel: string;
        isSigned: boolean;
        signedAt: Date | null;
        derivedStatus: ApprovalDerivedStatus;
        hasChangedAfterSigning: boolean;
        latestChange: { timestamp: Date; actorName: string | null } | null;
        isSignable: boolean;
        opensOnWibDate: string;
    }> = [];

    const tasksWibToday = toWIBDateString(new Date());

    for (const app of approvals) {
        const rolesToProcess: Array<"INSPECTED_BY" | "KNOWN_BY"> = [];
        if (app.inspectedByEmployeeId === session.employeeId) rolesToProcess.push("INSPECTED_BY");
        if (app.knownByEmployeeId === session.employeeId) rolesToProcess.push("KNOWN_BY");

        const latestChange = latestChangeByKey.get(`${app.roomId}|${app.monthWib}`) ?? null;
        const insp = app.signatures.find((s) => s.role === "INSPECTED_BY");
        const kno = app.signatures.find((s) => s.role === "KNOWN_BY");
        const derivedStatus = deriveApprovalStatus(insp, kno);
        const signInfo = getMonthSignInfo(app.monthWib, tasksWibToday);

        for (const role of rolesToProcess) {
            const activeSig = role === "INSPECTED_BY" ? insp : kno;
            const isSigned = Boolean(activeSig);
            const signedAt = activeSig?.signedAt ?? null;
            const hasChangedAfterSigning = Boolean(
                activeSig && latestChange && activeSig.signedAt < latestChange.timestamp
            );

            tasks.push({
                approvalId: app.id,
                roomId: app.roomId,
                roomName: app.roomNameSnapshot,
                monthWib: app.monthWib,
                role,
                roleLabel: role === "INSPECTED_BY" ? "Diperiksa Oleh" : "Mengetahui",
                isSigned,
                signedAt,
                derivedStatus,
                hasChangedAfterSigning,
                latestChange,
                isSignable: signInfo.isSignable,
                opensOnWibDate: signInfo.opensOnWibDate,
            });
        }
    }

    const filteredTasks = query.status === "PENDING"
        ? tasks.filter((t) => !t.isSigned)
        : query.status === "SIGNED"
            ? tasks.filter((t) => t.isSigned)
            : tasks;
    const total = filteredTasks.length;

    return {
        data: filteredTasks.slice(skip, skip + limit),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

export async function getEmployeeApprovalDetail(
    session: SessionPayload,
    approvalId: string
) {
    if (!session.employeeId) {
        throw new CleaningError("Akun Anda tidak terhubung dengan data karyawan.", 403);
    }
    if (!session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
        throw new CleaningError("Anda tidak memiliki izin employee.self.", 403);
    }

    const approval = await prisma.cleaningMonthlyApproval.findUnique({
        where: { id: approvalId },
        include: {
            inspectedByEmployee: {
                select: { employeeId: true, name: true },
            },
            knownByEmployee: {
                select: { employeeId: true, name: true },
            },
            signatures: {
                orderBy: { createdAt: "desc" },
            },
        },
    });

    if (!approval) {
        throw new CleaningError("Periode persetujuan tidak ditemukan.", 404);
    }

    const isAssigned =
        approval.inspectedByEmployeeId === session.employeeId ||
        approval.knownByEmployeeId === session.employeeId;

    if (!isAssigned) {
        throw new CleaningError("Anda tidak memiliki akses ke periode persetujuan ini.", 403);
    }

    // Kedua peran ditampilkan ke reviewer yang ditugaskan — INSPECTED_BY dan
    // KNOWN_BY wajib bisa saling melihat TTD, status, dan riwayat satu sama lain.
    const userRoles: Array<"INSPECTED_BY" | "KNOWN_BY"> = ["INSPECTED_BY", "KNOWN_BY"];

    const latestChange = await getLatestChecklistChange(prisma, approval.roomId, approval.monthWib);

    // Matrix summary
    const daysInMonth = getDaysInMonth(approval.monthWib);
    const dates = Array.from({ length: daysInMonth }, (_, i) => {
        const day = String(i + 1).padStart(2, "0");
        return `${approval.monthWib}-${day}`;
    });

    const empDetailRange = monthWibDateRange(approval.monthWib);
    const checklists = await prisma.cleaningDailyChecklist.findMany({
        where: {
            roomId: approval.roomId,
            wibDate: { gte: empDetailRange.gte, lt: empDetailRange.lt },
        },
        include: {
            items: {
                select: { isActive: true, isComplete: true },
            },
        },
    });

    const clMap = new Map(checklists.map((c) => [c.wibDate, c]));
    const wibToday = toWIBDateString(new Date());
    const { getCleaningWeeklyOffDays } = await import("@/lib/services/appSettingsService");
    const { isWibDateInWeeklyOffDays } = await import("@/lib/services/cleaningParafService");
    const [empHolidays, empWeeklyOff] = await Promise.all([
        prisma.cleaningHoliday.findMany({
            where: { wibDate: { gte: empDetailRange.gte, lt: empDetailRange.lt } },
            select: { wibDate: true },
        }),
        getCleaningWeeklyOffDays().catch(() => [0, 6]),
    ]);
    const empHolidaySet = new Set(empHolidays.map((h) => h.wibDate));

    const days = dates.map((date) => {
        const cl = clMap.get(date);
        const isFuture = date > wibToday;
        if (isFuture) {
            return { date, status: "FUTURE" as const, activeCount: 0, completedCount: 0 };
        }
        if (empHolidaySet.has(date) || isWibDateInWeeklyOffDays(date, empWeeklyOff)) {
            return { date, status: "LIBUR" as const, activeCount: 0, completedCount: 0 };
        }
        if (!cl) {
            return { date, status: "BELUM" as const, activeCount: 0, completedCount: 0 };
        }
        const activeItems = cl.items.filter((i) => i.isActive);
        const completedItems = activeItems.filter((i) => i.isComplete);
        const status = activeItems.length > 0 && activeItems.length === completedItems.length ? "SELESAI" : "BELUM";
        return {
            date,
            status,
            activeCount: activeItems.length,
            completedCount: completedItems.length,
        };
    });

    const insp = approval.signatures.find((s) => s.role === "INSPECTED_BY" && s.status === "SIGNED");
    const kno = approval.signatures.find((s) => s.role === "KNOWN_BY" && s.status === "SIGNED");
    const derivedStatus = deriveApprovalStatus(insp, kno);

    const rolesDetail = await Promise.all(
        userRoles.map(async (role) => {
            const activeSig = approval.signatures.find(
                (s) => s.role === role && s.status === "SIGNED"
            );
            return {
                role,
                roleLabel: role === "INSPECTED_BY" ? "Diperiksa Oleh" : "Mengetahui",
                isSigned: Boolean(activeSig),
                signature: activeSig
                    ? {
                          id: activeSig.id,
                          version: activeSig.version,
                          signedAt: activeSig.signedAt,
                          signaturePayload: await resolveSignatureDataUrl(activeSig),
                          hasChangedAfter: latestChange ? activeSig.signedAt < latestChange.timestamp : false,
                      }
                    : null,
            };
        })
    );

    return {
        id: approval.id,
        roomId: approval.roomId,
        roomName: approval.roomNameSnapshot,
        monthWib: approval.monthWib,
        dates,
        days,
        inspectedByEmployeeName: approval.inspectedByEmployee.name,
        knownByEmployeeName: approval.knownByEmployee.name,
        userRoles: rolesDetail,
        derivedStatus,
        latestChange,
        signable: getMonthSignInfo(approval.monthWib, wibToday),
    };
}

export async function getCleaningPdfExportData(
    session: SessionPayload,
    roomId: string,
    monthWib: string
) {
    if (isWig002(session)) {
        // WIG002 boleh mengekspor semua ruangan.
    } else if (await isCleaningTopViewer(session).catch(() => false)) {
        // Atasan tertinggi viewer boleh mengekspor semua ruangan (baca).
    } else {
        if (!session.employeeId || !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
            throw new CleaningError("Anda tidak memiliki akses untuk mengekspor PDF persetujuan.", 403);
        }
        const review = await prisma.cleaningMonthlyApproval.findFirst({
            where: {
                roomId,
                monthWib: monthWib.slice(0, 7),
                OR: [
                    { inspectedByEmployeeId: session.employeeId },
                    { knownByEmployeeId: session.employeeId },
                ],
            },
            select: { id: true },
        });
        if (!review) {
            throw new CleaningError("Anda tidak memiliki akses untuk mengekspor PDF persetujuan.", 403);
        }
    }
    validateMonthWib(monthWib);

    const room = await prisma.cleaningRoom.findUnique({
        where: { id: roomId },
        include: {
            template: {
                include: {
                    items: {
                        where: { isActive: true },
                        orderBy: { sortOrder: "asc" },
                    },
                },
            },
        },
    });
    if (!room) {
        throw new CleaningError("Ruangan tidak ditemukan.", 404);
    }

    const daysInMonth = getDaysInMonth(monthWib);
    const wibToday = toWIBDateString(new Date());
    if (monthWib > wibToday.slice(0, 7)) {
        throw new CleaningError("Tidak dapat mengekspor PDF untuk bulan mendatang.", 422);
    }

    const approval = await prisma.cleaningMonthlyApproval.findUnique({
        where: {
            roomId_monthWib: {
                roomId,
                monthWib,
            },
        },
        include: {
            inspectedByEmployee: {
                select: { employeeId: true, name: true, positionRel: { select: { name: true } } },
            },
            knownByEmployee: {
                select: { employeeId: true, name: true, positionRel: { select: { name: true } } },
            },
            signatures: {
                where: { status: "SIGNED" },
            },
        },
    });

    const activeInspectedSig = approval?.signatures.find((s) => s.role === "INSPECTED_BY");
    const activeKnownSig = approval?.signatures.find((s) => s.role === "KNOWN_BY");

    const monthRange = monthWibDateRange(monthWib);
    const checklists = await prisma.cleaningDailyChecklist.findMany({
        where: {
            roomId,
            wibDate: { gte: monthRange.gte, lt: monthRange.lt },
        },
        include: {
            items: {
                select: {
                    templateItemId: true,
                    itemNameSnapshot: true,
                    isActive: true,
                    isComplete: true,
                },
            },
        },
    });

    const checklistMap = new Map<string, typeof checklists[number]>();
    for (const cl of checklists) {
        checklistMap.set(cl.wibDate, cl);
    }

    const templateItems = room.template.items;

    const dates = Array.from({ length: daysInMonth }, (_, i) => {
        const day = String(i + 1).padStart(2, "0");
        return `${monthWib}-${day}`;
    });

    const matrix = templateItems.map((item) => {
        const days = dates.map((date, idx) => {
            const cl = checklistMap.get(date);
            const isFuture = date > wibToday;
            if (isFuture) {
                return { day: idx + 1, isComplete: false, isFuture: true };
            }
            if (!cl) {
                return { day: idx + 1, isComplete: false, isFuture: false };
            }
            const snapshotItem = cl.items.find(
                (ci) => ci.templateItemId === item.id
            );
            const isComplete = Boolean(snapshotItem && snapshotItem.isActive && snapshotItem.isComplete);
            return { day: idx + 1, isComplete, isFuture: false };
        });

        return {
            itemId: item.id,
            itemName: item.name,
            sortOrder: item.sortOrder,
            days,
        };
    });

    const latestChange = await getLatestChecklistChange(prisma, roomId, monthWib);

    // Dual-read untuk PDF: path disk baru diutamakan, payload base64 lama sebagai fallback.
    const [inspectedPayload, knownPayload] = await Promise.all([
        activeInspectedSig ? resolveSignatureDataUrl(activeInspectedSig) : Promise.resolve(null),
        activeKnownSig ? resolveSignatureDataUrl(activeKnownSig) : Promise.resolve(null),
    ]);

    return {
        roomId: room.id,
        roomName: room.name,
        monthWib,
        daysInMonth,
        items: templateItems.map((ti) => ({ id: ti.id, name: ti.name, sortOrder: ti.sortOrder })),
        matrix,
        inspectedBy: {
            employeeName: approval?.inspectedByEmployee.name ?? "-",
            employeeId: approval?.inspectedByEmployeeId ?? "-",
            position: approval?.inspectedByEmployee.positionRel?.name ?? null,
            signedAt: activeInspectedSig?.signedAt ? activeInspectedSig.signedAt.toISOString() : null,
            signaturePayload: inspectedPayload,
            signaturePath: activeInspectedSig?.signaturePath ?? null,
        },
        knownBy: {
            employeeName: approval?.knownByEmployee.name ?? "-",
            employeeId: approval?.knownByEmployeeId ?? "-",
            position: approval?.knownByEmployee.positionRel?.name ?? null,
            signedAt: activeKnownSig?.signedAt ? activeKnownSig.signedAt.toISOString() : null,
            signaturePayload: knownPayload,
            signaturePath: activeKnownSig?.signaturePath ?? null,
        },
        latestChange: latestChange
            ? {
                  timestamp: latestChange.timestamp.toISOString(),
                  actorName: latestChange.actorName,
              }
            : null,
    };
}
