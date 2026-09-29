import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

const guardMocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => new Response(null, { status: 401 })),
    forbiddenResponse: vi.fn(() => new Response(null, { status: 403 })),
    validateBody: vi.fn(async (request: Request) => ({ data: await request.json() })),
    serverErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn(),
        $queryRaw: vi.fn(),
        employee: { findUnique: vi.fn() },
        workShift: { findUnique: vi.fn(), findFirst: vi.fn() },
        attendanceCorrection: {
            create: vi.fn(),
            findMany: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            updateMany: vi.fn(),
        },
        attendanceRecord: { upsert: vi.fn(), findUnique: vi.fn() },
        leaveRequest: { findFirst: vi.fn() },
        shiftAssignment: { findMany: vi.fn() },
    },
}));

vi.mock("@/lib/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/middleware/apiGuard", () => guardMocks);

import { prisma } from "@/lib/prisma";
import {
    resolveCorrection,
    submitCorrection,
    validateProposedClockInDate,
} from "@/lib/services/attendanceCorrectionService";
import { GET, PATCH } from "@/app/api/attendance/correction/route";

const db = prisma as unknown as {
    $transaction: Mock;
    $queryRaw: Mock;
    employee: Record<string, Mock>;
    workShift: Record<string, Mock>;
    attendanceCorrection: Record<string, Mock>;
    attendanceRecord: Record<string, Mock>;
    leaveRequest: Record<string, Mock>;
    shiftAssignment: Record<string, Mock>;
};

const shift0800 = {
    id: "shift-1",
    earlyCheckIn: 0,
    lateCheckIn: 0,
    earlyCheckOut: 0,
    lateCheckOut: 0,
    days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        startTime: "08:00",
        endTime: "17:00",
        isOff: false,
    })),
};

function mockShiftFound(existingStatus: string | null = "late") {
    db.employee.findUnique.mockResolvedValue({ shiftId: "shift-1" });
    db.workShift.findUnique.mockResolvedValue(shift0800);
    db.attendanceRecord.findUnique.mockResolvedValue(
        existingStatus ? { status: existingStatus, isOffDay: false } : null
    );
}

const correction = {
    id: "correction-1",
    employeeId: "EMP001",
    targetDate: new Date("2026-09-18T00:00:00.000Z"),
    proposedClockIn: new Date("2026-09-18T01:00:00.000Z"),
    proposedClockOut: null,
    reason: "Mesin presensi bermasalah",
    attachmentUrl: null,
    status: "PENDING",
    assignedManagerId: null,
    createdAt: new Date("2026-09-18T02:00:00.000Z"),
    updatedAt: new Date("2026-09-18T02:00:00.000Z"),
};

