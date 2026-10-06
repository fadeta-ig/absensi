export type GreenMeetingOriginType = "DIREKSI" | "DEPARTMENT" | "DIVISION" | "EMPLOYEE" | "LAINNYA";
/** Writer baru hanya TUGAS; reader arsip tetap INFORMASI|TUGAS. */
export type GreenMeetingNoteType = "INFORMASI" | "TUGAS";
export type GreenMeetingNoteCreateType = "TUGAS";
export type GreenMeetingTaskStatus = "BELUM_DIMULAI" | "SEDANG_BERJALAN" | "SELESAI" | "DIBATALKAN";
/** Status arsip legacy (termasuk IZIN lama). Data lama tetap dibaca, tidak dihapus. */
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

/** Status baris per-orang: hanya HADIR/ALPA. IZIN dicatat per dept (DeptIzin). */
export type GreenMeetingPersonStatus = "HADIR" | "ALPA";

export interface GreenMeetingAttendance {
    id: string;
    sessionId: string;
    unitId: string | null;
    employeeId: string | null;
    employeeName: string | null;
    departmentId: string | null;
    departmentName: string | null;
    /** LEGACY read-only: tidak ada kolom division di DB/schema untuk presensi. */
    divisionId?: string | null;
    divisionName?: string | null;
    status: GreenMeetingAttendanceStatus;
    /** LEGACY arsip: tidak lagi ditulis, hanya fallback baca. */
    representativeName?: string | null;
    permitReason?: string | null;
    confirmedAt: string | null;
    confirmedBy: string | null;
    unit?: GreenMeetingUnit | null;
}

export interface GreenMeetingDeptIzin {
    id: string;
    sessionId: string;
    departmentId: string | null;
    /** LEGACY read-only: izin sesi dept-only, tanpa kolom division di DB/schema. */
    divisionId?: string | null;
    reason: string;
    createdBy: string | null;
    createdAt: string;
    department?: { id: string; name: string } | null;
    division?: { id: string; name: string } | null;
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
    deptIzins: GreenMeetingDeptIzin[];
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
