export interface Employee {
    id: string;
    employeeId: string;
    name: string;
    department: string;
    division?: string | null;
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
}

export interface MasterData {
    id: string;
    name: string;
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
