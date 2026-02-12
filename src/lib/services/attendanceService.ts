import { prisma } from "../prisma";
import { AttendanceRecord } from "@/types";

export async function getAttendanceRecords(employeeId?: string): Promise<AttendanceRecord[]> {
    const rows = await prisma.attendanceRecord.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: { date: "desc" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => ({
        ...r,
        clockInLocation: r.clockInLocation as AttendanceRecord["clockInLocation"],
        clockOutLocation: r.clockOutLocation as AttendanceRecord["clockOutLocation"],
        status: r.status as AttendanceRecord["status"],
    })) as AttendanceRecord[];
}

export async function getAttendanceByDate(employeeId: string, date: string): Promise<AttendanceRecord | undefined> {
    const row = await prisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId, date } },
    });
    if (!row) return undefined;
    return {
        ...row,
        clockInLocation: row.clockInLocation as AttendanceRecord["clockInLocation"],
        clockOutLocation: row.clockOutLocation as AttendanceRecord["clockOutLocation"],
        status: row.status as AttendanceRecord["status"],
    } as AttendanceRecord;
}

export async function createAttendance(data: Omit<AttendanceRecord, "id">): Promise<AttendanceRecord> {
    const row = await prisma.attendanceRecord.create({
        data: {
            employeeId: data.employeeId,
            date: data.date,
            clockIn: data.clockIn,
            clockOut: data.clockOut,
            clockInLocation: data.clockInLocation ? JSON.parse(JSON.stringify(data.clockInLocation)) : undefined,
            clockOutLocation: data.clockOutLocation ? JSON.parse(JSON.stringify(data.clockOutLocation)) : undefined,
            clockInPhoto: data.clockInPhoto,
            clockOutPhoto: data.clockOutPhoto,
            status: data.status,
            notes: data.notes,
        },
    });
    return {
        ...row,
        clockInLocation: row.clockInLocation as AttendanceRecord["clockInLocation"],
        clockOutLocation: row.clockOutLocation as AttendanceRecord["clockOutLocation"],
        status: row.status as AttendanceRecord["status"],
    } as AttendanceRecord;
}

export async function updateAttendance(id: string, data: Partial<AttendanceRecord>): Promise<AttendanceRecord | null> {
    try {
        const row = await prisma.attendanceRecord.update({
            where: { id },
            data: {
                ...(data.clockIn !== undefined && { clockIn: data.clockIn }),
                ...(data.clockOut !== undefined && { clockOut: data.clockOut }),
                ...(data.clockInLocation !== undefined && { clockInLocation: data.clockInLocation ? JSON.parse(JSON.stringify(data.clockInLocation)) : null }),
                ...(data.clockOutLocation !== undefined && { clockOutLocation: data.clockOutLocation ? JSON.parse(JSON.stringify(data.clockOutLocation)) : null }),
                ...(data.clockInPhoto !== undefined && { clockInPhoto: data.clockInPhoto }),
                ...(data.clockOutPhoto !== undefined && { clockOutPhoto: data.clockOutPhoto }),
                ...(data.status !== undefined && { status: data.status }),
                ...(data.notes !== undefined && { notes: data.notes }),
            },
        });
        return {
            ...row,
            clockInLocation: row.clockInLocation as AttendanceRecord["clockInLocation"],
            clockOutLocation: row.clockOutLocation as AttendanceRecord["clockOutLocation"],
            status: row.status as AttendanceRecord["status"],
        } as AttendanceRecord;
    } catch {
        return null;
    }
}
