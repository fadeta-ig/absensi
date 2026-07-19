import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createEmployee, getEmployeePrivateDetailById, updateEmployee } from "@/lib/services/employeeService";
import { serializeEmployeePrivateData } from "@/lib/services/employeePrivateService";
import { deleteEmployeeDocument, readEmployeeDocument, uploadEmployeeDocument } from "@/lib/services/employeeDocumentService";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;

describeWithDatabase("employee master V2 database integration", () => {
    const suffix = Date.now().toString();
    const employeeId = `MASTER_V2_${suffix}`;
    const nationalId = `31${suffix.slice(-14).padStart(14, "0")}`;
    let employeeDatabaseId = "";
    let documentId = "";
    let actor = { userId: "", identifier: "", name: "", role: "HR_ADMIN", type: "USER" as const };
    let department = { id: "", divisionId: "" };
    let positionId = "";

    beforeAll(async () => {
        const [admin, departmentRow, position] = await Promise.all([
            prisma.userAccount.findFirst({
                where: { isActive: true, roles: { some: { role: { permissions: { some: { permission: { code: "hr.manage" } } } } } } },
                select: { id: true, username: true, displayName: true },
            }),
            prisma.department.findFirst({ where: { isActive: true }, select: { id: true, divisionId: true } }),
            prisma.position.findFirst({ where: { isActive: true }, select: { id: true } }),
        ]);
        if (!admin || !departmentRow || !position) throw new Error("Referensi integration test tidak tersedia.");
        actor = { userId: admin.id, identifier: admin.username, name: admin.displayName, role: "HR_ADMIN", type: "USER" };
        department = departmentRow;
        positionId = position.id;
    });

    afterAll(async () => {
        if (documentId && employeeDatabaseId) await deleteEmployeeDocument(employeeDatabaseId, documentId).catch(() => undefined);
        await prisma.userAccount.deleteMany({ where: { employeeId } });
        await prisma.employee.deleteMany({ where: { employeeId } });
    });

    it("persists separated private data encrypted and reads it only through the HR detail serializer", async () => {
        const employee = await createEmployee({
            employeeId,
            name: "Employee Master V2 Test",
            email: `${employeeId.toLowerCase()}@example.invalid`,
            phone: "081200000000",
            alternatePhone: null,
            gender: "Laki-Laki",
            employmentType: "CONTRACT",
            departmentId: department.id,
            divisionId: department.divisionId,
            positionId,
            managerId: null,
            joinDate: "2026-07-01",
            employmentStartDate: "2026-07-01",
            employmentEndDate: "2027-06-30",
            probationEndDate: null,
            totalLeave: 12,
            usedLeave: 0,
            shiftId: null,
            bypassLocation: false,
            locations: [],
            basicSalary: 0,
            payrollComponents: [],
            academicTitle: null,
            preferredName: "V2 Test",
            birthPlace: "Jakarta",
            birthDate: "2000-01-02",
            nationalId,
            bankName: "Bank Test",
            bankAccountNumber: `00${suffix}`,
            bankAccountHolderName: "Employee Master V2 Test",
            ptkpStatus: "TK",
            ptkpEffectiveDate: "2026-07-01",
            passwordHash: "integration-test-not-for-login",
            createdByUserId: actor.userId,
            isActive: true,
        }, actor);
        employeeDatabaseId = employee.id;

        const rawIdentity = await prisma.employeeIdentity.findUniqueOrThrow({ where: { employeeId } });
        expect(rawIdentity.nationalId).toMatch(/^enc:v1:/);
        expect(rawIdentity.nationalId).not.toContain(nationalId);

        const detail = await getEmployeePrivateDetailById(employee.id);
        expect(detail).not.toBeNull();
        expect(serializeEmployeePrivateData(detail!).nationalId).toBe(nationalId);

        await updateEmployee(employee.id, { notes: "Catatan HR terverifikasi" }, actor);
        expect((await getEmployeePrivateDetailById(employee.id))?.privateProfile?.notes).toBe("Catatan HR terverifikasi");
    });

    it("stores documents outside public storage and supports authenticated-service read/delete lifecycle", async () => {
        const file = new File([Buffer.from("%PDF-1.4\n% integration test\n")], "ktp-test.pdf", { type: "application/pdf" });
        const document = await uploadEmployeeDocument({
            employeeDatabaseId,
            type: "KTP",
            title: "KTP Integration Test",
            file,
            uploadedByUserId: actor.userId,
        });
        documentId = document.id;
        const stored = await prisma.employeeDocument.findUniqueOrThrow({ where: { id: document.id }, select: { fileUrl: true } });
        expect(stored.fileUrl).not.toContain("public");
        expect(stored.fileUrl).not.toContain("..");
        expect((await readEmployeeDocument(employeeDatabaseId, document.id))?.buffer.toString("ascii")).toContain("%PDF-1.4");
        expect(await deleteEmployeeDocument(employeeDatabaseId, document.id)).toMatchObject({ id: document.id });
        documentId = "";
    });
});