describe("attendance correction service", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
        db.$queryRaw.mockResolvedValue([{ employee_id: "EMP001" }]);
        db.leaveRequest.findFirst.mockResolvedValue(null);
        db.shiftAssignment.findMany.mockResolvedValue([]);
        guardMocks.unauthorizedResponse.mockImplementation(() => new Response(null, { status: 401 }));
        guardMocks.forbiddenResponse.mockImplementation(() => new Response(null, { status: 403 }));
        guardMocks.validateBody.mockImplementation(async (request: Request) => ({ data: await request.json() }));
        guardMocks.serverErrorResponse.mockImplementation(() => new Response(null, { status: 500 }));
    });

    it("stores new corrections at UTC midnight without assigning a manager", async () => {
        db.attendanceCorrection.findFirst.mockResolvedValue(null);
        db.attendanceCorrection.create.mockResolvedValue(correction);

        await submitCorrection({
            employeeId: "EMP001",
            targetDate: "2026-09-18",
            proposedClockIn: "2026-09-18T08:00:00.000+07:00",
            reason: "Mesin presensi bermasalah",
        });

        expect(db.attendanceCorrection.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                targetDate: new Date("2026-09-18T00:00:00.000Z"),
                assignedManagerId: null,
                status: "PENDING",
            }),
        });
    });

    it("rejects submission when an approved leave covers the target date", async () => {
        db.attendanceCorrection.findFirst.mockResolvedValue(null);
        db.leaveRequest.findFirst.mockResolvedValue({ type: "sick", status: "approved" });

        await expect(submitCorrection({
            employeeId: "EMP001",
            targetDate: "2026-09-18",
            proposedClockIn: "2026-09-18T08:00:00.000+07:00",
            reason: "Koreksi di tanggal sakit",
        })).rejects.toMatchObject({ code: "LEAVE_CONFLICT", statusCode: 409 });
        expect(db.attendanceCorrection.create).not.toHaveBeenCalled();
    });

    it("rejects submission when a pending leave covers the target date", async () => {
        db.attendanceCorrection.findFirst.mockResolvedValue(null);
        db.leaveRequest.findFirst.mockResolvedValue({ type: "annual", status: "pending" });

        await expect(submitCorrection({
            employeeId: "EMP001",
            targetDate: "2026-09-18",
            proposedClockIn: "2026-09-18T08:00:00.000+07:00",
            reason: "Koreksi di tanggal cuti pending",
        })).rejects.toMatchObject({ code: "LEAVE_CONFLICT", statusCode: 409 });
        expect(db.attendanceCorrection.create).not.toHaveBeenCalled();
    });

    it("only blocks approved/pending leaves so rejected ones stay free", async () => {
        db.attendanceCorrection.findFirst.mockResolvedValue(null);
        db.attendanceCorrection.create.mockResolvedValue(correction);

        await submitCorrection({
            employeeId: "EMP001",
            targetDate: "2026-09-18",
            proposedClockIn: "2026-09-18T08:00:00.000+07:00",
            reason: "Cuti sebelumnya sudah rejected",
        });

        // Kunci perilaku: query konflik tidak pernah menyertakan status rejected.
        expect(db.leaveRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ status: { in: ["approved", "pending"] } }),
        }));
        expect(db.attendanceCorrection.create).toHaveBeenCalled();
    });

    it("rejects approval when leave was approved after submission", async () => {
        db.attendanceCorrection.findUnique
            .mockResolvedValueOnce(correction)
            .mockResolvedValueOnce({ ...correction, status: "APPROVED" });
        db.leaveRequest.findFirst.mockResolvedValue({ type: "annual", status: "approved" });

        await expect(resolveCorrection("correction-1", "APPROVED", "WIG001")).rejects.toMatchObject({
            code: "LEAVE_CONFLICT",
            statusCode: 409,
        });
        expect(db.attendanceCorrection.updateMany).not.toHaveBeenCalled();
        expect(db.attendanceRecord.upsert).not.toHaveBeenCalled();
    });

    it("allows rejection even when a leave conflict exists", async () => {
        db.attendanceCorrection.findUnique
            .mockResolvedValueOnce(correction)
            .mockResolvedValueOnce({ ...correction, status: "REJECTED" });
        db.attendanceCorrection.updateMany.mockResolvedValue({ count: 1 });
        db.leaveRequest.findFirst.mockResolvedValue({ type: "sick", status: "approved" });

        const result = await resolveCorrection("correction-1", "REJECTED", "WIG001");

        expect(result.status).toBe("REJECTED");
        expect(db.attendanceCorrection.updateMany).toHaveBeenCalledWith({
            where: { id: "correction-1", status: "PENDING" },
            data: { status: "REJECTED" },
        });
        expect(db.attendanceRecord.upsert).not.toHaveBeenCalled();
    });

    it("rejects a second pending correction for the same employee and target date", async () => {
        db.attendanceCorrection.findFirst.mockResolvedValue(correction);

        await expect(submitCorrection({
            employeeId: "EMP001",
            targetDate: "2026-09-18",
            reason: "Pengajuan kedua",
        })).rejects.toMatchObject({
            code: "PENDING_EXISTS",
            statusCode: 409,
        });
        expect(db.attendanceCorrection.create).not.toHaveBeenCalled();
    });

    it("allows WIG001's manager-null legacy row to resolve and updates only proposed fields", async () => {
        db.attendanceCorrection.findUnique
            .mockResolvedValueOnce(correction)
            .mockResolvedValueOnce({ ...correction, status: "APPROVED" });
        db.attendanceCorrection.updateMany.mockResolvedValue({ count: 1 });
        // 2026-09-18T01:00:00Z = 08:00 WIB tepat pada shift 08:00 (lateCheckIn 0) -> present
        mockShiftFound("late");
        db.attendanceRecord.upsert.mockResolvedValue({
            id: "attendance-1",
            employeeId: "EMP001",
            date: new Date("2026-09-18T00:00:00.000Z"),
            notes: "Catatan unrelated tetap ada",
        });

        await resolveCorrection("correction-1", "APPROVED", "WIG001");

        expect(db.attendanceCorrection.updateMany).toHaveBeenCalledWith({
            where: { id: "correction-1", status: "PENDING" },
            data: { status: "APPROVED" },
        });
        expect(db.attendanceRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                employeeId_date: {
                    employeeId: "EMP001",
                    date: new Date("2026-09-18T00:00:00.000Z"),
                },
            },
            update: { clockIn: new Date("2026-09-18T01:00:00.000Z"), status: "present" },
        }));
        const upsert = db.attendanceRecord.upsert.mock.calls[0][0];
        expect(upsert.update).not.toHaveProperty("notes");
        expect(upsert.create).not.toHaveProperty("notes");
    });

    it("recomputes late to present when the corrected clock-in is inside tolerance", async () => {
        const early = {
            ...correction,
            targetDate: new Date("2026-09-09T00:00:00.000Z"),
            proposedClockIn: new Date("2026-09-09T00:17:00.000Z"), // 07:17 WIB
            proposedClockOut: new Date("2026-09-09T04:17:00.000Z"),
        };
        db.attendanceCorrection.findUnique
            .mockResolvedValueOnce(early)
            .mockResolvedValueOnce({ ...early, status: "APPROVED" });
        db.attendanceCorrection.updateMany.mockResolvedValue({ count: 1 });
        mockShiftFound("late");
        db.attendanceRecord.upsert.mockResolvedValue({ id: "attendance-9" });

        await resolveCorrection("correction-9", "APPROVED", "WIG001");

        expect(db.attendanceRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
            update: expect.objectContaining({ status: "present" }),
        }));
    });

    it("keeps late when the corrected clock-in is past the shift deadline", async () => {
        const lateCorrection = {
            ...correction,
            proposedClockIn: new Date("2026-09-18T01:01:00.000Z"), // 08:01 WIB > 08:00
        };
        db.attendanceCorrection.findUnique
            .mockResolvedValueOnce(lateCorrection)
            .mockResolvedValueOnce({ ...lateCorrection, status: "APPROVED" });
        db.attendanceCorrection.updateMany.mockResolvedValue({ count: 1 });
        mockShiftFound("late");
        db.attendanceRecord.upsert.mockResolvedValue({ id: "attendance-1" });

        await resolveCorrection("correction-1", "APPROVED", "WIG001");

        expect(db.attendanceRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
            update: expect.objectContaining({ status: "late" }),
        }));
    });

    it("does not touch status for clock-out-only corrections", async () => {
        const outOnly = { ...correction, proposedClockIn: null, proposedClockOut: new Date("2026-09-18T10:00:00.000Z") };
        db.attendanceCorrection.findUnique
            .mockResolvedValueOnce(outOnly)
            .mockResolvedValueOnce({ ...outOnly, status: "APPROVED" });
        db.attendanceCorrection.updateMany.mockResolvedValue({ count: 1 });
        db.attendanceRecord.upsert.mockResolvedValue({ id: "attendance-1" });

        await resolveCorrection("correction-1", "APPROVED", "WIG001");

        const upsert = db.attendanceRecord.upsert.mock.calls[0][0];
        expect(upsert.update).not.toHaveProperty("status");
    });

    it("keeps present for off-day records and skips status without a shift", async () => {
        db.attendanceCorrection.findUnique
            .mockResolvedValueOnce({ ...correction, proposedClockIn: new Date("2026-09-20T03:00:00.000Z") })
            .mockResolvedValueOnce({ ...correction, status: "APPROVED" });
        db.attendanceCorrection.updateMany.mockResolvedValue({ count: 1 });
        db.employee.findUnique.mockResolvedValue({ shiftId: "shift-1" });
        db.workShift.findUnique.mockResolvedValue({
            ...shift0800,
            days: shift0800.days.map((d) => (d.dayOfWeek === 0 ? { ...d, isOff: true } : d)),
        });
        db.attendanceRecord.findUnique.mockResolvedValue({ status: "present", isOffDay: true });
        db.attendanceRecord.upsert.mockResolvedValue({ id: "attendance-1" });

        await resolveCorrection("correction-1", "APPROVED", "WIG001");
        expect(db.attendanceRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
            update: expect.objectContaining({ status: "present" }),
        }));

        vi.resetAllMocks();
        db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
        db.shiftAssignment.findMany.mockResolvedValue([]);
        db.attendanceCorrection.findUnique
            .mockResolvedValueOnce(correction)
            .mockResolvedValueOnce({ ...correction, status: "APPROVED" });
        db.attendanceCorrection.updateMany.mockResolvedValue({ count: 1 });
        db.employee.findUnique.mockResolvedValue({ shiftId: null });
        db.workShift.findFirst.mockResolvedValue(null);
        db.attendanceRecord.findUnique.mockResolvedValue({ status: "late", isOffDay: false });
        db.attendanceRecord.upsert.mockResolvedValue({ id: "attendance-1" });

        await resolveCorrection("correction-1", "APPROVED", "WIG001");
        const upsert = db.attendanceRecord.upsert.mock.calls[0][0];
        expect(upsert.update).not.toHaveProperty("status");
    });

    it("keeps approval and rejection transitions conditional on PENDING", async () => {
        db.attendanceCorrection.findUnique.mockResolvedValue({ ...correction, status: "APPROVED" });
        db.attendanceCorrection.updateMany.mockResolvedValue({ count: 0 });

        await expect(resolveCorrection("correction-1", "REJECTED", "WIG001")).rejects.toMatchObject({
            code: "ALREADY_PROCESSED",
            statusCode: 409,
        });
        expect(db.attendanceRecord.upsert).not.toHaveBeenCalled();
    });

    it("resolves a manager-null request through the WIG001 and hr.manage API workflow", async () => {
        guardMocks.requireAuth.mockResolvedValue({
            username: "WIG001",
            permissions: ["hr.manage"],
            employeeId: null,
        });
        db.attendanceCorrection.findUnique
            .mockResolvedValueOnce(correction)
            .mockResolvedValueOnce({ ...correction, status: "APPROVED" });
        db.attendanceCorrection.updateMany.mockResolvedValue({ count: 1 });
        db.attendanceRecord.upsert.mockResolvedValue({ id: "attendance-1" });

        const response = await PATCH(new NextRequest("http://localhost/api/attendance/correction", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: correction.id, status: "APPROVED" }),
        }));

        expect(response.status).toBe(200);
        expect(db.attendanceCorrection.updateMany).toHaveBeenCalledWith({
            where: { id: correction.id, status: "PENDING" },
            data: { status: "APPROVED" },
        });
    });

    it.each([
        ["WIG001 without hr.manage", { username: "WIG001", permissions: [], employeeId: null }],
        ["another HR user", { username: "WIG999", permissions: ["hr.manage"], employeeId: "EMP999" }],
    ])("rejects correction resolution by %s", async (_label, session) => {
        guardMocks.requireAuth.mockResolvedValue(session);

        const response = await PATCH(new NextRequest("http://localhost/api/attendance/correction", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: correction.id, status: "APPROVED" }),
        }));

        expect(response.status).toBe(403);
        expect(db.attendanceCorrection.findUnique).not.toHaveBeenCalled();
    });

    it("lists all requests only for WIG001 with hr.manage and otherwise lists the employee's own", async () => {        db.attendanceCorrection.findMany.mockResolvedValue([]);
        guardMocks.requireAuth.mockResolvedValue({
            username: "WIG001",
            permissions: ["hr.manage"],
            employeeId: null,
        });

        expect((await GET()).status).toBe(200);
        expect(db.attendanceCorrection.findMany).toHaveBeenLastCalledWith({
            orderBy: { createdAt: "desc" },
        });

        guardMocks.requireAuth.mockResolvedValue({
            username: "EMP002",
            permissions: ["employee.self"],
            employeeId: "EMP002",
        });

        expect((await GET()).status).toBe(200);
        expect(db.attendanceCorrection.findMany).toHaveBeenLastCalledWith({
            where: { employeeId: "EMP002" },
            orderBy: { createdAt: "desc" },
        });
    });
});

