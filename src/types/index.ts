// Shared types for the WIG Attendance System

export interface Employee {
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
    avatarUrl?: string;
    isActive: boolean;
    shiftId?: string;
}

export interface AttendanceRecord {
    id: string;
    employeeId: string;
    date: string;
    clockIn?: string;
    clockOut?: string;
    clockInLocation?: { lat: number; lng: number };
    clockOutLocation?: { lat: number; lng: number };
    clockInPhoto?: string;
    clockOutPhoto?: string;
    status: "present" | "late" | "absent" | "leave";
    notes?: string;
}

export interface PayslipRecord {
    id: string;
    employeeId: string;
    period: string;
    basicSalary: number;
    allowances: { name: string; amount: number }[];
    deductions: { name: string; amount: number }[];
    overtime: number;
    netSalary: number;
    issuedDate: string;
    notes?: string;
}

export interface WorkShift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    isDefault: boolean;
}

export interface LeaveRequest {
    id: string;
    employeeId: string;
    type: "annual" | "sick" | "personal" | "maternity";
    startDate: string;
    endDate: string;
    reason: string;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
}

export interface NewsItem {
    id: string;
    title: string;
    content: string;
    category: "announcement" | "event" | "policy" | "general";
    author: string;
    createdAt: string;
    isPinned: boolean;
}

export interface TodoItem {
    id: string;
    employeeId: string;
    text: string;
    completed: boolean;
    createdAt: string;
}

export interface SessionUser {
    id: string;
    employeeId: string;
    name: string;
    role: "employee" | "hr";
}

