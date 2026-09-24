import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    CLEANING_IDS,
    makeRoom,
    makeWig002Session,
    makeWorkerSession,
    makeEmployeeSession,
    VALID_PNG_SIGNATURE,
} from "../fixtures/cleaning";

const auditMocks = vi.hoisted(() => ({
    actorFromSession: vi.fn((session: { userId: string; username: string }) => ({
        userId: session.userId,
        identifier: session.username,
    })),
    logAction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        cleaningRoom: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
        },
        cleaningDailyChecklist: {
            findMany: vi.fn(),
        },
        cleaningMonthlyApproval: {
            findUnique: vi.fn(),
            findUniqueOrThrow: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        cleaningMonthlyApprovalSignature: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        cleaningApprovalIdempotency: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
        employee: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

vi.mock("@/lib/services/auditService", () => auditMocks);
vi.mock("@/lib/logger", () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { prisma } from "@/lib/prisma";
import {
    validateMonthWib,
    deriveApprovalStatus,
    validateSignaturePayload,
    openApprovalPeriod,
    signApprovalPeriod,
    reopenApprovalSlot,
    getCleaningPdfExportData,
} from "@/lib/services/cleaningApprovalService";
import { CleaningError } from "@/lib/services/cleaningService";

describe("Monthly Cleaning Approvals Service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("AC-1 and AC-2: Authorization and Period Opening", () => {
        it("AC-1: rejects non-WIG002 sessions from opening periods", async () => {
            const workerSession = makeWorkerSession();
            await expect(
                openApprovalPeriod(workerSession, {
                    roomId: CLEANING_IDS.room,
                    monthWib: "2026-09",
                    inspectedByEmployeeId: "EMP001",
                    knownByEmployeeId: "EMP002",
                })
            ).rejects.toThrow(CleaningError);
        });

        it("AC-2: rejects invalid monthWib format", () => {
            expect(() => validateMonthWib("2026/09")).toThrow(CleaningError);
            expect(() => validateMonthWib("2026-13")).toThrow(CleaningError);
            expect(() => validateMonthWib("2026-09")).not.toThrow();
        });

        it("AC-2: rejects if inspectedBy and knownBy are the same employee", async () => {
            const wig002 = makeWig002Session();
            await expect(
                openApprovalPeriod(wig002, {
                    roomId: CLEANING_IDS.room,
                    monthWib: "2026-09",
                    inspectedByEmployeeId: "EMP001",
                    knownByEmployeeId: "EMP001",
                })
            ).rejects.toThrow("Karyawan Diperiksa Oleh dan Mengetahui harus berbeda.");
        });

        it("AC-2 & AC-3: opens a period atomically and records audit log", async () => {
            const wig002 = makeWig002Session();
            const room = makeRoom();

            vi.mocked(prisma.cleaningRoom.findUnique).mockResolvedValue(room as never);
            vi.mocked(prisma.employee.findFirst).mockImplementation((async (args?: { where?: { employeeId?: string; OR?: Array<{ employeeId?: string }> } }) => {
                const empId = args?.where?.employeeId || args?.where?.OR?.[0]?.employeeId;
                return {
                    id: `id-${empId}`,
                    employeeId: empId,
                    name: `Employee ${empId}`,
                    isActive: true,
                    userAccount: { isActive: true },
                } as never;
            }) as never);

            vi.mocked(prisma.cleaningMonthlyApproval.findUnique).mockResolvedValue(null);

            const createdApproval = {
                id: "approval-1",
                roomId: room.id,
                roomNameSnapshot: room.name,
                monthWib: "2026-09",
                inspectedByEmployeeId: "EMP001",
                knownByEmployeeId: "EMP002",
                signatures: [],
            };

            vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => {
                return callback({
                    cleaningMonthlyApproval: {
                        create: vi.fn().mockResolvedValue(createdApproval),
                    },
                    auditLog: {
                        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
                    },
                } as never);
            });

            const result = await openApprovalPeriod(wig002, {
                roomId: room.id,
                monthWib: "2026-09",
                inspectedByEmployeeId: "EMP001",
                knownByEmployeeId: "EMP002",
            });

            expect(result.isNew).toBe(true);
            expect(result.derivedStatus).toBe("WAITING_FOR_SIGNATURES");
            expect(result.approval.id).toBe("approval-1");
        });

        it("AC-3: returns existing period atomically if already created", async () => {
            const wig002 = makeWig002Session();
            const room = makeRoom();

            vi.mocked(prisma.cleaningRoom.findUnique).mockResolvedValue(room as never);
            vi.mocked(prisma.employee.findFirst).mockResolvedValue({
                id: "emp-1",
                employeeId: "EMP001",
                name: "Employee 1",
                isActive: true,
                userAccount: { isActive: true },
            } as never);

            const existingApproval = {
                id: "existing-approval",
                roomId: room.id,
                roomNameSnapshot: room.name,
                monthWib: "2026-09",
                inspectedByEmployeeId: "EMP001",
                knownByEmployeeId: "EMP002",
                signatures: [],
            };

            vi.mocked(prisma.cleaningMonthlyApproval.findUnique).mockResolvedValue(existingApproval as never);

            const result = await openApprovalPeriod(wig002, {
                roomId: room.id,
                monthWib: "2026-09",
                inspectedByEmployeeId: "EMP001",
                knownByEmployeeId: "EMP002",
            });

            expect(result.isNew).toBe(false);
            expect(result.derivedStatus).toBe("WAITING_FOR_SIGNATURES");
            expect(result.approval.id).toBe("existing-approval");
        });
    });

    describe("AC-4: Signature payload validation", () => {
        it("accepts valid PNG data URL within 256 KB", () => {
            expect(() => validateSignaturePayload(VALID_PNG_SIGNATURE)).not.toThrow();
        });

        it("rejects non-PNG or invalid data URL format", () => {
            expect(() => validateSignaturePayload("data:image/jpeg;base64,1234")).toThrow(
                "Format tanda tangan tidak valid."
            );
            expect(() => validateSignaturePayload("not-a-data-url")).toThrow(
                "Format tanda tangan tidak valid."
            );
        });

        it("rejects empty or very short signature payload", () => {
            expect(() => validateSignaturePayload("data:image/png;base64,AAAA")).toThrow(
                "Tanda tangan kosong atau tidak valid."
            );
        });

        it("rejects signature payload larger than 256 KB", () => {
            const hugeBuffer = Buffer.alloc(260 * 1024, 1);
            const hugePayload = "data:image/png;base64," + hugeBuffer.toString("base64");
            expect(() => validateSignaturePayload(hugePayload)).toThrow(
                "Ukuran tanda tangan melebihi batas 256 KB."
            );
        });
    });

    describe("AC-8: Derived Status State Machine", () => {
        it("returns WAITING_FOR_SIGNATURES when neither role is signed", () => {
            expect(deriveApprovalStatus(null, null)).toBe("WAITING_FOR_SIGNATURES");
            expect(deriveApprovalStatus({ status: "REOPENED" }, null)).toBe("WAITING_FOR_SIGNATURES");
        });

        it("returns PARTIALLY_SIGNED when one role is signed", () => {
            expect(deriveApprovalStatus({ status: "SIGNED" }, null)).toBe("PARTIALLY_SIGNED");
            expect(deriveApprovalStatus(null, { status: "SIGNED" })).toBe("PARTIALLY_SIGNED");
            expect(deriveApprovalStatus({ status: "SIGNED" }, { status: "REOPENED" })).toBe("PARTIALLY_SIGNED");
        });

        it("returns COMPLETE when both roles are signed", () => {
            expect(deriveApprovalStatus({ status: "SIGNED" }, { status: "SIGNED" })).toBe("COMPLETE");
        });
    });

    describe("AC-5, AC-6, AC-7: Employee Signing and Idempotency", () => {
        it("AC-6: rejects signing if session employee does not match assigned slot", async () => {
            const empSession = makeEmployeeSession({ employeeId: "EMP999" });

            vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => {
                return callback({
                    employee: {
                        findFirst: vi.fn().mockResolvedValue({
                            employeeId: "EMP999",
                            name: "Wrong Emp",
                            isActive: true,
                            userAccount: { isActive: true },
                        }),
                    },
                    cleaningMonthlyApproval: {
                        findUnique: vi.fn().mockResolvedValue({
                            id: "approval-1",
                            roomId: CLEANING_IDS.room,
                            monthWib: "2026-09",
                            inspectedByEmployeeId: "EMP001",
                            knownByEmployeeId: "EMP002",
                            signatures: [],
                        }),
                    },
                } as never);
            });

            await expect(
                signApprovalPeriod(empSession, {
                    approvalId: "approval-1",
                    role: "INSPECTED_BY",
                    signaturePayload: VALID_PNG_SIGNATURE,
                })
            ).rejects.toThrow("Anda tidak ditugaskan untuk menandatangani peran ini.");
        });

        it("AC-6: rejects signing if slot is already signed", async () => {
            const empSession = makeEmployeeSession({ employeeId: "EMP001" });

            vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => {
                return callback({
                    employee: {
                        findFirst: vi.fn().mockResolvedValue({
                            employeeId: "EMP001",
                            name: "Employee 1",
                            isActive: true,
                            userAccount: { isActive: true },
                        }),
                    },
                    cleaningMonthlyApproval: {
                        findUnique: vi.fn().mockResolvedValue({
                            id: "approval-1",
                            roomId: CLEANING_IDS.room,
                            monthWib: "2026-09",
                            inspectedByEmployeeId: "EMP001",
                            knownByEmployeeId: "EMP002",
                            signatures: [
                                {
                                    id: "sig-1",
                                    role: "INSPECTED_BY",
                                    status: "SIGNED",
                                    version: 1,
                                },
                            ],
                        }),
                    },
                } as never);
            });

            await expect(
                signApprovalPeriod(empSession, {
                    approvalId: "approval-1",
                    role: "INSPECTED_BY",
                    signaturePayload: VALID_PNG_SIGNATURE,
                })
            ).rejects.toThrow("Peran ini sudah ditandatangani.");
        });

        it("AC-6 & AC-7: successfully signs slot and supports idempotency", async () => {
            const empSession = makeEmployeeSession({ employeeId: "EMP001" });

            const createdSig = {
                id: "sig-1",
                approvalId: "approval-1",
                role: "INSPECTED_BY",
                version: 1,
                employeeId: "EMP001",
                employeeNameSnapshot: "Employee 1",
                signaturePayload: VALID_PNG_SIGNATURE,
                status: "SIGNED",
                signedAt: new Date(),
            };

            vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => {
                return callback({
                    employee: {
                        findFirst: vi.fn().mockResolvedValue({
                            employeeId: "EMP001",
                            name: "Employee 1",
                            isActive: true,
                            userAccount: { isActive: true },
                        }),
                    },
                    cleaningMonthlyApproval: {
                        findUnique: vi.fn().mockResolvedValue({
                            id: "approval-1",
                            roomId: CLEANING_IDS.room,
                            monthWib: "2026-09",
                            inspectedByEmployeeId: "EMP001",
                            knownByEmployeeId: "EMP002",
                            signatures: [],
                        }),
                    },
                    cleaningMonthlyApprovalSignature: {
                        create: vi.fn().mockResolvedValue(createdSig),
                    },
                    auditLog: {
                        create: vi.fn().mockResolvedValue({ id: "audit-sign" }),
                    },
                    cleaningDailyChecklist: {
                        findMany: vi.fn().mockResolvedValue([]),
                    },
                    cleaningApprovalIdempotency: {
                        create: vi.fn().mockResolvedValue({ id: "idem-1" }),
                    },
                } as never);
            });

            const result = await signApprovalPeriod(empSession, {
                approvalId: "approval-1",
                role: "INSPECTED_BY",
                signaturePayload: VALID_PNG_SIGNATURE,
                idempotencyKey: "idem-key-123",
            });

            expect(result.success).toBe(true);
            expect(result.signatureId).toBe("sig-1");
            expect(result.derivedStatus).toBe("PARTIALLY_SIGNED");
        });

        it("AC-7: returns cached result for identical idempotency key without duplicate creation", async () => {
            const empSession = makeEmployeeSession({ employeeId: "EMP001" });

            const cachedData = {
                success: true,
                signatureId: "sig-1",
                role: "INSPECTED_BY",
                version: 1,
                derivedStatus: "PARTIALLY_SIGNED",
            };

            // Pre-calculate hash
            const crypto = await import("node:crypto");
            const hash = crypto
                .createHash("sha256")
                .update(JSON.stringify({
                    approvalId: "approval-1",
                    role: "INSPECTED_BY",
                    signaturePayload: VALID_PNG_SIGNATURE,
                }))
                .digest("hex");

            vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue({
                id: "idem-1",
                actorId: empSession.userId,
                endpointScope: "employee_sign_cleaning_approval",
                idempotencyKey: "idem-key-123",
                requestHash: hash,
                responsePayload: JSON.stringify(cachedData),
                expiresAt: new Date(Date.now() + 100000),
                createdAt: new Date(),
            } as never);

            const result = await signApprovalPeriod(empSession, {
                approvalId: "approval-1",
                role: "INSPECTED_BY",
                signaturePayload: VALID_PNG_SIGNATURE,
                idempotencyKey: "idem-key-123",
            });

            expect(result).toEqual(cachedData);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });
    });

    describe("AC-9 and AC-10: Slot Reopening", () => {
        it("AC-9: rejects reopening without mandatory reason", async () => {
            const wig002 = makeWig002Session();
            await expect(
                reopenApprovalSlot(wig002, {
                    approvalId: "approval-1",
                    role: "INSPECTED_BY",
                    reopenReason: "  ",
                })
            ).rejects.toThrow("Alasan pembukaan kembali wajib diisi minimal 3 karakter.");
        });

        it("AC-9: archives old signature as REOPENED and moves period back to waiting", async () => {
            const wig002 = makeWig002Session();

            const existingApproval = {
                id: "approval-1",
                roomId: CLEANING_IDS.room,
                monthWib: "2026-09",
                inspectedByEmployeeId: "EMP001",
                knownByEmployeeId: "EMP002",
                signatures: [
                    {
                        id: "sig-old",
                        role: "INSPECTED_BY",
                        status: "SIGNED",
                        version: 1,
                    },
                ],
            };

            const updatedApproval = {
                ...existingApproval,
                signatures: [],
            };

            vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => {
                return callback({
                    cleaningMonthlyApproval: {
                        findUnique: vi.fn().mockResolvedValue(existingApproval),
                        update: vi.fn().mockResolvedValue(updatedApproval),
                    },
                    employee: {
                        findFirst: vi.fn().mockResolvedValue({
                            employeeId: "EMP001",
                            isActive: true,
                            userAccount: { isActive: true },
                        }),
                    },
                    cleaningMonthlyApprovalSignature: {
                        update: vi.fn().mockResolvedValue({ id: "sig-old", status: "REOPENED" }),
                    },
                    auditLog: {
                        create: vi.fn().mockResolvedValue({ id: "audit-reopen" }),
                    },
                } as never);
            });

            const result = await reopenApprovalSlot(wig002, {
                approvalId: "approval-1",
                role: "INSPECTED_BY",
                reopenReason: "Perlu pemeriksaan ulang terhadap checklist.",
            });

            expect(result.success).toBe(true);
            expect(result.reopenedRole).toBe("INSPECTED_BY");
            expect(result.derivedStatus).toBe("WAITING_FOR_SIGNATURES");
        });

        it("AC-10: rejects reopening if current reviewer is inactive and no replacement provided", async () => {
            const wig002 = makeWig002Session();

            const existingApproval = {
                id: "approval-1",
                roomId: CLEANING_IDS.room,
                monthWib: "2026-09",
                inspectedByEmployeeId: "EMP001",
                knownByEmployeeId: "EMP002",
                signatures: [],
            };

            vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => {
                return callback({
                    cleaningMonthlyApproval: {
                        findUnique: vi.fn().mockResolvedValue(existingApproval),
                    },
                    employee: {
                        findFirst: vi.fn().mockResolvedValue(null), // Inactive
                    },
                } as never);
            });

            await expect(
                reopenApprovalSlot(wig002, {
                    approvalId: "approval-1",
                    role: "INSPECTED_BY",
                    reopenReason: "Karyawan resign.",
                })
            ).rejects.toThrow("Karyawan saat ini tidak aktif. Wajib menyertakan karyawan pengganti yang aktif.");
        });
    });

    describe("PDF Export Data Retrieval", () => {
        it("returns complete export payload including matrix and reviewer signatures", async () => {
            const wig002 = makeWig002Session();
            const room = makeRoom();

            vi.mocked(prisma.cleaningRoom.findUnique).mockResolvedValue(room as never);
            vi.mocked(prisma.cleaningMonthlyApproval.findUnique).mockResolvedValue({
                id: "approval-1",
                roomId: room.id,
                roomNameSnapshot: room.name,
                monthWib: "2026-08",
                inspectedByEmployeeId: "EMP001",
                knownByEmployeeId: "EMP002",
                inspectedByEmployee: { employeeId: "EMP001", name: "Manager A", positionRel: { name: "Manager" } },
                knownByEmployee: { employeeId: "EMP002", name: "Direksi B", positionRel: { name: "Direktur" } },
                signatures: [
                    {
                        id: "sig-1",
                        role: "INSPECTED_BY",
                        status: "SIGNED",
                        signedAt: new Date("2026-08-31T10:00:00Z"),
                        signaturePayload: VALID_PNG_SIGNATURE,
                    },
                ],
            } as never);

            vi.mocked(prisma.cleaningDailyChecklist.findMany).mockResolvedValue([
                {
                    id: "cl-1",
                    roomId: room.id,
                    wibDate: "2026-08-01",
                    roomNameSnapshot: room.name,
                    items: [
                        {
                            id: "item-1",
                            templateItemId: CLEANING_IDS.templateItem,
                            itemNameSnapshot: "Lantai",
                            isActive: true,
                            isComplete: true,
                        },
                    ],
                },
            ] as never);

            const result = await getCleaningPdfExportData(wig002, room.id, "2026-08");

            expect(result.roomName).toBe(room.name);
            expect(result.monthWib).toBe("2026-08");
            expect(result.daysInMonth).toBe(31);
            expect(result.items).toHaveLength(1);
            expect(result.matrix[0].days[0].isComplete).toBe(true);
            expect(result.inspectedBy.employeeName).toBe("Manager A");
            expect(result.inspectedBy.signaturePayload).toBe(VALID_PNG_SIGNATURE);
            expect(result.knownBy.employeeName).toBe("Direksi B");
            expect(result.knownBy.signaturePayload).toBeNull();
        });
    });
});
