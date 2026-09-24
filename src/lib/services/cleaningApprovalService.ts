import { prisma } from "@/lib/prisma";
import { toWIBDateString } from "@/lib/timezone";
import { PERMISSIONS } from "@/lib/permissions";
import { isWig002, CleaningError } from "@/lib/services/cleaningService";
import type { SessionPayload } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import crypto from "node:crypto";

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
    return new Date(year, m, 0).getDate();
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

export function validateSignaturePayload(payload: string): Buffer {
    if (typeof payload !== "string" || !payload.startsWith("data:image/png;base64,")) {
        throw new CleaningError("Format tanda tangan tidak valid. Harus berupa PNG data URL.", 400);
    }
    const base64Data = payload.replace(/^data:image\/png;base64,/, "");
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
        throw new CleaningError("Karakter base64 pada tanda tangan tidak valid.", 400);
    }
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > 256 * 1024) {
        throw new CleaningError("Ukuran tanda tangan melebihi batas 256 KB.", 413);
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
            const currentEmployee = await tx.employee.findFirst({
                where: {
                    employeeId: newEmployeeId,
                    isActive: true,
                    userAccount: { isActive: true },
                },
            });
            if (!currentEmployee) {
                throw new CleaningError(
                    "Karyawan saat ini tidak aktif. Wajib menyertakan karyawan pengganti yang aktif.",
                    422
                );
            }
        }

        const activeSig = approval.signatures[0];
        if (activeSig) {
            await tx.cleaningMonthlyApprovalSignature.update({
                where: { id: activeSig.id },
                data: {
                    status: "REOPENED",
                    reopenedAt: new Date(),
                    reopenedByUserId: session.userId,
                    reopenReason: trimmedReason,
                },
            });
        }

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

    validateSignaturePayload(data.signaturePayload);

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

    const result = await prisma.$transaction(async (tx) => {
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
                signaturePayload: data.signaturePayload,
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

    return result;
}

export async function getGaApprovalDetail(
    session: SessionPayload,
    roomId: string,
    monthWib: string
) {
    requireWig002(session);
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

    const checklists = await prisma.cleaningDailyChecklist.findMany({
        where: {
            roomId,
            wibDate: { startsWith: monthWib },
        },
        include: {
            items: {
                select: { isActive: true, isComplete: true },
            },
        },
    });

    const clMap = new Map(checklists.map((c) => [c.wibDate, c]));
    const wibToday = toWIBDateString(new Date());

    const days = dates.map((date) => {
        const cl = clMap.get(date);
        const isFuture = date > wibToday;
        if (isFuture) {
            return { date, status: "FUTURE" as const, activeCount: 0, completedCount: 0 };
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
                      signaturePayload: activeInspectedSig.signaturePayload,
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
                      signaturePayload: activeKnownSig.signaturePayload,
                      hasChangedAfter: latestChange ? activeKnownSig.signedAt < latestChange.timestamp : false,
                  }
                : null,
        },
        latestChange,
        history: approval.signatures.map((s) => ({
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
            signaturePayload: s.signaturePayload,
        })),
        createdAt: approval.createdAt,
        updatedAt: approval.updatedAt,
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
    requireWig002(session);
    const monthWib = query.monthWib || toWIBDateString(new Date()).substring(0, 7);
    validateMonthWib(monthWib);

    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CleaningMonthlyApprovalWhereInput = {
        monthWib,
        ...(query.roomId ? { roomId: query.roomId } : {}),
    };

    const [total, rawApprovals] = await Promise.all([
        prisma.cleaningMonthlyApproval.count({ where }),
        prisma.cleaningMonthlyApproval.findMany({
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
            skip,
            take: limit,
        }),
    ]);

    const mapped = await Promise.all(
        rawApprovals.map(async (approval) => {
            const inspectedSig = approval.signatures.find((s) => s.role === "INSPECTED_BY");
            const knownSig = approval.signatures.find((s) => s.role === "KNOWN_BY");
            const derivedStatus = deriveApprovalStatus(inspectedSig, knownSig);
            const latestChange = await getLatestChecklistChange(prisma, approval.roomId, approval.monthWib);

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
            };
        })
    );

    const filtered = query.status && query.status !== "ALL"
        ? mapped.filter((a) => a.derivedStatus === query.status)
        : mapped;

    return {
        data: filtered,
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

    const [total, approvals] = await Promise.all([
        prisma.cleaningMonthlyApproval.count({ where }),
        prisma.cleaningMonthlyApproval.findMany({
            where,
            include: {
                signatures: {
                    where: { employeeId: session.employeeId },
                    orderBy: { createdAt: "desc" },
                },
            },
            orderBy: [{ monthWib: "desc" }, { roomNameSnapshot: "asc" }, { id: "asc" }],
            skip,
            take: limit,
        }),
    ]);

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
    }> = [];

    for (const app of approvals) {
        const rolesToProcess: Array<"INSPECTED_BY" | "KNOWN_BY"> = [];
        if (app.inspectedByEmployeeId === session.employeeId) rolesToProcess.push("INSPECTED_BY");
        if (app.knownByEmployeeId === session.employeeId) rolesToProcess.push("KNOWN_BY");

        const latestChange = await getLatestChecklistChange(prisma, app.roomId, app.monthWib);

        for (const role of rolesToProcess) {
            const activeSig = app.signatures.find(
                (s) => s.role === role && s.status === "SIGNED"
            );
            const isSigned = Boolean(activeSig);
            const signedAt = activeSig?.signedAt ?? null;
            const hasChangedAfterSigning = Boolean(
                activeSig && latestChange && activeSig.signedAt < latestChange.timestamp
            );

            // Fetch overall derived status
            const allSignedSigs = await prisma.cleaningMonthlyApprovalSignature.findMany({
                where: { approvalId: app.id, status: "SIGNED" },
            });
            const insp = allSignedSigs.find((s) => s.role === "INSPECTED_BY");
            const kno = allSignedSigs.find((s) => s.role === "KNOWN_BY");
            const derivedStatus = deriveApprovalStatus(insp, kno);

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
            });
        }
    }

    const filteredTasks = query.status === "PENDING"
        ? tasks.filter((t) => !t.isSigned)
        : query.status === "SIGNED"
            ? tasks.filter((t) => t.isSigned)
            : tasks;

    return {
        data: filteredTasks,
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
                where: { employeeId: session.employeeId },
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

    const userRoles: Array<"INSPECTED_BY" | "KNOWN_BY"> = [];
    if (approval.inspectedByEmployeeId === session.employeeId) userRoles.push("INSPECTED_BY");
    if (approval.knownByEmployeeId === session.employeeId) userRoles.push("KNOWN_BY");

    const latestChange = await getLatestChecklistChange(prisma, approval.roomId, approval.monthWib);

    // Matrix summary
    const daysInMonth = getDaysInMonth(approval.monthWib);
    const dates = Array.from({ length: daysInMonth }, (_, i) => {
        const day = String(i + 1).padStart(2, "0");
        return `${approval.monthWib}-${day}`;
    });

    const checklists = await prisma.cleaningDailyChecklist.findMany({
        where: {
            roomId: approval.roomId,
            wibDate: { startsWith: approval.monthWib },
        },
        include: {
            items: {
                select: { isActive: true, isComplete: true },
            },
        },
    });

    const clMap = new Map(checklists.map((c) => [c.wibDate, c]));
    const wibToday = toWIBDateString(new Date());

    const days = dates.map((date) => {
        const cl = clMap.get(date);
        const isFuture = date > wibToday;
        if (isFuture) {
            return { date, status: "FUTURE" as const, activeCount: 0, completedCount: 0 };
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

    const allSigned = await prisma.cleaningMonthlyApprovalSignature.findMany({
        where: { approvalId: approval.id, status: "SIGNED" },
    });
    const insp = allSigned.find((s) => s.role === "INSPECTED_BY");
    const kno = allSigned.find((s) => s.role === "KNOWN_BY");
    const derivedStatus = deriveApprovalStatus(insp, kno);

    const rolesDetail = userRoles.map((role) => {
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
                      signaturePayload: activeSig.signaturePayload,
                      hasChangedAfter: latestChange ? activeSig.signedAt < latestChange.timestamp : false,
                  }
                : null,
        };
    });

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
    };
}

