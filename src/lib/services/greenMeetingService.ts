import { prisma } from "@/lib/prisma";
import { normalizeGreenMeetingTarget } from "@/lib/greenMeetingTargeting";
import { toWIBDateString, getWIBDayOfWeek, isValidCalendarDate } from "@/lib/timezone";
import { PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/auth";
import type {
    GreenMeetingNoteType,
    GreenMeetingTaskStatus,
    GreenMeetingAttendanceStatus,
    GreenMeetingOriginType,
} from "@prisma/client";

export class GreenMeetingError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = "GreenMeetingError";
    }
}

/** Predikat kode error Prisma (P2002 duplikat, P2025 tidak ditemukan). */
export function isPrismaError(error: unknown, code: "P2002" | "P2025"): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === code
    );
}

/**
 * Validasi otorisasi apakah user yang sedang login berhak mengelola modul Green Meeting.
 * Sesuai arahan direksi: Tanggung jawab modul dan hak kelola dashboard (write/manage)
 * selamanya berada di tangan General Affairs (WIG002 / GA_ADMIN / ga.manage).
 * HR dan peran lainnya memantau secara Read-Only.
 */
export async function canManageGreenMeeting(session: SessionPayload | null): Promise<boolean> {
    if (!session) return false;

    const permissions = session.permissions || [];
    const roles = session.roles || [];

    return (
        permissions.includes(PERMISSIONS.GA_MANAGE) ||
        roles.includes(SYSTEM_ROLES.GA_ADMIN) ||
        roles.includes(SYSTEM_ROLES.SUPER_ADMIN)
    );
}

/**
 * Mengambil konfigurasi aktif modul Green Meeting.
 * Jika belum ada, otomatis membuat record default.
 * Best practice: upsert atomik agar boot konkuren tidak 500 P2002.
 * Data lama: tidak dihapus, hanya dibuat bila belum ada.
 */
export async function getGreenMeetingConfig() {
    return prisma.greenMeetingConfig.upsert({
        where: { id: "default" },
        update: {},
        create: {
            id: "default",
            picRole: "GA",
            defaultRoom: "Ruang Rapat Utama Lt. 2",
            defaultTime: "08:30",
            maxDeadlineExtensions: 3,
            offDaysWeekly: "0,6",
            updatedBy: "System",
        },
    });
}

/**
 * Memperbarui konfigurasi operasional Green Meeting oleh GA.
 */
export async function updateGreenMeetingConfig(
    data: {
        defaultRoom?: string;
        defaultTime?: string;
        maxDeadlineExtensions?: number;
        offDaysWeekly?: string;
    },
    actorUsername: string = "System"
) {
    return prisma.greenMeetingConfig.upsert({
        where: { id: "default" },
        update: {
            ...data,
            updatedBy: actorUsername,
        },
        create: {
            id: "default",
            picRole: "GA",
            defaultRoom: data.defaultRoom || "Ruang Rapat Utama Lt. 2",
            defaultTime: data.defaultTime || "08:30",
            maxDeadlineExtensions: data.maxDeadlineExtensions ?? 3,
            offDaysWeekly: data.offDaysWeekly || "0,6",
            updatedBy: actorUsername,
        },
    });
}

/**
 * Mengambil daftar seluruh unit kerja Green Meeting (terhubung ke Department HR).
 */
export async function getGreenMeetingUnits() {
    return prisma.greenMeetingUnit.findMany({
        include: {
            department: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                    division: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            department: {
                name: "asc",
            },
        },
    });
}

/**
 * Memperbarui status departemen (aktif/nonaktif atau wajib hadir default).
 * Data lama: soft-exclude saja, riwayat presensi tidak pernah dihapus.
 */
export async function updateGreenMeetingUnit(
    id: string,
    data: {
        isActiveInMeeting?: boolean;
        isDefaultRequired?: boolean;
    }
) {
    try {
        const unit = await prisma.greenMeetingUnit.update({
            where: { id },
            data,
            include: {
                department: true,
            },
        });

        // Nonaktifkan = soft-exclude saja. JANGAN hapus presensi: riwayat harus utuh.
        // (Dulu deleteMany seluruh attendance unit ini — destruktif, dihapus Okt 2026.)
        if (data.isActiveInMeeting === false) {
            // tidak ada penghapusan; baris lama tetap untuk rekap histori
        } else if (data.isActiveInMeeting === true) {
            // tidak ada backfill: sesi baru dibuat per karyawan aktif (lihat getOrCreateTodaySession)
        }

        return unit;
    } catch (error) {
        if (isPrismaError(error, "P2025")) {
            throw new GreenMeetingError("Unit kerja tidak ditemukan.", 404);
        }
        throw error;
    }
}

/**
 * Mengambil daftar hari libur khusus.
 */
export async function getGreenMeetingHolidays() {
    return prisma.greenMeetingHoliday.findMany({
        orderBy: { date: "asc" },
    });
}

/**
 * Menambahkan hari libur khusus baru.
 */
export async function addGreenMeetingHoliday(data: {
    date: string | Date;
    description: string;
    isRecurring?: boolean;
}) {
    if (typeof data.date === "string" && !isValidCalendarDate(data.date)) {
        throw new GreenMeetingError("Tanggal tidak valid. Gunakan YYYY-MM-DD.", 400);
    }
    const holidayDate = new Date(data.date);
    holidayDate.setUTCHours(0, 0, 0, 0);

    // Cegah tanggal lampau: libur hanya untuk hari ini atau masa depan (acuan WIB).
    const todayStr = toWIBDateString();
    const holidayStr = holidayDate.toISOString().slice(0, 10);
    if (holidayStr < todayStr) {
        throw new GreenMeetingError("Tanggal libur tidak boleh di masa lampau.", 400);
    }

    // Eksplisit: tolak duplikat dengan 409 agar UI bisa dedup, bukan timpa diam-diam.
    const existing = await prisma.greenMeetingHoliday.findUnique({
        where: { date: holidayDate },
    });
    if (existing) {
        throw new GreenMeetingError("Hari libur pada tanggal tersebut sudah terdaftar.", 409);
    }

    try {
        return await prisma.greenMeetingHoliday.create({
            data: {
                date: holidayDate,
                description: data.description,
                isRecurring: data.isRecurring ?? false,
            },
        });
    } catch (error) {
        // Balapan double-submit: unique date menang satu, sisanya 409 idempoten.
        if (isPrismaError(error, "P2002")) {
            throw new GreenMeetingError("Hari libur pada tanggal tersebut sudah terdaftar.", 409);
        }
        throw error;
    }
}

/**
 * Menghapus hari libur khusus.
 */
