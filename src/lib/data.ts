// Data layer for the WIG Attendance System — backed by MySQL via Prisma
// All functions are async and use the Prisma ORM

import { prisma } from "./prisma";

// ============== Re-export Types ==============
export type Employee = {
    id: string;
    employeeId: string;
    name: string;
    email: string;
    phone: string;
    department: string;
    position: string;
    role: "employee" | "hr";
    password: string;
    faceDescriptor?: number[];
    joinDate: string;
    totalLeave: number;
    usedLeave: number;
    avatarUrl?: string | null;
    isActive: boolean;
    shiftId?: string | null;
};

export type AttendanceRecord = {
    id: string;
    employeeId: string;
    date: string;
    clockIn?: string | null;
    clockOut?: string | null;
    clockInLocation?: { lat: number; lng: number } | null;
    clockOutLocation?: { lat: number; lng: number } | null;
    clockInPhoto?: string | null;
    clockOutPhoto?: string | null;
    status: "present" | "late" | "absent" | "leave";
    notes?: string | null;
};

export type PayslipRecord = {
    id: string;
    employeeId: string;
    period: string;
    basicSalary: number;
    allowances: { name: string; amount: number }[];
    deductions: { name: string; amount: number }[];
    overtime: number;
    netSalary: number;
    issuedDate: string;
    notes?: string | null;
};

export type WorkShift = {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    isDefault: boolean;
};

export type LeaveRequest = {
    id: string;
    employeeId: string;
    type: "annual" | "sick" | "personal" | "maternity";
    startDate: string;
    endDate: string;
    reason: string;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
};

export type NewsItem = {
    id: string;
    title: string;
    content: string;
    category: "announcement" | "event" | "policy" | "general";
    author: string;
    createdAt: string;
    isPinned: boolean;
};

export type TodoItem = {
    id: string;
    employeeId: string;
    text: string;
    completed: boolean;
    createdAt: string;
};

// ============== Employee CRUD ==============
export async function getEmployees(): Promise<Employee[]> {
    const rows = await prisma.employee.findMany({ orderBy: { name: "asc" } });
    return rows as unknown as Employee[];
}

export async function getEmployeeById(id: string): Promise<Employee | undefined> {
    const row = await prisma.employee.findUnique({ where: { id } });
    return (row as unknown as Employee) ?? undefined;
}

export async function getEmployeeByEmployeeId(employeeId: string): Promise<Employee | undefined> {
    const row = await prisma.employee.findUnique({ where: { employeeId } });
    return (row as unknown as Employee) ?? undefined;
}

export async function createEmployee(data: Omit<Employee, "id">): Promise<Employee> {
    const row = await prisma.employee.create({
        data: {
            employeeId: data.employeeId,
            name: data.name,
            email: data.email,
            phone: data.phone,
            department: data.department,
            position: data.position,
            role: data.role,
            password: data.password,
            joinDate: data.joinDate,
            totalLeave: data.totalLeave,
            usedLeave: data.usedLeave,
            avatarUrl: data.avatarUrl,
            isActive: data.isActive,
            shiftId: data.shiftId,
        },
    });
    return row as unknown as Employee;
}

export async function updateEmployee(id: string, data: Partial<Employee>): Promise<Employee | null> {
    try {
        const row = await prisma.employee.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.email !== undefined && { email: data.email }),
                ...(data.phone !== undefined && { phone: data.phone }),
                ...(data.department !== undefined && { department: data.department }),
                ...(data.position !== undefined && { position: data.position }),
                ...(data.role !== undefined && { role: data.role }),
                ...(data.password !== undefined && { password: data.password }),
                ...(data.joinDate !== undefined && { joinDate: data.joinDate }),
                ...(data.totalLeave !== undefined && { totalLeave: data.totalLeave }),
                ...(data.usedLeave !== undefined && { usedLeave: data.usedLeave }),
                ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
                ...(data.shiftId !== undefined && { shiftId: data.shiftId }),
            },
        });
        return row as unknown as Employee;
    } catch {
        return null;
    }
}

export async function deleteEmployee(id: string): Promise<boolean> {
    try {
        await prisma.employee.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}

// ============== Attendance CRUD ==============
export async function getAttendanceRecords(employeeId?: string): Promise<AttendanceRecord[]> {
    const rows = await prisma.attendanceRecord.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: { date: "desc" },
    });
    return rows.map((r: any) => ({
        ...r,
        clockInLocation: r.clockInLocation as AttendanceRecord["clockInLocation"],
        clockOutLocation: r.clockOutLocation as AttendanceRecord["clockOutLocation"],
        status: r.status as AttendanceRecord["status"],
    }));
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
    };
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
    };
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
        };
    } catch {
        return null;
    }
}

// ============== Payslip CRUD ==============
export async function getPayslips(employeeId?: string): Promise<PayslipRecord[]> {
    const rows = await prisma.payslipRecord.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: { issuedDate: "desc" },
    });
    return rows.map((r: any) => ({
        ...r,
        allowances: r.allowances as PayslipRecord["allowances"],
        deductions: r.deductions as PayslipRecord["deductions"],
    }));
}

