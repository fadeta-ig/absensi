import { prisma } from "@/lib/prisma";
import { normalizeGreenMeetingTarget } from "@/lib/greenMeetingTargeting";
import { toWIBDateString, getWIBDayOfWeek } from "@/lib/timezone";
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
 */
export async function getGreenMeetingConfig() {
    let config = await prisma.greenMeetingConfig.findUnique({
        where: { id: "default" },
    });

    if (!config) {
        config = await prisma.greenMeetingConfig.create({
            data: {
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

    return config;
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
 */
export async function updateGreenMeetingUnit(
    id: string,
    data: {
        isActiveInMeeting?: boolean;
        isDefaultRequired?: boolean;
    }
) {
    const unit = await prisma.greenMeetingUnit.update({
        where: { id },
        data,
        include: {
            department: true,
        },
    });

    // Jika dinonaktifkan dari rapat, otomatis hapus presensinya dari seluruh sesi agar tidak mengotori tabel
    if (data.isActiveInMeeting === false) {
        await prisma.greenMeetingAttendance.deleteMany({
            where: { unitId: id },
        });
    } else if (data.isActiveInMeeting === true) {
        // Jika diaktifkan kembali, pastikan sesi aktif memiliki record presensi dengan default ALPA
        const todaySessions = await prisma.greenMeetingSession.findMany({
            orderBy: { meetingDate: "desc" },
            take: 3,
        });
        for (const s of todaySessions) {
            await prisma.greenMeetingAttendance.upsert({
                where: {
                    sessionId_unitId: {
                        sessionId: s.id,
                        unitId: id,
                    },
                },
                update: {},
                create: {
                    sessionId: s.id,
                    unitId: id,
                    status: "ALPA",
                },
            });
        }
    }

    return unit;
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
    const holidayDate = new Date(data.date);
    holidayDate.setUTCHours(0, 0, 0, 0);

    return prisma.greenMeetingHoliday.upsert({
        where: { date: holidayDate },
        update: {
            description: data.description,
            isRecurring: data.isRecurring ?? false,
        },
        create: {
            date: holidayDate,
            description: data.description,
            isRecurring: data.isRecurring ?? false,
        },
    });
}

/**
 * Menghapus hari libur khusus.
 */
export async function deleteGreenMeetingHoliday(id: string) {
    return prisma.greenMeetingHoliday.delete({
        where: { id },
    });
}

/**
 * Memeriksa apakah tanggal tertentu adalah hari libur (rutin mingguan atau libur khusus).
 */
export async function isDateOffDay(dateInput: Date = new Date()): Promise<{ isOffDay: boolean; reason?: string }> {
    const config = await getGreenMeetingConfig();
    const offDays = (config.offDaysWeekly || "0,6").split(",").map(Number);

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

/**
 * Mengambil atau otomatis membuat sesi rapat hari ini.
 * Jika sesi baru dibuat, otomatis menambahkan baris presensi untuk semua unit kerja yang aktif.
 */
export async function getOrCreateTodaySession(dateString?: string, actorUsername: string = "System") {
    const todayStr = dateString || toWIBDateString();
    const sessionDate = new Date(`${todayStr}T00:00:00.000Z`);

    let session = await prisma.greenMeetingSession.findUnique({
        where: { meetingDate: sessionDate },
        include: {
            attendances: {
                where: {
                    unit: {
                        isActiveInMeeting: true,
                    },
                },
                include: {
                    unit: {
                        include: {
                            department: {
                                include: {
                                    division: true,
                                },
                            },
                        },
                    },
                },
                orderBy: {
                    unit: {
                        department: {
                            name: "asc",
                        },
                    },
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
                            sequence: "asc",
                        },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            },
        },
    });

    if (!session) {
        const config = await getGreenMeetingConfig();
        const activeUnits = await prisma.greenMeetingUnit.findMany({
            where: { isActiveInMeeting: true },
        });

        session = await prisma.greenMeetingSession.create({
            data: {
                meetingDate: sessionDate,
                room: config.defaultRoom,
                startTime: config.defaultTime,
                notaryName: actorUsername,
                attendances: {
                    create: activeUnits.map((u) => ({
                        unitId: u.id,
                        status: "ALPA",
                        confirmedBy: null,
                        confirmedAt: null,
                    })),
                },
            },
            include: {
                attendances: {
                    include: {
                        unit: {
                            include: {
                                department: {
                                    include: {
                                        division: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {
                        unit: {
                            department: {
                                name: "asc",
                            },
                        },
                    },
                },
                notes: {
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
                    orderBy: {
                        createdAt: "desc",
                    },
                },
            },
        });
    }

    return session;
}

/**
 * Memperbarui metadata sesi rapat (ruangan, waktu, catatan pembuka, atau pembatalan).
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
    return prisma.greenMeetingSession.update({
        where: { id: sessionId },
        data,
    });
}

/**
 * Memperbarui presensi satu unit kerja pada sesi rapat.
 * Jika status IZIN, wajib ada permitReason.
 */
export async function updateAttendance(
    attendanceId: string,
    data: {
        status: GreenMeetingAttendanceStatus;
        representativeName?: string | null;
        permitReason?: string | null;
    },
    actorUsername: string = "System"
) {
    if (data.status === "IZIN" && (!data.permitReason || data.permitReason.trim().length === 0)) {
        throw new GreenMeetingError("Alasan izin wajib diisi jika status perwakilan adalah Izin.", 400);
    }

    return prisma.greenMeetingAttendance.update({
        where: { id: attendanceId },
        data: {
            status: data.status,
            representativeName: data.representativeName,
            permitReason: data.status === "IZIN" ? data.permitReason?.trim() : null,
            confirmedAt: new Date(),
            confirmedBy: actorUsername,
        },
        include: {
            unit: {
                include: {
                    department: {
                        include: {
                            division: true,
                        },
                    },
                },
            },
        },
    });
}

/**
 * Aksi Cepat 1-Klik: Menandai seluruh unit pada sesi rapat menjadi HADIR.
 */
export async function bulkMarkAllPresent(sessionId: string, actorUsername: string = "System") {
    await prisma.greenMeetingAttendance.updateMany({
        where: { sessionId },
        data: {
            status: "HADIR",
            permitReason: null,
            confirmedAt: new Date(),
            confirmedBy: actorUsername,
        },
    });

    return prisma.greenMeetingAttendance.findMany({
        where: { sessionId },
        include: {
            unit: {
                include: {
                    department: {
                        include: {
                            division: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            unit: {
                department: {
                    name: "asc",
                },
            },
        },
    });
}

/**
 * Aksi Bulk Editor Terpilih: Menandai daftar ID terpilih menjadi status tertentu (HADIR / ALPA).
 */
export async function bulkUpdateAttendanceStatus(
    sessionId: string,
    attendanceIds: string[],
    status: GreenMeetingAttendanceStatus,
    actorUsername: string = "System"
) {
    await prisma.greenMeetingAttendance.updateMany({
        where: {
            sessionId,
            id: { in: attendanceIds },
        },
        data: {
            status,
            permitReason: status === "HADIR" || status === "ALPA" ? null : undefined,
            confirmedAt: status === "HADIR" ? new Date() : null,
            confirmedBy: status === "HADIR" ? actorUsername : null,
        },
    });

    return prisma.greenMeetingAttendance.findMany({
        where: { sessionId },
        include: {
            unit: {
                include: {
                    department: {
                        include: {
                            division: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            unit: {
                department: {
                    name: "asc",
                },
            },
        },
    });
}

export interface NoteTargetItem {
    targetType: "DEPARTMENT" | "DIVISION" | "EMPLOYEE";
    departmentId?: string | null;
    divisionId?: string | null;
    employeeId?: string | null;
    label?: string | null;
}

export interface MeetingNoteUpdateInput {
    type: GreenMeetingNoteType;
    content: string;
    originType: GreenMeetingOriginType;
    originName: string;
    isAllTarget: boolean;
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

        if (
            existing.type === "TUGAS" &&
            data.type === "INFORMASI" &&
            (existing.taskStatus !== "BELUM_DIMULAI" || existing.deadlines.length > 1)
        ) {
            throw new GreenMeetingError(
                "Tugas yang sudah berjalan, selesai, dibatalkan, atau pernah diperpanjang tidak dapat diubah menjadi Informasi.",
                400
            );
        }

        if (data.type === "TUGAS" && !data.initialDeadlineDate && existing.type !== "TUGAS") {
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

        await tx.greenMeetingNoteRevision.create({
            data: {
                noteId,
                revisionNumber,
                changeReason: data.changeReason.trim(),
                changedBy: editor.username,
                previousData,
            },
        });

        await tx.greenMeetingNoteTarget.deleteMany({ where: { noteId } });

        const targets = data.isAllTarget ? [] : data.targets ?? [];
        const changingToTask = existing.type !== "TUGAS" && data.type === "TUGAS";
        const changingToInformation = existing.type === "TUGAS" && data.type === "INFORMASI";

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
                type: data.type,
                content: data.content.trim(),
                originType: data.originType,
                originName: data.originName.trim(),
                isAllTarget: data.isAllTarget,
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
 * Membuat butir notulen rapat baru (Informasi atau Tugas).
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
    if (data.type === "TUGAS" && !data.initialDeadlineDate) {
        throw new GreenMeetingError("Tenggat waktu awal (Deadline 1) wajib ditentukan untuk catatan bertipe Tugas.", 400);
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
 */
export async function updateNoteTaskStatus(
    noteId: string,
    taskStatus: GreenMeetingTaskStatus
) {
    const isComplete = taskStatus === "SELESAI";
    return prisma.greenMeetingNote.update({
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

    const config = await getGreenMeetingConfig();
    const maxExtensions = config.maxDeadlineExtensions; // Misal 3

    // Sequence 1 = Deadline Awal.
    // Jumlah perpanjangan yang sudah terjadi = deadlines.length - 1.
    const currentExtensions = Math.max(0, note.deadlines.length - 1);

    if (currentExtensions >= maxExtensions) {
        throw new GreenMeetingError(
            `Batas toleransi perpanjangan telah tercapai (Maksimal ${maxExtensions} kali perpanjangan).`,
            400
        );
    }

    if (!reason || reason.trim().length < 5) {
        throw new GreenMeetingError("Alasan perpanjangan deadline wajib diisi minimal 5 karakter.", 400);
    }

    const nextSequence = note.deadlines.length + 1;
    const newDeadlineDate = new Date(`${newDeadlineDateStr}T00:00:00.000Z`);

    await prisma.greenMeetingDeadlineHistory.create({
        data: {
            noteId,
            sequence: nextSequence,
            deadlineDate: newDeadlineDate,
            reason: reason.trim(),
            createdBy: actorUsername,
        },
    });

    // Otomatis pastikan taskStatus menjadi SEDANG_BERJALAN
    return prisma.greenMeetingNote.update({
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
}

/**
 * Mengambil seluruh tugas yang masih aktif / berjalan untuk Action Items Tracker & Morning HUD.
 */
export async function getAllActiveTasks() {
    return prisma.greenMeetingNote.findMany({
        where: {
            type: "TUGAS",
            taskStatus: {
                in: ["BELUM_DIMULAI", "SEDANG_BERJALAN"],
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
export async function getMeetingRecap(startDateStr: string, endDateStr: string) {
    const startDate = new Date(`${startDateStr}T00:00:00.000Z`);
    const endDate = new Date(`${endDateStr}T23:59:59.999Z`);

    const sessions = await prisma.greenMeetingSession.findMany({
        where: {
            meetingDate: {
                gte: startDate,
                lte: endDate,
            },
        },
        include: {
            attendances: {
                include: {
                    unit: {
                        include: {
                            department: true,
                        },
                    },
                },
            },
            notes: {
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
            },
        },
        orderBy: {
            meetingDate: "asc",
        },
    });

    // Hitung statistik agregat per unit kerja
    const unitStatsMap = new Map<string, {
        departmentName: string;
        totalSessions: number;
        hadir: number;
        izin: number;
        alpa: number;
    }>();

    for (const session of sessions) {
        for (const att of session.attendances) {
            const deptName = att.unit.department.name;
            if (!unitStatsMap.has(att.unitId)) {
                unitStatsMap.set(att.unitId, {
                    departmentName: deptName,
                    totalSessions: 0,
                    hadir: 0,
                    izin: 0,
                    alpa: 0,
                });
            }

            const stat = unitStatsMap.get(att.unitId)!;
            stat.totalSessions++;
            if (att.status === "HADIR") stat.hadir++;
            else if (att.status === "IZIN") stat.izin++;
            else if (att.status === "ALPA") stat.alpa++;
        }
    }

    const unitAttendanceStats = Array.from(unitStatsMap.values()).map((s) => ({
        ...s,
        attendanceRate: s.totalSessions > 0 ? Math.round((s.hadir / s.totalSessions) * 100) : 0,
    }));

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
        unitAttendanceStats,
        taskSummary,
        sessions,
    };
}