export async function deleteGreenMeetingHoliday(id: string) {
    try {
        return await prisma.greenMeetingHoliday.delete({
            where: { id },
        });
    } catch (error) {
        if (isPrismaError(error, "P2025")) {
            throw new GreenMeetingError("Hari libur tidak ditemukan.", 404);
        }
        throw error;
    }
}

/**
 * Memeriksa apakah tanggal tertentu adalah hari libur (rutin mingguan atau libur khusus).
 */
export async function isDateOffDay(dateInput: Date = new Date()): Promise<{ isOffDay: boolean; reason?: string }> {
    const config = await getGreenMeetingConfig();
    const offDays = (config.offDaysWeekly || "0,6")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

    const dayOfWeek = getWIBDayOfWeek(dateInput);
    if (offDays.includes(dayOfWeek)) {
        return { isOffDay: true, reason: "Hari Libur Rutin Mingguan" };
    }

    const startOfDay = new Date(dateInput);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const holiday = await prisma.greenMeetingHoliday.findUnique({
        where: { date: startOfDay },
    });

    if (holiday) {
        return { isOffDay: true, reason: holiday.description };
    }

    return { isOffDay: false };
}

const attendanceOrderBy = [{ departmentName: "asc" as const }, { employeeName: "asc" as const }];

/** Include sesi penuh bersama (baca; tanpa ubah bentuk respons). */
const meetingSessionInclude = {
    attendances: { orderBy: attendanceOrderBy },
    deptIzins: {
        include: {
            department: { select: { id: true, name: true } },
        },
    },
    notes: {
        include: {
            targets: {
                include: {
                    department: true,
                    division: true,
                    employee: {
                        select: {
                            id: true,
                            employeeId: true,
                            name: true,
                        },
                    },
                },
            },
            deadlines: {
                orderBy: {
                    sequence: "asc" as const,
                },
            },
        },
        orderBy: {
            createdAt: "desc" as const,
        },
    },
};

/**
 * Mengambil sesi rapat tanggal tertentu TANPA membuat (read-only).
 * 404 bila belum ada — tidak seperti getOrCreateTodaySession.
 */
export async function getSessionByDate(dateString?: string) {
    const todayStr = dateString || toWIBDateString();
    if (!isValidCalendarDate(todayStr)) {
        throw new GreenMeetingError("Format tanggal tidak valid. Gunakan YYYY-MM-DD.", 400);
    }
    const sessionDate = new Date(`${todayStr}T00:00:00.000Z`);

    const session = await prisma.greenMeetingSession.findUnique({
        where: { meetingDate: sessionDate },
        include: meetingSessionInclude,
    });
    if (!session) {
        throw new GreenMeetingError("Sesi rapat tanggal tersebut belum dibuat.", 404);
    }
    return session;
}

/**
 * Mengambil atau otomatis membuat sesi rapat (1 baris = 1 karyawan aktif).
 * Sumber daftar: master HR (Employee.isActive) + unit aktif (GreenMeetingUnit.isActiveInMeeting).
 * Default ALPA. Data lama: baris legacy/unit nonaktif tidak dihapus.
 * Idempoten: balapan create ditangkap via unique meetingDate lalu baca ulang.
 */
export async function getOrCreateTodaySession(dateString?: string, actorUsername: string = "System") {
    const todayStr = dateString || toWIBDateString();
    if (!isValidCalendarDate(todayStr)) {
        throw new GreenMeetingError("Format tanggal tidak valid. Gunakan YYYY-MM-DD.", 400);
    }
    const sessionDate = new Date(`${todayStr}T00:00:00.000Z`);

    let session = await prisma.greenMeetingSession.findUnique({
        where: { meetingDate: sessionDate },
        include: meetingSessionInclude,
    });

    if (!session) {
        const config = await getGreenMeetingConfig();
        // Hormati soft-exclude: dept nonaktif tidak dibuatkan baris baru, riwayat lama tetap ada.
        const activeUnits = await prisma.greenMeetingUnit.findMany({
            where: { isActiveInMeeting: true },
            select: { departmentId: true },
        });
        const activeDeptIds = new Set(activeUnits.map((u) => u.departmentId));
        const employees = await prisma.employee.findMany({
            where: { isActive: true },
            select: {
                employeeId: true,
                name: true,
                departmentId: true,
                departmentRel: { select: { name: true } },
            },
            orderBy: { name: "asc" },
        });
        const eligible = employees.filter((e) => !e.departmentId || activeDeptIds.has(e.departmentId));

        try {
            session = await prisma.greenMeetingSession.create({
                data: {
                    meetingDate: sessionDate,
                    room: config.defaultRoom,
                    startTime: config.defaultTime,
                    notaryName: actorUsername,
                    attendances: {
                        create: eligible.map((e) => ({
                            employeeId: e.employeeId,
                            employeeName: e.name,
                            departmentId: e.departmentId,
                            departmentName: e.departmentRel?.name ?? "-",
                            status: "ALPA",
                            confirmedBy: null,
                            confirmedAt: null,
                        })),
                    },
                },
                include: meetingSessionInclude,
            });
        } catch (error) {
            if (isPrismaError(error, "P2002")) {
                session = await prisma.greenMeetingSession.findUniqueOrThrow({
                    where: { meetingDate: sessionDate },
                    include: meetingSessionInclude,
                });
            } else {
                throw error;
            }
        }
    }

    return session;
}

/**
 * Memperbarui metadata sesi rapat (ruangan, waktu, catatan pembuka, atau pembatalan).
 * Data lama: update parsial, tidak menghapus attendances/notes.
 */
export async function updateMeetingSession(
    sessionId: string,
    data: {
        room?: string;
        startTime?: string;
        endTime?: string | null;
        notaryName?: string | null;
        generalNotes?: string | null;
        isCancelled?: boolean;
        cancelReason?: string | null;
    }
) {
    try {
        return await prisma.greenMeetingSession.update({
            where: { id: sessionId },
            data,
        });
    } catch (error) {
        if (isPrismaError(error, "P2025")) {
            throw new GreenMeetingError("Sesi rapat tidak ditemukan.", 404);
        }
        throw error;
    }
}

/**
 * Memperbarui presensi satu karyawan pada sesi rapat (HADIR/ALPA saja).
 * IZIN kini dicatat di level dept (createDeptIzin), bukan per orang.
 * Data lama: baris arsip IZIN/representativeName tidak dihapus, hanya tidak bisa ditulis baru.
 * Idempoten observasional: status sama tidak menulis ulang confirmedAt/confirmedBy.
 */