export async function getCleaningPdfExportData(
    session: SessionPayload,
    roomId: string,
    monthWib: string
) {
    if (!isWig002(session) && !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
        throw new CleaningError("Anda tidak memiliki akses untuk mengekspor PDF persetujuan.", 403);
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

    const checklists = await prisma.cleaningDailyChecklist.findMany({
        where: {
            roomId,
            wibDate: { startsWith: monthWib },
        },
        include: {
            items: true,
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
                (ci) => ci.templateItemId === item.id || ci.itemNameSnapshot.trim().toLowerCase() === item.nameNormalized
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
            position: approval?.inspectedByEmployee.positionRel?.name ?? "Manager",
            signedAt: activeInspectedSig?.signedAt ? activeInspectedSig.signedAt.toISOString() : null,
            signaturePayload: activeInspectedSig?.signaturePayload ?? null,
        },
        knownBy: {
            employeeName: approval?.knownByEmployee.name ?? "-",
            employeeId: approval?.knownByEmployeeId ?? "-",
            position: approval?.knownByEmployee.positionRel?.name ?? "Direksi",
            signedAt: activeKnownSig?.signedAt ? activeKnownSig.signedAt.toISOString() : null,
            signaturePayload: activeKnownSig?.signaturePayload ?? null,
        },
        latestChange: latestChange
            ? {
                  timestamp: latestChange.timestamp.toISOString(),
                  actorName: latestChange.actorName,
              }
            : null,
    };
}
