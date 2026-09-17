export type GreenMeetingOriginType = "DIREKSI" | "DEPARTMENT" | "DIVISION" | "EMPLOYEE" | "LAINNYA";
export type GreenMeetingNoteType = "INFORMASI" | "TUGAS";
export type GreenMeetingTaskStatus = "BELUM_DIMULAI" | "SEDANG_BERJALAN" | "SELESAI" | "DIBATALKAN";
export type GreenMeetingAttendanceStatus = "HADIR" | "IZIN" | "ALPA";

export interface DepartmentInfo {
    id: string;
    name: string;
    code: string | null;
    division?: {
        id: string;
        name: string;
    } | null;
}

export interface GreenMeetingUnit {
    id: string;
    departmentId: string;
    isActiveInMeeting: boolean;
    isDefaultRequired: boolean;
    department: DepartmentInfo;
}

export interface GreenMeetingAttendance {
    id: string;
    sessionId: string;
    unitId: string;
    status: GreenMeetingAttendanceStatus;
    representativeName: string | null;
    permitReason: string | null;
    confirmedAt: string | null;
    confirmedBy: string | null;
    unit: GreenMeetingUnit;
}

export interface GreenMeetingDeadline {
    id: string;
    noteId: string;
    sequence: number;
    deadlineDate: string;
    reason: string | null;
    createdBy: string | null;
    createdAt: string;
}

export interface DivisionInfo {
    id: string;
    name: string;
}

export interface EmployeeSearchResult {
    id: string;
    employeeId: string;
    name: string;
    department: string;
    departmentId: string | null;
    division: string;
    divisionId: string | null;
    position: string;
}

export interface GreenMeetingNoteTarget {
    id: string;
    noteId: string;
    targetType: "DEPARTMENT" | "DIVISION" | "EMPLOYEE";
    departmentId?: string | null;
    divisionId?: string | null;
    employeeId?: string | null;
    label?: string | null;
    department?: DepartmentInfo | null;
    division?: DivisionInfo | null;
    employee?: {
        id: string;
        employeeId: string;
        name: string;
    } | null;
}

export interface GreenMeetingNote {
    id: string;
    sessionId: string;
    type: GreenMeetingNoteType;
    content: string;
    originType: GreenMeetingOriginType;
    originName: string;
    isAllTarget: boolean;
    taskStatus: GreenMeetingTaskStatus;
    completedAt: string | null;
    lastEditedAt: string | null;
    lastEditedBy: string | null;
    createdAt: string;
    updatedAt: string;
    targets: GreenMeetingNoteTarget[];
    deadlines: GreenMeetingDeadline[];
    session?: {
        id: string;
        meetingDate: string;
        room: string;
    };
}

export interface GreenMeetingSession {
    id: string;
    meetingDate: string;
    startTime: string;
    endTime: string | null;
    room: string;
    notaryName: string | null;
    generalNotes: string | null;
    isCancelled: boolean;
    cancelReason: string | null;
    attendances: GreenMeetingAttendance[];
    notes: GreenMeetingNote[];
}

export interface GreenMeetingConfig {
    id: string;
    picRole: string;
    defaultRoom: string;
    defaultTime: string;
    maxDeadlineExtensions: number;
    offDaysWeekly: string;
}

export interface GreenMeetingHoliday {
    id: string;
    date: string;
    description: string;
    isRecurring: boolean;
}
