import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { DuplicateImportError, executeImport } from "@/lib/services/bulk-import";

vi.mock("@/lib/services/emailService", () => ({ sendPasswordEmail: vi.fn().mockResolvedValue(true) }));

const describeWithDatabase = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Data Karyawan");
    return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describeWithDatabase("Bulk Import V2 database integration", () => {
    const suffix = Date.now().toString();
    const employeeId = `IMPORT_V2_${suffix}`;
    let actor = { userId: "", identifier: "", name: "", role: "HR_ADMIN", type: "USER" as const };
    let department = { name: "", division: { name: "" } };
    let positionName = "";
    let jobId = "";

    beforeAll(async () => {
        const [admin, departmentRow, position] = await Promise.all([
            prisma.userAccount.findFirst({
                where: { isActive: true, roles: { some: { role: { permissions: { some: { permission: { code: "hr.manage" } } } } } } },
                select: { id: true, username: true, displayName: true },
            }),
            prisma.department.findFirst({ where: { isActive: true }, select: { name: true, division: { select: { name: true } } } }),
            prisma.position.findFirst({ where: { isActive: true }, select: { name: true } }),
        ]);
        if (!admin || !departmentRow || !position) throw new Error("Referensi integration test tidak tersedia.");
        actor = { userId: admin.id, identifier: admin.username, name: admin.displayName, role: "HR_ADMIN", type: "USER" };
        department = departmentRow;
        positionName = position.name;
    });

    afterAll(async () => {
        await prisma.userAccount.deleteMany({ where: { employeeId } });
        await prisma.employee.deleteMany({ where: { employeeId } });
        if (jobId) await prisma.employeeImportJob.deleteMany({ where: { id: jobId } });
    });

    it("executes create atomically, encrypts private identifiers, creates login, and blocks an identical replay", async () => {
        const buffer = workbookBuffer([
            ["NIP", "Nama Karyawan", "Status Karyawan", "Jabatan", "Departemen", "Divisi", "Jenis Kelamin", "Tanggal Masuk", "No. KTP", "Alamat Email", "No. HP", "Status Aktif"],
            [employeeId, "Bulk Import Integration", "Tetap", positionName, department.name, department.division.name, "Laki-Laki", "2026-07-01", `32${suffix.slice(-14).padStart(14, "0")}`, `${employeeId.toLowerCase()}@example.invalid`, "081200000000", "Ya"],
        ]);

        const result = await executeImport(buffer, actor, { mode: "create", allowCreateMaster: false });
        jobId = result.jobId;
        expect(result).toMatchObject({ created: 1, updated: 0, failedRows: 0 });

        const [employee, account, identity, job] = await Promise.all([
            prisma.employee.findUniqueOrThrow({ where: { employeeId } }),
            prisma.userAccount.findUniqueOrThrow({ where: { employeeId } }),
            prisma.employeeIdentity.findUniqueOrThrow({ where: { employeeId } }),
            prisma.employeeImportJob.findUniqueOrThrow({ where: { id: result.jobId } }),
        ]);
        expect(employee.employeeIdNormalized).toBe(employeeId.replace(/[-\s]/g, "").toUpperCase());
        expect(account.isActive).toBe(true);
        expect(identity.nationalId).toMatch(/^enc:v1:/);
        expect(job.status).toBe("COMPLETED");

        await expect(executeImport(buffer, actor, { mode: "create", allowCreateMaster: false }))
            .rejects.toBeInstanceOf(DuplicateImportError);
    });
});
