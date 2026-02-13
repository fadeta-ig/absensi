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

export type VisitReport = {
    id: string;
    employeeId: string;
    date: string;
    clientName: string;
    clientAddress: string;
    purpose: string;
    result?: string | null;
    location?: { lat: number; lng: number } | null;
    photo?: string | null;
    status: "pending" | "approved" | "rejected";
    notes?: string | null;
    createdAt: string;
};

export type OvertimeRequest = {
    id: string;
    employeeId: string;
    date: string;
    startTime: string;
    endTime: string;
    hours: number;
    reason: string;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
};
