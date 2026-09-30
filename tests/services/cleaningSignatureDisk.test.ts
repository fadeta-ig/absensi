import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeEmployeeSession, VALID_PNG_SIGNATURE } from "../fixtures/cleaning";

const mocks = vi.hoisted(() => ({
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
    getUploadLimit: vi.fn(),
    idemFindUnique: vi.fn(),
    txCallback: vi.fn(),
}));

vi.mock("fs/promises", () => ({
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
    readFile: mocks.readFile,
    unlink: mocks.unlink,
}));

vi.mock("node:fs/promises", () => ({
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
    readFile: mocks.readFile,
    unlink: mocks.unlink,
}));

vi.mock("@/lib/services/appSettingsService", () => ({
    getUploadLimit: mocks.getUploadLimit,
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        cleaningApprovalIdempotency: { findUnique: mocks.idemFindUnique },
        cleaningRoom: { findUnique: vi.fn() },
        cleaningMonthlyApproval: { findUnique: vi.fn() },
        cleaningDailyChecklist: { findMany: vi.fn() },
        $transaction: (...args: unknown[]) => (mocks.txCallback as (...a: unknown[]) => unknown)(...args),
    },
}));

vi.mock("@/lib/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
    resolveCleaningSignaturePath,
    resolveSignatureDataUrl,
    signApprovalPeriod,
    validateSignaturePayload,
    getCleaningPdfExportData,
} from "@/lib/services/cleaningApprovalService";
import { selectSignatureImageForPdf } from "@/lib/exportCleaningPdf";
import { prisma } from "@/lib/prisma";

const PNG_BUFFER = Buffer.from(VALID_PNG_SIGNATURE.replace(/^data:image\/png;base64,/, ""), "base64");

function txSuccessHarness(opts: { approvalId?: string; role?: "INSPECTED_BY" | "KNOWN_BY"; assigned?: string } = {}) {
    const approvalId = opts.approvalId ?? "approval-1";
    const role = opts.role ?? "INSPECTED_BY";
    const assigned = opts.assigned ?? "EMP001";
    const createdSig = {
        id: "sig-1",
        approvalId,
        role,
        version: 1,
        signedAt: new Date("2026-09-21T10:00:00Z"),
    };
    mocks.txCallback.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
            employee: {
                findFirst: vi.fn().mockResolvedValue({ employeeId: assigned, name: "Employee 1" }),
            },
            cleaningMonthlyApproval: {
                findUnique: vi.fn().mockResolvedValue({
                    id: approvalId,
                    roomId: "room-1",
                    monthWib: "2026-09",
                    inspectedByEmployeeId: "EMP001",
                    knownByEmployeeId: "EMP002",
                    signatures: [],
                }),
            },
            cleaningMonthlyApprovalSignature: { create: vi.fn().mockResolvedValue(createdSig) },
            auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
            cleaningDailyChecklist: { findMany: vi.fn().mockResolvedValue([]) },
            cleaningApprovalIdempotency: { create: vi.fn().mockResolvedValue({ id: "idem-1" }) },
        })
    );
    return createdSig;
}