export async function updateAttendance(
    attendanceId: string,
    data: {
        status: GreenMeetingAttendanceStatus;
    },
    actorUsername: string = "System",
    sessionId?: string
) {
    if (data.status !== "HADIR" && data.status !== "ALPA") {
        throw new GreenMeetingError("Status presensi per orang hanya HADIR atau ALPA. Izin dicatat per dept.", 400);
    }

    try {
        const existing = await prisma.greenMeetingAttendance.findUnique({
            where: { id: attendanceId },
            select: { id: true, sessionId: true, status: true },
        });
        if (!existing) {
            throw new GreenMeetingError("Data presensi tidak ditemukan.", 404);
        }
        // Scope sesi: cegah tulis lintas-sesi via ID.
        if (sessionId && existing.sessionId !== sessionId) {
            throw new GreenMeetingError("Data presensi bukan milik sesi tersebut.", 400);
        }
        if (existing.status === data.status) {
            return prisma.greenMeetingAttendance.findUniqueOrThrow({ where: { id: attendanceId } });
        }

        return await prisma.greenMeetingAttendance.update({
            where: { id: attendanceId },
            data: {
                status: data.status,
                confirmedAt: new Date(),
                confirmedBy: actorUsername,
            },
        });
    } catch (error) {
        if (error instanceof GreenMeetingError) throw error;
        if (isPrismaError(error, "P2025")) {
            throw new GreenMeetingError("Data presensi tidak ditemukan.", 404);
        }
        throw error;
    }
}

/**
 * Aksi Cepat 1-Klik: Menandai seluruh karyawan pada sesi rapat menjadi HADIR.
 * Hanya baris per-orang (employeeId tidak null); baris legacy per-unit tidak ikut.
 * Data lama: baris legacy tidak diubah.
 */
export async function bulkMarkAllPresent(sessionId: string, actorUsername: string = "System") {
    const session = await prisma.greenMeetingSession.findUnique({
        where: { id: sessionId },
        select: { id: true, isCancelled: true },
    });
    if (!session) throw new GreenMeetingError("Sesi rapat tidak ditemukan.", 404);
    if (session.isCancelled) throw new GreenMeetingError("Sesi yang dibatalkan tidak dapat diubah presensinya.", 400);

    await prisma.greenMeetingAttendance.updateMany({
        where: { sessionId, employeeId: { not: null } },
        data: {
            status: "HADIR",
            confirmedAt: new Date(),
            confirmedBy: actorUsername,
        },
    });

    return prisma.greenMeetingAttendance.findMany({
        where: { sessionId, employeeId: { not: null } },
        orderBy: [{ departmentName: "asc" }, { employeeName: "asc" }],
    });
}

/**
 * Aksi Bulk Editor Terpilih: Menandai daftar ID terpilih menjadi status tertentu (HADIR / ALPA).
 * Data lama: baris legacy (employeeId null) tidak ikut; IDs asing ditolak agar tidak sukses palsu.
 */