export async function createPayslip(data: Omit<PayslipRecord, "id">): Promise<PayslipRecord> {
    const row = await prisma.payslipRecord.create({
        data: {
            employeeId: data.employeeId,
            period: data.period,
            basicSalary: data.basicSalary,
            allowances: JSON.parse(JSON.stringify(data.allowances)),
            deductions: JSON.parse(JSON.stringify(data.deductions)),
            overtime: data.overtime,
            netSalary: data.netSalary,
            issuedDate: data.issuedDate,
            notes: data.notes,
        },
    });
    return {
        ...row,
        allowances: row.allowances as PayslipRecord["allowances"],
        deductions: row.deductions as PayslipRecord["deductions"],
    };
}

// ============== Leave CRUD ==============
export async function getLeaveRequests(employeeId?: string): Promise<LeaveRequest[]> {
    const rows = await prisma.leaveRequest.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: { createdAt: "desc" },
    });
    return rows as unknown as LeaveRequest[];
}

export async function createLeaveRequest(data: Omit<LeaveRequest, "id">): Promise<LeaveRequest> {
    const row = await prisma.leaveRequest.create({
        data: {
            employeeId: data.employeeId,
            type: data.type,
            startDate: data.startDate,
            endDate: data.endDate,
            reason: data.reason,
            status: data.status,
            createdAt: data.createdAt,
        },
    });
    return row as unknown as LeaveRequest;
}

export async function updateLeaveRequest(id: string, data: Partial<LeaveRequest>): Promise<LeaveRequest | null> {
    try {
        const row = await prisma.leaveRequest.update({
            where: { id },
            data: {
                ...(data.status !== undefined && { status: data.status }),
                ...(data.reason !== undefined && { reason: data.reason }),
            },
        });
        return row as unknown as LeaveRequest;
    } catch {
        return null;
    }
}

// ============== News CRUD ==============
export async function getNews(): Promise<NewsItem[]> {
    const rows = await prisma.newsItem.findMany({
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    });
    return rows as unknown as NewsItem[];
}

export async function createNews(data: Omit<NewsItem, "id">): Promise<NewsItem> {
    const row = await prisma.newsItem.create({
        data: {
            title: data.title,
            content: data.content,
            category: data.category,
            author: data.author,
            createdAt: data.createdAt,
            isPinned: data.isPinned,
        },
    });
    return row as unknown as NewsItem;
}

export async function updateNews(id: string, data: Partial<NewsItem>): Promise<NewsItem | null> {
    try {
        const row = await prisma.newsItem.update({
            where: { id },
            data: {
                ...(data.title !== undefined && { title: data.title }),
                ...(data.content !== undefined && { content: data.content }),
                ...(data.category !== undefined && { category: data.category }),
                ...(data.isPinned !== undefined && { isPinned: data.isPinned }),
            },
        });
        return row as unknown as NewsItem;
    } catch {
        return null;
    }
}

export async function deleteNews(id: string): Promise<boolean> {
    try {
        await prisma.newsItem.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}

// ============== Todo CRUD ==============
export async function getTodos(employeeId: string): Promise<TodoItem[]> {
    const rows = await prisma.todoItem.findMany({
        where: { employeeId },
        orderBy: { createdAt: "desc" },
    });
    return rows as unknown as TodoItem[];
}

export async function createTodo(data: Omit<TodoItem, "id">): Promise<TodoItem> {
    const row = await prisma.todoItem.create({
        data: {
            employeeId: data.employeeId,
            text: data.text,
            completed: data.completed,
            createdAt: data.createdAt,
        },
    });
    return row as unknown as TodoItem;
}

export async function updateTodo(id: string, data: Partial<TodoItem>): Promise<TodoItem | null> {
    try {
        const row = await prisma.todoItem.update({
            where: { id },
            data: {
                ...(data.text !== undefined && { text: data.text }),
                ...(data.completed !== undefined && { completed: data.completed }),
            },
        });
        return row as unknown as TodoItem;
    } catch {
        return null;
    }
}

export async function deleteTodo(id: string): Promise<boolean> {
    try {
        await prisma.todoItem.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}

// ============== Shift CRUD ==============
export async function getShifts(): Promise<WorkShift[]> {
    const rows = await prisma.workShift.findMany({ orderBy: { name: "asc" } });
    return rows as unknown as WorkShift[];
}

export async function createShift(data: Omit<WorkShift, "id">): Promise<WorkShift> {
    if (data.isDefault) {
        await prisma.workShift.updateMany({ data: { isDefault: false } });
    }
    const row = await prisma.workShift.create({
        data: {
            name: data.name,
            startTime: data.startTime,
            endTime: data.endTime,
            isDefault: data.isDefault,
        },
    });
    return row as unknown as WorkShift;
}

export async function updateShift(id: string, data: Partial<WorkShift>): Promise<WorkShift | null> {
    try {
        if (data.isDefault) {
            await prisma.workShift.updateMany({ data: { isDefault: false } });
        }
        const row = await prisma.workShift.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.startTime !== undefined && { startTime: data.startTime }),
                ...(data.endTime !== undefined && { endTime: data.endTime }),
                ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
            },
        });
        return row as unknown as WorkShift;
    } catch {
        return null;
    }
}

export async function deleteShift(id: string): Promise<boolean> {
    try {
        await prisma.workShift.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}