describe("TTD cleaning disk+path (Gel.2c, mock fs+prisma, tanpa DB tulis)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getUploadLimit.mockResolvedValue(0.25);
        mocks.mkdir.mockResolvedValue(undefined);
        mocks.writeFile.mockResolvedValue(undefined);
        mocks.readFile.mockResolvedValue(PNG_BUFFER);
        mocks.unlink.mockResolvedValue(undefined);
        mocks.idemFindUnique.mockResolvedValue(null);
    });

    it("validasi memakai batas setting (fallback bawaan 256 KB dipertahankan)", () => {
        expect(() => validateSignaturePayload(VALID_PNG_SIGNATURE)).not.toThrow();
        const huge = Buffer.alloc(260 * 1024, 1);
        expect(() => validateSignaturePayload(`data:image/png;base64,${huge.toString("base64")}`)).toThrow(
            "Ukuran tanda tangan melebihi batas 256 KB."
        );
        const tinyLimit = 100;
        expect(() => validateSignaturePayload(VALID_PNG_SIGNATURE, tinyLimit)).toThrow(/melebihi batas/);
    });

    it("resolveCleaningSignaturePath menolak traversal", () => {
        expect(resolveCleaningSignaturePath("../rahasia.png")).toBeNull();
        expect(resolveCleaningSignaturePath("approval-1/INSPECTED_BY_abc.png")).not.toBeNull();
        expect(resolveCleaningSignaturePath("approval-1/BADROLE_abc.png")).toBeNull();
    });

    it("sign menyimpan PNG ke storage/signatures/{approvalId}/{role}_{uuid}.png + isi signaturePath tanpa base64", async () => {
        const session = makeEmployeeSession({ employeeId: "EMP001" });
        txSuccessHarness();

        const result = await signApprovalPeriod(session, {
            approvalId: "approval-1",
            role: "INSPECTED_BY",
            signaturePayload: VALID_PNG_SIGNATURE,
        });

        expect(result.success).toBe(true);
        expect(mocks.getUploadLimit).toHaveBeenCalledWith("upload.signature.maxMb");
        expect(mocks.writeFile).toHaveBeenCalledTimes(1);
        const [absPath, written, options] = mocks.writeFile.mock.calls[0] as [string, Buffer, { flag: string }];
        expect(options).toMatchObject({ flag: "wx" });
        expect(absPath).toContain("signatures");
        expect(absPath.endsWith(".png")).toBe(true);
        expect(Buffer.isBuffer(written) ? written.equals(PNG_BUFFER) : false).toBe(true);

        const txArg = mocks.txCallback.mock.calls[0][0] as (tx: unknown) => Promise<unknown>;
        let capturedCreate: unknown;
        await txArg({
            employee: { findFirst: vi.fn().mockResolvedValue({ employeeId: "EMP001", name: "Employee 1" }) },
            cleaningMonthlyApproval: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "approval-1",
                    roomId: "room-1",
                    monthWib: "2026-09",
                    inspectedByEmployeeId: "EMP001",
                    knownByEmployeeId: "EMP002",
                    signatures: [],
                }),
            },
            cleaningMonthlyApprovalSignature: {
                create: vi.fn().mockImplementation((arg: unknown) => {
                    capturedCreate = arg;
                    return Promise.resolve({ id: "sig-1", role: "INSPECTED_BY", version: 1, signedAt: new Date() });
                }),
            },
            auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
            cleaningDailyChecklist: { findMany: vi.fn().mockResolvedValue([]) },
            cleaningApprovalIdempotency: { create: vi.fn().mockResolvedValue({ id: "idem-1" }) },
        } as never);
        const createData = (capturedCreate as { data: Record<string, unknown> }).data;
        expect(createData.signaturePath).toMatch(/^approval-1\/INSPECTED_BY_.+\.png$/);
        expect(createData.signaturePayload).toBe("");
    });

    it("sign membersihkan berkas yatim bila transaksi DB gagal", async () => {
        const session = makeEmployeeSession({ employeeId: "EMP001" });
        mocks.txCallback.mockRejectedValue(new Error("db down"));

        await expect(
            signApprovalPeriod(session, {
                approvalId: "approval-1",
                role: "INSPECTED_BY",
                signaturePayload: VALID_PNG_SIGNATURE,
            })
        ).rejects.toThrow("db down");
        expect(mocks.writeFile).toHaveBeenCalledTimes(1);
        expect(mocks.unlink).toHaveBeenCalledTimes(1);
    });

    it("resolveSignatureDataUrl: path ada → isi file; kosong → fallback base64 lama", async () => {
        const fromDisk = await resolveSignatureDataUrl({
            signaturePayload: "",
            signaturePath: "approval-1/INSPECTED_BY_abc.png",
        });
        expect(fromDisk).toBe(VALID_PNG_SIGNATURE);
        expect(mocks.readFile).toHaveBeenCalledTimes(1);

        vi.clearAllMocks();
        const legacy = await resolveSignatureDataUrl({ signaturePayload: VALID_PNG_SIGNATURE, signaturePath: null });
        expect(legacy).toBe(VALID_PNG_SIGNATURE);
        expect(mocks.readFile).not.toHaveBeenCalled();

        const empty = await resolveSignatureDataUrl({ signaturePayload: "", signaturePath: null });
        expect(empty).toBeNull();
    });

    it("selectSignatureImageForPdf memakai payload valid dan mengabaikan path mentah/kosong", () => {
        expect(selectSignatureImageForPdf({ signaturePayload: VALID_PNG_SIGNATURE, signaturePath: null })).toBe(
            VALID_PNG_SIGNATURE
        );
        expect(selectSignatureImageForPdf({ signaturePayload: "", signaturePath: "approval-1/INSPECTED_BY_x.png" })).toBeNull();
        expect(selectSignatureImageForPdf(null)).toBeNull();
    });

    it("getCleaningPdfExportData dual-read: path dibaca dari disk, legacy tetap payload", async () => {
        const { makeWig002Session, makeRoom } = await import("../fixtures/cleaning");
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
                    signaturePayload: "",
                    signaturePath: "approval-1/INSPECTED_BY_disk.png",
                },
            ],
        } as never);
        vi.mocked(prisma.cleaningDailyChecklist.findMany).mockResolvedValue([] as never);

        const result = await getCleaningPdfExportData(wig002, room.id, "2026-08");

        expect(result.inspectedBy.signaturePayload).toBe(VALID_PNG_SIGNATURE);
        expect(result.knownBy.signaturePayload).toBeNull();
    });
});
