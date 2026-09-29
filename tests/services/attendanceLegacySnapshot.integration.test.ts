import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

const describeSnapshot = process.env.RUN_ATTENDANCE_SNAPSHOT_CHECK === "1" ? describe : describe.skip;

describeSnapshot("production-like attendance snapshot remains unchanged", () => {
    it("matches the approved 2026-09-29 baseline without mutating rows", async () => {
        const url = new URL(process.env.DATABASE_URL ?? "");
        const databaseName = url.pathname.slice(1);
        const expectedDatabase = process.env.ATTENDANCE_SNAPSHOT_EXPECTED_DATABASE;
        if (!expectedDatabase || databaseName !== expectedDatabase) {
            throw new Error(`Refusing snapshot target: ${databaseName || "unknown"}`);
        }

        const [attendanceCount, employeeCount, correctionCount, rows, corrections, employeesWithFace] = await Promise.all([
            prisma.attendanceRecord.count(),
            prisma.employee.count(),
            prisma.attendanceCorrection.count(),
            prisma.attendanceRecord.findMany({
                select: { id: true, employeeId: true, date: true, clockIn: true, clockOut: true },
                orderBy: { id: "asc" },
            }),
            prisma.attendanceCorrection.findMany({
                select: { id: true, employeeId: true, targetDate: true, status: true, assignedManagerId: true },
                orderBy: { id: "asc" },
            }),
            prisma.employee.findMany({
                where: { faceDescriptor: { not: null } },
                select: { id: true, faceDescriptor: true },
                orderBy: { id: "asc" },
            }),
        ]);

        const openRows = rows.filter((row) => row.clockIn && !row.clockOut);
        const negativeRows = rows.filter((row) => row.clockIn && row.clockOut && row.clockOut < row.clockIn);
        const nullManagerCorrections = corrections.filter((row) => row.assignedManagerId === null);

        expect(attendanceCount).toBe(522);
        expect(employeeCount).toBe(59);
        expect(correctionCount).toBe(6);
        expect(openRows).toHaveLength(102);
        expect(negativeRows).toHaveLength(1);
        expect(nullManagerCorrections).toHaveLength(6);
        expect(employeesWithFace).toHaveLength(5);

        // Compute private fingerprints without printing any PII to make accidental
        // snapshot drift visible inside this test run.
        const fingerprint = (items: unknown[]) => createHash("sha256").update(JSON.stringify(items)).digest("hex");
        expect(fingerprint(openRows)).toBe("99e3e177becaee3946864fc75a5037770e2b97fe06a5196f115b28515ee04205");
        expect(fingerprint(negativeRows)).toBe("4d9567e603c5c8c621ee95a6b036da37f7f763e5f4b90f3eef7ea42cd450466a");
        expect(fingerprint(corrections)).toBe("e70caae755c6caabec980e9022e361a8d0b8f04b6b2ff2b2ac2946f038895566");
        expect(fingerprint(employeesWithFace.map((row) => ({ id: row.id, face: fingerprint([row.faceDescriptor]) })))).toBe(
            "f0e86599f75a6bc3be838bb16d47a5ddfc072d51cee5282eddeb52ad48800084",
        );
    });
});
