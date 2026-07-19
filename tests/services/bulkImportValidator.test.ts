import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const mocks = vi.hoisted(() => ({
    departmentFindMany: vi.fn(),
    divisionFindMany: vi.fn(),
    positionFindMany: vi.fn(),
    employeeFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        department: { findMany: mocks.departmentFindMany },
        division: { findMany: mocks.divisionFindMany },
        position: { findMany: mocks.positionFindMany },
        employee: { findMany: mocks.employeeFindMany },
    },
}));
vi.mock("@/lib/services/employeePrivateService", () => ({
    serializeEmployeePrivateData: () => ({}),
}));
vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "test-jwt-secret-at-least-sixteen", PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough" } }));

import { validateImport } from "@/lib/services/bulk-import/validator";

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Data Karyawan");
    return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const headers = ["NIP", "Nama Karyawan", "Alamat Email", "No. HP", "Jenis Kelamin", "Departemen", "Divisi", "Jabatan", "Tanggal Masuk", "Atasan (NIP)"];
const employee = (id: string, email: string, manager = "") => [id, `Nama ${id}`, email, "081200000000", "Laki-Laki", "Finance", "Corporate", "Staff", "2026-07-01", manager];

describe("Bulk Import V2 validator", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.employeeFindMany.mockResolvedValue([]);
        mocks.departmentFindMany.mockResolvedValue([]);
        mocks.divisionFindMany.mockResolvedValue([]);
        mocks.positionFindMany.mockResolvedValue([]);
    });

    it("reports missing master data as conflicts unless HR explicitly allows creation", async () => {
        const buffer = workbookBuffer([headers, employee("EMP001", "one@wig.co.id")]);
        const blocked = await validateImport(buffer, { mode: "create", allowCreateMaster: false });
        expect(blocked.counts.CONFLICT).toBe(1);
        expect(blocked.executableRows).toBe(0);
        expect(blocked.missingReferences).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: "division", name: "Corporate" }),
            expect.objectContaining({ type: "department", name: "Finance", parentName: "Corporate" }),
            expect.objectContaining({ type: "position", name: "Staff" }),
        ]));

        const allowed = await validateImport(buffer, { mode: "create", allowCreateMaster: true });
        expect(allowed.counts.CREATE).toBe(1);
        expect(allowed.executableRows).toBe(1);
        expect(allowed.failedRows).toBe(0);
    });

    it("validates managers in a second pass so a manager may appear later in the file", async () => {
        mocks.divisionFindMany.mockResolvedValue([{ id: "div-1", name: "Corporate" }]);
        mocks.departmentFindMany.mockResolvedValue([{ id: "dep-1", name: "Finance", divisionId: "div-1", division: { id: "div-1", name: "Corporate" } }]);
        mocks.positionFindMany.mockResolvedValue([{ id: "pos-1", name: "Staff" }]);
        const buffer = workbookBuffer([headers, employee("EMP001", "one@wig.co.id", "EMP002"), employee("EMP002", "two@wig.co.id")]);
        const report = await validateImport(buffer, { mode: "create", allowCreateMaster: false });
        expect(report.executableRows).toBe(2);
        expect(report.errors).toHaveLength(0);
    });

    it("counts failed rows separately from the number of validation issues", async () => {
        const buffer = workbookBuffer([headers, employee("EMP001", "duplicate@wig.co.id"), employee("EMP001", "duplicate@wig.co.id")]);
        const report = await validateImport(buffer, { mode: "create", allowCreateMaster: true });
        expect(report.failedRows).toBe(2);
        expect(report.issueCount).toBeGreaterThan(report.failedRows);
        expect(report.executableRows).toBe(0);
    });
});