describe("validateProposedClockInDate (overnight H+1)", () => {
    const nightShift = {
        id: "shift-night",
        earlyCheckIn: 30,
        lateCheckIn: 15,
        earlyCheckOut: 0,
        lateCheckOut: 60,
        days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            startTime: "23:00",
            endTime: "07:00",
            isOff: false,
        })),
    };

    beforeEach(() => {
        vi.resetAllMocks();
        db.employee.findUnique.mockResolvedValue({ shiftId: "shift-night" });
        db.workShift.findUnique.mockResolvedValue(nightShift);
        db.workShift.findFirst.mockResolvedValue(null);
        db.attendanceRecord.findUnique.mockResolvedValue(null);
        db.shiftAssignment.findMany.mockResolvedValue([]);
    });

    it("accepts clock-in on the target date without shift lookup issues", async () => {
        await expect(validateProposedClockInDate(
            db as never, "EMP001", "2026-09-28", "2026-09-28T23:10:00+07:00"
        )).resolves.toBeUndefined();
    });

    it("accepts H+1 clock-in inside the overnight window", async () => {
        await expect(validateProposedClockInDate(
            db as never, "EMP001", "2026-09-28", "2026-09-29T00:01:00+07:00"
        )).resolves.toBeUndefined();
    });

    it("rejects H+1 clock-in beyond endTime + lateCheckOut", async () => {
        await expect(validateProposedClockInDate(
            db as never, "EMP001", "2026-09-28", "2026-09-29T08:01:00+07:00"
        )).rejects.toMatchObject({ code: "INVALID_CLOCK_IN_DATE", statusCode: 400 });
    });

    it("rejects H+1 clock-in for non-overnight shifts", async () => {
        db.workShift.findUnique.mockResolvedValue({
            ...nightShift,
            days: nightShift.days.map((d) => ({ ...d, startTime: "08:00", endTime: "17:00" })),
        });
        await expect(validateProposedClockInDate(
            db as never, "EMP001", "2026-09-28", "2026-09-29T00:30:00+07:00"
        )).rejects.toMatchObject({ code: "INVALID_CLOCK_IN_DATE", statusCode: 400 });
    });

    it("rejects H+1 clock-in when H+1 already has an attendance record", async () => {
        db.attendanceRecord.findUnique.mockResolvedValue({ id: "attendance-h1" });
        await expect(validateProposedClockInDate(
            db as never, "EMP001", "2026-09-28", "2026-09-29T00:30:00+07:00"
        )).rejects.toMatchObject({ code: "INVALID_CLOCK_IN_DATE", statusCode: 409 });
    });

    it("rejects clock-in on H+2", async () => {
        await expect(validateProposedClockInDate(
            db as never, "EMP001", "2026-09-28", "2026-09-30T00:30:00+07:00"
        )).rejects.toMatchObject({ code: "INVALID_CLOCK_IN_DATE", statusCode: 400 });
    });
});
