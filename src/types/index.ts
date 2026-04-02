export type Employee = {
    id: string;
    employeeId: string;
    name: string;
    email: string;
    phone: string;
    department: string;
    division?: string | null;
    position: string;
    role: "employee" | "hr" | "ga";
    level: "STAFF" | "SUPERVISOR" | "MANAGER" | "GM" | "HR" | "CEO";
    managerId?: string | null;
    password: string;
    faceDescriptor?: number[];
    joinDate: string;
    totalLeave: number;
    usedLeave: number;
    avatarUrl?: string | null;
    isActive: boolean;
    shiftId?: string | null;
    bypassLocation: boolean;
    basicSalary: number;
    locations?: { id: string; name: string }[];
    payrollComponents?: EmployeePayrollComponent[];
    /** Relasi Prisma — tersedia jika di-include dalam query */
    manager?: { id: string; name: string; employeeId: string } | null;
    subordinates?: { id: string; name: string; employeeId: string; level: string }[];
};

export type EmployeePayrollComponent = {
    id: string;
    employeeId: string;
    componentId: string;
    amount: number;
    component?: {
        id: string;
        name: string;
        type: "allowance" | "deduction";
    };
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

export type WorkShiftDay = {
    id: string;
    shiftId: string;
    dayOfWeek: number; // 0=Sunday, 1=Monday, ... 6=Saturday
    startTime: string;
    endTime: string;
    isOff: boolean;
};

export type WorkShift = {
    id: string;
    name: string;
    isDefault: boolean;
    lateCheckIn: number;
    earlyCheckIn: number;
    lateCheckOut: number;
    earlyCheckOut: number;
    days: WorkShiftDay[];
};

export type LeaveRequest = {
    id: string;
    employeeId: string;
    type: "annual" | "sick" | "personal" | "maternity";
    startDate: string;
    endDate: string;
    reason: string;
    status: "pending" | "approved" | "rejected";
    attachment?: string | null;
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
    mediaUrl?: string | null;
    mediaName?: string | null;
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
    approvedHours?: number | null;
    isHoliday: boolean;
    overtimePay: number;
    reason: string;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
};
