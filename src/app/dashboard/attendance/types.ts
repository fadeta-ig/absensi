export interface Employee {
    id: string;
    employeeId: string;
    name: string;
    department: string;
    division?: string | null;
    position?: string | null;
    phone?: string | null;
    email?: string | null;
    isActive?: boolean;
    shiftId?: string | null;
}

export interface AttendanceLocationInfo {
    lat: number;
    lng: number;
    accuracy?: number;
    clientIp?: string;
    isOfficeWifi?: boolean;
    networkName?: string;
}

export interface AttendanceRecord {
    id: string;
    employeeId: string;
    date: string;
    clockIn?: string;
    clockOut?: string;
    clockInLocation?: AttendanceLocationInfo | null;
    clockOutLocation?: AttendanceLocationInfo | null;
    clockInPhoto?: string | null;
    clockOutPhoto?: string | null;
    status: string;
    isOffDay?: boolean;
    offDayReason?: string | null;
}

export interface MasterData {
    id: string;
    name: string;
    divisionId?: string;
    division?: { name: string };
}

export interface AttendanceCorrection {
    id: string;
    employeeId: string;
    targetDate: string;
    proposedClockIn: string | null;
    proposedClockOut: string | null;
    reason: string;
    attachmentUrl: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED";
    assignedManagerId: string | null;
    createdAt: string;
    employee?: { name: string; employeeId: string };
}

export type AbsentStatusType = "unpresent" | "on_leave" | "off_day";

export interface AbsentEmployee {
    employeeId: string;
    name: string;
    department: string;
    division: string;
    position: string;
    phone: string | null;
    email: string | null;
    statusType: AbsentStatusType;
    statusLabel: string;
    notes?: string | null;
}

export interface LeaveRecordLite {
    id: string;
    employeeId: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
}