export async function bulkUpdateAttendanceStatus(
    sessionId: string,
    attendanceIds: string[],
    status: GreenMeetingAttendanceStatus,
    actorUsername: string = "System"
) {
    if (status !== "HADIR" && status !== "ALPA") {
        throw new GreenMeetingError("Status presensi per orang hanya HADIR atau ALPA.", 400);
    }
    const uniqueIds = [...new Set(attendanceIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
        throw new GreenMeetingError("Pilih minimal 1 karyawan.", 400);
    }
    const session = await prisma.greenMeetingSession.findUnique({
        where: { id: sessionId },
        select: { id: true, isCancelled: true },
    });
    if (!session) throw new GreenMeetingError("Sesi rapat tidak ditemukan.", 404);
    if (session.isCancelled) throw new GreenMeetingError("Sesi yang dibatalkan tidak dapat diubah presensinya.", 400);

    // Pastikan semua IDs milik sesi ini dan baris per-orang (lindungi arsip legacy).
    const owned = await prisma.greenMeetingAttendance.findMany({
        where: { sessionId, id: { in: uniqueIds }, employeeId: { not: null } },
        select: { id: true },
    });
    if (owned.length !== uniqueIds.length) {
        throw new GreenMeetingError("Sebagian ID presensi bukan milik sesi tersebut atau baris arsip.", 400);
    }

    await prisma.greenMeetingAttendance.updateMany({
        where: {
            sessionId,
            id: { in: uniqueIds },
        },
        data: {
            status,
            confirmedAt: new Date(),
            confirmedBy: actorUsername,
        },
    });

    return prisma.greenMeetingAttendance.findMany({
        where: { sessionId, employeeId: { not: null } },
        orderBy: [{ departmentName: "asc" }, { employeeName: "asc" }],
    });
}

/**
 * Izin level departemen untuk satu sesi (alasan wajib).
 */
export async function createDeptIzin(
    sessionId: string,
    data: { departmentId?: string | null; reason: string },
    actorUsername: string = "System"
) {
    const departmentId = data.departmentId?.trim() || null;
    const reason = data.reason?.trim() || "";
    if (!departmentId) {
        throw new GreenMeetingError("Izin harus untuk satu departemen.", 400);
    }
    if (reason.length < 3) {
        throw new GreenMeetingError("Alasan izin wajib diisi minimal 3 karakter.", 400);
    }

    const session = await prisma.greenMeetingSession.findUnique({ where: { id: sessionId }, select: { id: true } });
    if (!session) throw new GreenMeetingError("Sesi rapat tidak ditemukan.", 404);
    {
        const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
        if (!dept) throw new GreenMeetingError("Departemen tidak ditemukan.", 404);
    }

    try {
        return await prisma.greenMeetingDeptIzin.create({
            data: {
                sessionId,
                departmentId,
                reason,
                createdBy: actorUsername,
            },
        });
    } catch (error) {
        if (isPrismaError(error, "P2002")) {
            throw new GreenMeetingError("Departemen ini sudah tercatat izin pada sesi tersebut.", 409);
        }
        throw error;
    }
}

export async function deleteDeptIzin(id: string) {
    try {
        return await prisma.greenMeetingDeptIzin.delete({ where: { id } });
    } catch (error) {
        if (isPrismaError(error, "P2025")) {
            throw new GreenMeetingError("Catatan izin tidak ditemukan.", 404);
        }
        throw error;
    }
}

/**
 * Hadirkan cepat 1 karyawan berdasarkan employeeId (cari nama → hadir).
 * Baris dibuat bila belum ada (mis. karyawan baru aktif setelah sesi dibuat),
 * lalu ditandai HADIR. Dept/divisi terisi otomatis dari master HR.
 */
export async function quickMarkPresentByEmployee(
    sessionId: string,
    employeeId: string,
    actorUsername: string = "System"
) {
    const session = await prisma.greenMeetingSession.findUnique({
        where: { id: sessionId },
        select: { id: true, isCancelled: true },
    });
    if (!session) throw new GreenMeetingError("Sesi rapat tidak ditemukan.", 404);
    if (session.isCancelled) throw new GreenMeetingError("Sesi yang dibatalkan tidak dapat diubah presensinya.", 400);

    const employee = await prisma.employee.findUnique({
        where: { employeeId },
        select: {
            employeeId: true,
            name: true,
            isActive: true,
            departmentId: true,
            departmentRel: { select: { name: true } },
        },
    });
    if (!employee || !employee.isActive) {
        throw new GreenMeetingError("Karyawan tidak ditemukan atau sudah tidak aktif.", 404);
    }

    return prisma.greenMeetingAttendance.upsert({
        where: {
            sessionId_employeeId: { sessionId, employeeId: employee.employeeId },
        },
        update: {
            status: "HADIR",
            employeeName: employee.name,
            departmentId: employee.departmentId,
            departmentName: employee.departmentRel?.name ?? "-",
            confirmedAt: new Date(),
            confirmedBy: actorUsername,
        },
        create: {
            sessionId,
            employeeId: employee.employeeId,
            employeeName: employee.name,
            departmentId: employee.departmentId,
            departmentName: employee.departmentRel?.name ?? "-",
            status: "HADIR",
            confirmedAt: new Date(),
            confirmedBy: actorUsername,
        },
    });
}

export type DeptRepresentationStatus = "HADIR" | "IZIN" | "ALPA";

export interface DeptRepresentation {
    departmentId: string;
    departmentName: string;
    totalAnggota: number;
    hadir: number;
    status: DeptRepresentationStatus;
    izinReason: string | null;
}

/**
 * Keterwakilan dept satu sesi.
 * HADIR bila >=1 anggotanya HADIR; IZIN bila ada catatan izin (dan 0 hadir); ALPA bila tidak ada keduanya.
 * Data lama: baris legacy tidak dihitung di sini (ditangani rekap terpisah); dept izin-only tetap muncul.
 */
export function computeRepresentation(
    attendances: Array<{
        employeeId: string | null;
        departmentId: string | null;
        departmentName: string | null;
        status: GreenMeetingAttendanceStatus;
    }>,
    izins: Array<{ departmentId: string | null; reason: string }>
): { departments: DeptRepresentation[] } {
    const deptMap = new Map<string, DeptRepresentation>();
    const ensureDept = (departmentId: string, departmentName?: string | null) => {
        let entry = deptMap.get(departmentId);
        if (!entry) {
            entry = {
                departmentId,
                departmentName: departmentName ?? "-",
                totalAnggota: 0,
                hadir: 0,
                status: "ALPA",
                izinReason: null,
            };
            deptMap.set(departmentId, entry);
        }
        return entry;
    };
    for (const att of attendances) {
        if (!att.employeeId || !att.departmentId) continue;
        const entry = ensureDept(att.departmentId, att.departmentName);
        entry.totalAnggota += 1;
        if (att.status === "HADIR") entry.hadir += 1;
    }
    const izinByDept = new Map<string, string>();
    for (const izin of izins) {
        if (izin.departmentId && !izinByDept.has(izin.departmentId)) {
            izinByDept.set(izin.departmentId, izin.reason);
            // Dept izin-only tanpa baris person tetap terwakili sebagai IZIN.
            ensureDept(izin.departmentId);
        }
    }
    for (const entry of deptMap.values()) {
        if (entry.hadir > 0) {
            entry.status = "HADIR";
        } else if (entry.departmentId && izinByDept.has(entry.departmentId)) {
            entry.status = "IZIN";
            entry.izinReason = izinByDept.get(entry.departmentId) || null;
        } else {
            entry.status = "ALPA";
        }
    }
    const departments = [...deptMap.values()].sort((a, b) => a.departmentName.localeCompare(b.departmentName));

    return { departments };
}

export interface NoteTargetItem {
    targetType: "DEPARTMENT" | "DIVISION" | "EMPLOYEE";
    departmentId?: string | null;
    divisionId?: string | null;
    employeeId?: string | null;
    label?: string | null;
}

export interface MeetingNoteUpdateInput {
    type?: GreenMeetingNoteType;
    content?: string;
    originType?: GreenMeetingOriginType;
    originName?: string;
    isAllTarget?: boolean;
    targets?: NoteTargetItem[];
    initialDeadlineDate?: string;
    changeReason: string;
}

export interface MeetingNoteEditor {
    userId?: string | null;
    username: string;
    name?: string | null;
    role?: string | null;
}

const meetingNoteInclude = {
    targets: {
        include: {
            department: true,
            division: true,
            employee: {
                select: {
                    id: true,
                    employeeId: true,
                    name: true,
                },
            },
        },
    },
    deadlines: {
        orderBy: {
            sequence: "asc" as const,
        },
    },
};

/**
 * Memperbarui notulensi tanpa silent overwrite. Snapshot lama disimpan
 * sebagai revisi append-only dalam transaksi yang sama dengan update note.
 */
export async function updateMeetingNote(
    noteId: string,
    data: MeetingNoteUpdateInput,
    editor: MeetingNoteEditor
) {
    return prisma.$transaction(async (tx) => {
        const existing = await tx.greenMeetingNote.findUnique({
            where: { id: noteId },
            include: meetingNoteInclude,
        });

        if (!existing) {
            throw new GreenMeetingError("Catatan notulen tidak ditemukan.", 404);
        }

        const requestedType = data.type ?? existing.type;
        // Writer baru TUGAS-only: tolak konversi apapun menjadi INFORMASI.
        // Arsip INFORMASI boleh direvisi konten/targets-nya tanpa ganti type.
        if (requestedType === "INFORMASI" && existing.type !== "INFORMASI") {
            throw new GreenMeetingError("Catatan baru hanya bertipe Tugas. Arsip Informasi bersifat read-only.", 400);
        }
        if (
            existing.type === "TUGAS" &&
            requestedType === "INFORMASI" &&
            (existing.taskStatus !== "BELUM_DIMULAI" || existing.deadlines.length > 1)
        ) {
            throw new GreenMeetingError(
                "Tugas yang sudah berjalan, selesai, dibatalkan, atau pernah diperpanjang tidak dapat diubah menjadi Informasi.",
                400
            );
        }

        if (requestedType === "TUGAS" && !data.initialDeadlineDate && existing.type !== "TUGAS") {
            throw new GreenMeetingError("Tenggat waktu awal wajib diisi saat mengubah Informasi menjadi Tugas.", 400);
        }

        if (
            existing.type === "TUGAS" &&
            data.initialDeadlineDate &&
            existing.deadlines.length > 1
        ) {
            const currentInitialDate = existing.deadlines[0]?.deadlineDate.toISOString().slice(0, 10);
            if (currentInitialDate !== data.initialDeadlineDate) {
                throw new GreenMeetingError(
                    "Deadline awal tidak dapat diubah setelah terdapat riwayat perpanjangan.",
                    400
                );
            }
        }

        const revisionNumber = await tx.greenMeetingNoteRevision.count({ where: { noteId } }) + 1;
        const previousData = {
            type: existing.type,
            content: existing.content,
            originType: existing.originType,
            originName: existing.originName,
            isAllTarget: existing.isAllTarget,
            taskStatus: existing.taskStatus,
            targets: existing.targets.map((target) => ({
                targetType: target.targetType,
                departmentId: target.departmentId,
                divisionId: target.divisionId,
                employeeId: target.employeeId,
                label: target.label,
            })),
            deadlines: existing.deadlines.map((deadline) => ({
                sequence: deadline.sequence,
                deadlineDate: deadline.deadlineDate.toISOString(),
                reason: deadline.reason,
            })),
        };

        try {
            await tx.greenMeetingNoteRevision.create({
                data: {
                    noteId,
                    revisionNumber,
                    changeReason: data.changeReason.trim(),
                    changedBy: editor.username,
                    previousData,
                },
            });
        } catch (error) {
            // Balapan dua editor: count sama → unique (noteId, revisionNumber) tabrakan.
            // Data lama tidak hilang; lempar 409 agar UI muat ulang lalu coba lagi.
            if (isPrismaError(error, "P2002")) {
                throw new GreenMeetingError("Perubahan bersamaan terdeteksi. Muat ulang lalu coba lagi.", 409);
            }
            throw error;
        }

        await tx.greenMeetingNoteTarget.deleteMany({ where: { noteId } });

        // PATCH parsial: field tak dikirim fallback ke existing (data lama tidak hilang).
        const nextType = data.type ?? existing.type;
        const nextContent = data.content ?? existing.content;
        const nextOriginType = data.originType ?? existing.originType;
        const nextOriginName = data.originName ?? existing.originName;
        const nextIsAll = data.isAllTarget ?? existing.isAllTarget;
        const targets = nextIsAll ? [] : (data.targets ?? existing.targets.map((t) => ({
            targetType: t.targetType as NoteTargetItem["targetType"],
            departmentId: t.departmentId,
            divisionId: t.divisionId,
            employeeId: t.employeeId,
            label: t.label,
        })));
        const changingToTask = existing.type !== "TUGAS" && nextType === "TUGAS";
        const changingToInformation = existing.type === "TUGAS" && nextType === "INFORMASI";

        if (changingToTask && data.initialDeadlineDate) {
            await tx.greenMeetingDeadlineHistory.create({
                data: {
                    noteId,
                    sequence: 1,
                    deadlineDate: new Date(`${data.initialDeadlineDate}T00:00:00.000Z`),
                    reason: "Tenggat Waktu Awal",
                    createdBy: editor.username,
                },
            });
        } else if (
            existing.type === "TUGAS" &&
            data.initialDeadlineDate &&
            existing.deadlines.length === 1
        ) {
            await tx.greenMeetingDeadlineHistory.update({
                where: { id: existing.deadlines[0].id },
                data: {
                    deadlineDate: new Date(`${data.initialDeadlineDate}T00:00:00.000Z`),
                    reason: `Koreksi deadline awal: ${data.changeReason.trim()}`,
                    createdBy: editor.username,
                },
            });
        }

        const updated = await tx.greenMeetingNote.update({
            where: { id: noteId },
            data: {
                type: nextType,
                content: nextContent.trim(),
                originType: nextOriginType,
                originName: nextOriginName.trim(),
                isAllTarget: nextIsAll,
                taskStatus: changingToTask ? "BELUM_DIMULAI" : existing.taskStatus,
                completedAt: changingToInformation ? null : existing.completedAt,
                lastEditedAt: new Date(),
                lastEditedBy: editor.username,
                targets: targets.length > 0
                    ? {
                        create: targets.map(normalizeGreenMeetingTarget),
                    }
                    : undefined,
            },
            include: meetingNoteInclude,
        });

        await tx.auditLog.create({
            data: {
                action: "UPDATE_GREEN_MEETING_NOTE",
                entity: "GREEN_MEETING_NOTE",
                actorType: "USER",
                actorUserId: editor.userId ?? null,
                actorIdentifier: editor.username,
                actorName: editor.name ?? null,
                actorRole: editor.role ?? null,
                entityId: noteId,
                details: JSON.stringify({ revisionNumber, changeReason: data.changeReason.trim() }),
            },
        });

        return updated;
    });
}

export async function getMeetingNoteRevisions(noteId: string) {
    const note = await prisma.greenMeetingNote.findUnique({
        where: { id: noteId },
        select: { id: true },
    });

    if (!note) {
        throw new GreenMeetingError("Catatan notulen tidak ditemukan.", 404);
    }

    return prisma.greenMeetingNoteRevision.findMany({
        where: { noteId },
        orderBy: { revisionNumber: "desc" },
    });
}

/**
 * Membuat butir notulen rapat baru (khusus Tugas ber-deadline).
 * Arsip Informasi lama tetap dibaca, tidak bisa dibuat baru.
 * Mendukung penargetan From ➔ To (Semua Karyawan, perorangan, divisi, atau departemen).
 */
export async function createMeetingNote(
    sessionId: string,
    data: {
        type: GreenMeetingNoteType;
        content: string;
        originType?: GreenMeetingOriginType;
        originName?: string;
        isAllTarget?: boolean;
        targets?: NoteTargetItem[];
        targetDepartmentIds?: string[];
        initialDeadlineDate?: string; // YYYY-MM-DD (wajib untuk Tugas)
    },
    actorUsername: string = "System"
) {
    // Writer baru TUGAS-only; arsip INFORMASI read-only.
    if (data.type !== "TUGAS") {
        throw new GreenMeetingError("Catatan baru hanya bertipe Tugas. Arsip Informasi bersifat read-only.", 400);
    }
    if (!data.initialDeadlineDate) {
        throw new GreenMeetingError("Tenggat waktu awal (Deadline 1) wajib ditentukan untuk catatan bertipe Tugas.", 400);
    }
    if (data.type === "TUGAS" && data.initialDeadlineDate && !isValidCalendarDate(data.initialDeadlineDate)) {
        throw new GreenMeetingError("Tanggal tidak valid. Gunakan YYYY-MM-DD.", 400);
    }

    const isAll = data.isAllTarget !== false;

    // Gabungkan input targets atau targetDepartmentIds
    const rawTargets: NoteTargetItem[] = [];
    if (!isAll) {
        if (data.targets && data.targets.length > 0) {
            rawTargets.push(...data.targets);
        } else if (data.targetDepartmentIds && data.targetDepartmentIds.length > 0) {
            rawTargets.push(
                ...data.targetDepartmentIds.map((deptId) => ({
                    targetType: "DEPARTMENT" as const,
                    departmentId: deptId,
                }))
            );
        }
    }

    const note = await prisma.greenMeetingNote.create({
        data: {
            sessionId,
            type: data.type,
            content: data.content.trim(),
            originType: data.originType || "DIREKSI",
            originName: data.originName?.trim() || (data.originType === "DIREKSI" ? "Direksi" : "Departemen"),
            isAllTarget: isAll,
            taskStatus: data.type === "TUGAS" ? "BELUM_DIMULAI" : undefined,
            targets: rawTargets.length > 0
                ? {
                    create: rawTargets.map(normalizeGreenMeetingTarget),
                }
                : undefined,
            deadlines: data.type === "TUGAS" && data.initialDeadlineDate
                ? {
                    create: {
                        sequence: 1,
                        deadlineDate: new Date(`${data.initialDeadlineDate}T00:00:00.000Z`),
                        reason: "Tenggat Waktu Awal",
                        createdBy: actorUsername,
                    },
                }
                : undefined,
        },
        include: {
            targets: {
                include: {
                    department: true,
                    division: true,
                    employee: {
                        select: {
                            id: true,
                            employeeId: true,
                            name: true,
                        },
                    },
                },
            },
            deadlines: {
                orderBy: {
                    sequence: "asc",
                },
            },
        },
    });

    return note;
}

/**
 * Memperbarui status eksekusi tugas.
 * Data lama: transisi tercatat; baca-tulis dalam transaksi agar TOCTOU tipe terhindar.
 */
export async function updateNoteTaskStatus(
    noteId: string,
    taskStatus: GreenMeetingTaskStatus,
    actorUsername: string = "System"
) {
    const isComplete = taskStatus === "SELESAI";
    try {
        return await prisma.$transaction(async (tx) => {
            const note = await tx.greenMeetingNote.findUnique({
                where: { id: noteId },
                select: { type: true },
            });
            if (!note) {
                throw new GreenMeetingError("Catatan notulen tidak ditemukan.", 404);
            }
            if (note.type !== "TUGAS") {
                throw new GreenMeetingError("Hanya catatan bertipe Tugas yang memiliki status pengerjaan.", 400);
            }
            const updated = await tx.greenMeetingNote.update({
                where: { id: noteId },
                data: {
                    taskStatus,
                    completedAt: isComplete ? new Date() : null,
                },
                include: {
                    targets: {
                        include: {
                            department: true,
                        },
                    },
                    deadlines: {
                        orderBy: {
                            sequence: "asc",
                        },
                    },
                },
            });
            await tx.auditLog.create({
                data: {
                    action: "UPDATE_GREEN_MEETING_TASK_STATUS",
                    entity: "GREEN_MEETING_NOTE",
                    actorType: "USER",
                    actorIdentifier: actorUsername,
                    entityId: noteId,
                    details: JSON.stringify({ taskStatus }),
                },
            });
            return updated;
        });
    } catch (error) {
        if (error instanceof GreenMeetingError) throw error;
        if (isPrismaError(error, "P2025")) {
            throw new GreenMeetingError("Catatan notulen tidak ditemukan.", 404);
        }
        throw error;
    }
}

/**
 * Memperpanjang tenggat waktu tugas (Multi-Deadline Extension).
 * Memeriksa kuota batas perpanjangan dari GreenMeetingConfig dan mencatat riwayat kronologis.
 */
export async function extendTaskDeadline(
    noteId: string,
    newDeadlineDateStr: string,
    reason: string,
    actorUsername: string = "System"
) {
    const note = await prisma.greenMeetingNote.findUnique({
        where: { id: noteId },
        include: {
            deadlines: {
                orderBy: { sequence: "asc" },
            },
        },
    });

    if (!note) {
        throw new GreenMeetingError("Catatan notulen tidak ditemukan.", 404);
    }

    if (note.type !== "TUGAS") {
        throw new GreenMeetingError("Hanya catatan bertipe Tugas yang memiliki tenggat waktu.", 400);
    }
    if (note.taskStatus === "SELESAI" || note.taskStatus === "DIBATALKAN") {
        throw new GreenMeetingError("Tugas yang sudah selesai atau dibatalkan tidak dapat diperpanjang.", 400);
    }

    if (!reason || reason.trim().length < 5) {
        throw new GreenMeetingError("Alasan perpanjangan deadline wajib diisi minimal 5 karakter.", 400);
    }

    if (!isValidCalendarDate(newDeadlineDateStr)) {
        throw new GreenMeetingError("Format tanggal tidak valid. Gunakan YYYY-MM-DD.", 400);
    }
    // Cek kuota awal (UX cepat); cek otoritatif di dalam transaksi agar tidak basi.
    const earlyConfig = await getGreenMeetingConfig();
    const earlyMax = earlyConfig.maxDeadlineExtensions;
    if (Math.max(0, note.deadlines.length - 1) >= earlyMax) {
        throw new GreenMeetingError(
            `Batas toleransi perpanjangan telah tercapai (Maksimal ${earlyMax} kali perpanjangan).`,
            400
        );
    }
    const lastDeadline = note.deadlines[note.deadlines.length - 1];
    const lastDateStr = lastDeadline ? lastDeadline.deadlineDate.toISOString().slice(0, 10) : null;
    if (lastDateStr && newDeadlineDateStr <= lastDateStr) {
        throw new GreenMeetingError("Tanggal baru harus lebih lambat dari tenggat terakhir.", 400);
    }
    const newDeadlineDate = new Date(`${newDeadlineDateStr}T00:00:00.000Z`);

    try {
        return await prisma.$transaction(async (tx) => {
            // Kunci baris note agar dua perpanjangan bersamaan tidak jebol kuota.
            await tx.$queryRaw`SELECT id FROM green_meeting_notes WHERE id = ${noteId} FOR UPDATE`;
            // Baca config di dalam transaksi agar kuota tidak basi saat diubah bersamaan.
            const freshConfig = await tx.greenMeetingConfig.findUnique({ where: { id: "default" } });
            const maxExtensions = freshConfig?.maxDeadlineExtensions ?? 3;
            const fresh = await tx.greenMeetingNote.findUnique({
                where: { id: noteId },
                include: { deadlines: { orderBy: { sequence: "asc" } } },
            });
            if (!fresh) throw new GreenMeetingError("Catatan notulen tidak ditemukan.", 404);
            if (fresh.taskStatus === "SELESAI" || fresh.taskStatus === "DIBATALKAN") {
                throw new GreenMeetingError("Tugas yang sudah selesai atau dibatalkan tidak dapat diperpanjang.", 400);
            }
            if (Math.max(0, fresh.deadlines.length - 1) >= maxExtensions) {
                throw new GreenMeetingError(
                    `Batas toleransi perpanjangan telah tercapai (Maksimal ${maxExtensions} kali perpanjangan).`,
                    400
                );
            }
            const freshLast = fresh.deadlines[fresh.deadlines.length - 1];
            const freshLastStr = freshLast ? freshLast.deadlineDate.toISOString().slice(0, 10) : null;
            if (freshLastStr && newDeadlineDateStr <= freshLastStr) {
                throw new GreenMeetingError("Tanggal baru harus lebih lambat dari tenggat terakhir.", 400);
            }

            // Sequence = max+1 (tahan gap bila riwayat pernah dihapus manual).
            const nextSequence = fresh.deadlines.reduce((max, d) => Math.max(max, d.sequence), 0) + 1;
            await tx.greenMeetingDeadlineHistory.create({
                data: {
                    noteId,
                    sequence: nextSequence,
                    deadlineDate: newDeadlineDate,
                    reason: reason.trim(),
                    createdBy: actorUsername,
                },
            });

            // Otomatis pastikan taskStatus menjadi SEDANG_BERJALAN
            const extended = await tx.greenMeetingNote.update({
                where: { id: noteId },
                data: {
                    taskStatus: "SEDANG_BERJALAN",
                },
                include: {
                    targets: {
                        include: {
                            department: true,
                        },
                    },
                    deadlines: {
                        orderBy: { sequence: "asc" },
                    },
                },
            });
            await tx.auditLog.create({
                data: {
                    action: "EXTEND_GREEN_MEETING_DEADLINE",
                    entity: "GREEN_MEETING_NOTE",
                    actorType: "USER",
                    actorIdentifier: actorUsername,
                    entityId: noteId,
                    details: JSON.stringify({ newDeadlineDate: newDeadlineDateStr, sequence: nextSequence }),
                },
            });
            return extended;
        });
    } catch (error) {
        if (error instanceof GreenMeetingError) throw error;
        if (isPrismaError(error, "P2002")) {
            throw new GreenMeetingError("Perpanjangan bersamaan terdeteksi. Muat ulang lalu coba lagi.", 409);
        }
        throw error;
    }
}

/**
 * Mengambil seluruh tugas yang masih aktif / berjalan untuk Action Items Tracker & Morning HUD.
 * Dengan includeCompleted=true ikut sertakan SELESAI/DIBATALKAN (untuk tab Selesai/Semua).
 */
export async function getAllActiveTasks(includeCompleted = false) {
    return prisma.greenMeetingNote.findMany({
        where: {
            type: "TUGAS",
            taskStatus: {
                in: includeCompleted
                    ? ["BELUM_DIMULAI", "SEDANG_BERJALAN", "SELESAI", "DIBATALKAN"]
                    : ["BELUM_DIMULAI", "SEDANG_BERJALAN"],
            },
        },
        include: {
            session: {
                select: {
                    id: true,
                    meetingDate: true,
                    room: true,
                },
            },
            targets: {
                include: {
                    department: true,
                    division: true,
                    employee: {
                        select: {
                            id: true,
                            employeeId: true,
                            name: true,
                        },
                    },
                },
            },
            deadlines: {
                orderBy: { sequence: "asc" },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });
}

/**
 * Mengambil tugas yang relevan untuk satu departemen/karyawan tertentu (digunakan oleh portal karyawan).
 */
export async function getDepartmentTasks(
    departmentId?: string | null,
    employeeId?: string | null,
    divisionId?: string | null
) {
    const orConditions: Array<{
        isAllTarget?: boolean;
        targets?: {
            some: {
                targetType?: "DEPARTMENT" | "DIVISION" | "EMPLOYEE";
                departmentId?: string;
                divisionId?: string;
                employeeId?: string;
            };
        };
    }> = [{ isAllTarget: true }];

    if (departmentId) {
        orConditions.push({
            targets: {
                some: {
                    targetType: "DEPARTMENT",
                    departmentId,
                },
            },
        });
    }

    if (divisionId) {
        orConditions.push({
            targets: {
                some: {
                    targetType: "DIVISION",
                    divisionId,
                },
            },
        });
    }

    if (employeeId) {
        orConditions.push({
            targets: {
                some: {
                    targetType: "EMPLOYEE",
                    employeeId,
                },
            },
        });
    }

    return prisma.greenMeetingNote.findMany({
        where: {
            type: "TUGAS",
            OR: orConditions,
        },
        include: {
            session: {
                select: {
                    id: true,
                    meetingDate: true,
                },
            },
            targets: {
                include: {
                    department: true,
                    division: true,
                    employee: {
                        select: {
                            id: true,
                            employeeId: true,
                            name: true,
                        },
                    },
                },
            },
            deadlines: {
                orderBy: { sequence: "asc" },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });
}

/**
 * Mengambil rekapitulasi data kehadiran dan status tugas untuk pelaporan/ekspor.
 */
export interface GreenMeetingMemberStat {
    employeeId: string;
    name: string;
    departmentName: string;
    hadir: number;
    alpa: number;
    /** Izin dept pada sesi di mana anggota ini tercatat (info, tidak mengurangi alpa kompatibel). */
    izin?: number;
    totalSesi: number;
}

export interface GreenMeetingDeptStat {
    departmentId: string;
    departmentName: string;
    totalSesi: number;
    sesiHadir: number;
    sesiIzin: number;
    sesiAlpa: number;
}

export async function getMeetingRecap(
    startDateStr: string,
    endDateStr: string,
    options?: { includeSessions?: boolean }
) {
    const startDate = new Date(`${startDateStr}T00:00:00.000Z`);
    const endDate = new Date(`${endDateStr}T23:59:59.999Z`);
    const includeSessions = options?.includeSessions === true;

    const sessions = await prisma.greenMeetingSession.findMany({
        where: {
            meetingDate: {
                gte: startDate,
                lte: endDate,
            },
        },
        include: {
            attendances: {
                // Proyeksi ringan: tanpa include unit.department.division berlapis untuk rekap.
                // Data lama tetap dibaca via employeeId/unitId snapshot.
                select: {
                    id: true,
                    sessionId: true,
                    unitId: true,
                    employeeId: true,
                    employeeName: true,
                    departmentId: true,
                    departmentName: true,
                    status: true,
                    unit: {
                        select: {
                            department: { select: { id: true, name: true } },
                        },
                    },
                },
            },
            deptIzins: {
                include: {
                    department: { select: { id: true, name: true } },
                },
            },
            notes: {
                select: {
                    id: true,
                    type: true,
                    taskStatus: true,
                    deadlines: { select: { id: true, sequence: true }, orderBy: { sequence: "asc" } },
                    targets: { select: { id: true } },
                },
            },
        },
        orderBy: {
            meetingDate: "asc",
        },
        // Batas aman: 366 hari tanpa paginasi bisa MB-an; 500 sesi cukup untuk 366 hari + buffer.
        take: 500,
    });

    const memberMap = new Map<string, GreenMeetingMemberStat>();
    // deptKey -> per-session aggregation temp
    const deptSessions = new Map<string, {
        departmentId: string;
        departmentName: string;
        sesi: Map<string, { hadir: number; izin: boolean; legacy: "HADIR" | "IZIN" | "ALPA" | null; person: boolean }>;
    }>();

    const ensureDept = (departmentId: string, departmentName: string) => {
        let entry = deptSessions.get(departmentId);
        if (!entry) {
            entry = { departmentId, departmentName, sesi: new Map() };
            deptSessions.set(departmentId, entry);
        }
        return entry;
    };

    for (const session of sessions) {
        const personRows = session.attendances.filter((a) => a.employeeId);
        const legacyRows = session.attendances.filter((a) => !a.employeeId && a.unitId);
        const izins = session.deptIzins ?? [];
        const izinDeptIds = new Set(izins.map((i) => i.departmentId).filter(Boolean) as string[]);

        for (const att of personRows) {
            const key = att.employeeId as string;
            let stat = memberMap.get(key);
            if (!stat) {
                stat = {
                    employeeId: key,
                    name: att.employeeName ?? "-",
                    departmentName: att.departmentName ?? "-",
                    hadir: 0,
                    alpa: 0,
                    izin: 0,
                    totalSesi: 0,
                };
                memberMap.set(key, stat);
            }
            stat.totalSesi += 1;
            if (att.status === "HADIR") stat.hadir += 1;
            else if (att.departmentId && izinDeptIds.has(att.departmentId)) stat.izin = (stat.izin ?? 0) + 1;
            else stat.alpa += 1;

            if (att.departmentId) {
                const dept = ensureDept(att.departmentId, att.departmentName ?? "-");
                let s = dept.sesi.get(session.id);
                if (!s) {
                    s = { hadir: 0, izin: false, legacy: null, person: false };
                    dept.sesi.set(session.id, s);
                }
                if (att.status === "HADIR") s.hadir += 1;
                s.person = true;
            }
        }

        for (const att of legacyRows) {
            const deptId = att.unit?.department?.id;
            if (!deptId) continue;
            const dept = ensureDept(
                deptId,
                att.unit?.department?.name ?? "-"
            );
            let s = dept.sesi.get(session.id);
            if (!s) {
                s = { hadir: 0, izin: false, legacy: null, person: false };
                dept.sesi.set(session.id, s);
            }
            // Baris per-orang menang bila dept itu sudah punya baris person di sesi ini.
            if (att.status === "HADIR" && s.hadir === 0) s.legacy = "HADIR";
            else if (att.status === "IZIN" && s.legacy === null) s.legacy = "IZIN";
            else if (s.legacy === null) s.legacy = "ALPA";
        }

        for (const izin of izins) {
            if (izin.departmentId) {
                const dept = ensureDept(
                    izin.departmentId,
                    izin.department?.name ?? "-"
                );
                let s = dept.sesi.get(session.id);
                if (!s) {
                    s = { hadir: 0, izin: false, legacy: null, person: false };
                    dept.sesi.set(session.id, s);
                }
                s.izin = true;
            }
        }
    }

    const buildDeptStats = (onlyPerson: boolean): GreenMeetingDeptStat[] =>
        [...deptSessions.values()]
            .map((dept) => {
                let sesiHadir = 0;
                let sesiIzin = 0;
                let sesiAlpa = 0;
                for (const s of dept.sesi.values()) {
                    if (s.person !== onlyPerson) continue;
                    // Arsip: sesi legacy tanpa baris per-orang.
                    if (!onlyPerson && s.legacy === null && !s.izin) continue;
                    if (s.hadir > 0) sesiHadir += 1;
                    else if (s.izin || s.legacy === "IZIN") sesiIzin += 1;
                    else sesiAlpa += 1;
                }
                return {
                    departmentId: dept.departmentId,
                    departmentName: dept.departmentName,
                    totalSesi: sesiHadir + sesiIzin + sesiAlpa,
                    sesiHadir,
                    sesiIzin,
                    sesiAlpa,
                };
            })
            .filter((d) => d.totalSesi > 0)
            .sort((a, b) => a.departmentName.localeCompare(b.departmentName));

    // Data baru (per-orang). Arsip sesi lama dipisah agar tidak campur.
    const deptStats = buildDeptStats(true);
    const archiveStats = buildDeptStats(false);
    const archiveSessionIds = new Set<string>();
    for (const dept of deptSessions.values()) {
        for (const [sessionId, s] of dept.sesi) {
            if (!s.person && (s.legacy !== null || s.izin)) archiveSessionIds.add(sessionId);
        }
    }

    const memberStats: GreenMeetingMemberStat[] = [...memberMap.values()]
        .sort((a, b) => b.hadir - a.hadir || a.name.localeCompare(b.name));

    const kpi = {
        totalHadir: memberStats.reduce((sum, m) => sum + m.hadir, 0),
        totalAlpa: memberStats.reduce((sum, m) => sum + m.alpa, 0),
        totalIzin: memberStats.reduce((sum, m) => sum + (m.izin ?? 0), 0),
        totalOrang: memberStats.length,
        totalSesi: sessions.length,
    };

    // Kumpulkan seluruh tugas dalam periode tersebut
    const tasks = sessions.flatMap((s) => s.notes.filter((n) => n.type === "TUGAS"));
    const taskSummary = {
        totalTasks: tasks.length,
        completed: tasks.filter((t) => t.taskStatus === "SELESAI").length,
        inProgress: tasks.filter((t) => t.taskStatus === "SEDANG_BERJALAN").length,
        notStarted: tasks.filter((t) => t.taskStatus === "BELUM_DIMULAI").length,
        cancelled: tasks.filter((t) => t.taskStatus === "DIBATALKAN").length,
        extended: tasks.filter((t) => t.deadlines.length > 1).length,
    };

    return {
        startDate: startDateStr,
        endDate: endDateStr,
        totalSessions: sessions.length,
        kpi,
        memberStats,
        deptStats,
        archiveStats,
        archiveSessions: archiveSessionIds.size,
        taskSummary,
        // Payload berat hanya bila diminta eksplisit (ekspor/detail). Default ringan.
        sessions: includeSessions ? (sessions as unknown as never[]) : [],
    };
}
