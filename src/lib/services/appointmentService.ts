import { prisma } from "@/lib/prisma";
import { isValidCalendarDate, toWIBDateString, wibDateTimeToDate } from "@/lib/timezone";
import { PERMISSIONS } from "@/lib/permissions";
import { actorFromSession } from "@/lib/services/auditService";
import type { SessionPayload } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import logger from "@/lib/logger";

type TxClient = Prisma.TransactionClient;

// ─── Error ────────────────────────────────────────────────────

export class AppointmentError extends Error {
    constructor(message: string, public statusCode: number = 400) {
        super(message);
        this.name = "AppointmentError";
    }
}

function isPrismaUniqueViolation(err: unknown): boolean {
    return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002";
}

// ─── Konstanta ────────────────────────────────────────────────

export const APPOINTMENT_PIC_KEY = "appointment.pic.employeeIds" as const;
export const MAX_APPOINTMENT_PICS = 2 as const;
export const APPOINTMENT_REMINDER_KEY = "appointment.reminder.offsets" as const;
export const DEFAULT_REMINDER_OFFSETS = [1440] as const;
export const MAX_REMINDER_OFFSETS = 5 as const;
const SETTINGS_CACHE_TTL_MS = 60_000;

export type ActiveBookingStatus = "SCHEDULED";

export type DisplayLifecycle = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

/** Status tampil: jam 12 meeting jam 12 → IN_PROGRESS; lewat endAt → COMPLETED. */
export function resolveLifecycleStatus(stored: string, startAt: Date, endAt: Date, now: Date = new Date()): DisplayLifecycle {
    if (stored === "CANCELLED") return "CANCELLED";
    if (stored === "COMPLETED") return "COMPLETED";
    if (now.getTime() >= endAt.getTime()) return "COMPLETED";
    if (now.getTime() >= startAt.getTime()) return "IN_PROGRESS";
    return "SCHEDULED";
}

export function isWig002(session: SessionPayload): boolean {
    return session.username === "WIG002" && session.permissions.includes(PERMISSIONS.GA_MANAGE);
}

// ─── PIC resepsionis (AppSetting list max 2, pola cleaning.topViewers) ───

let picIdsCache: { value: string[]; expiresAt: number } | null = null;
let reminderOffsetsCache: { value: number[]; expiresAt: number } | null = null;

export function invalidateAppointmentPicCache(): void {
    picIdsCache = null;
}

export function invalidateReminderOffsetsCache(): void {
    reminderOffsetsCache = null;
}

function parsePicIds(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter(Boolean)
            .slice(0, MAX_APPOINTMENT_PICS);
    } catch {
        return [];
    }
}

export async function getAppointmentPicIds(): Promise<string[]> {
    if (picIdsCache && Date.now() <= picIdsCache.expiresAt) return [...picIdsCache.value];
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: APPOINTMENT_PIC_KEY } });
        const ids = parsePicIds(row?.value);
        picIdsCache = { value: ids, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
        return [...ids];
    } catch {
        picIdsCache = { value: [], expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
        return [];
    }
}

export async function isAppointmentPic(session: SessionPayload): Promise<boolean> {
    if (!session.employeeId) return false;
    const ids = await getAppointmentPicIds().catch(() => [] as string[]);
    if (!ids.includes(session.employeeId)) return false;
    const emp = await prisma.employee
        .findUnique({ where: { employeeId: session.employeeId }, select: { isActive: true } })
        .catch(() => null);
    return emp?.isActive === true;
}

function requireWig002(session: SessionPayload): void {
    if (!isWig002(session)) {
        throw new AppointmentError("Anda tidak memiliki akses untuk mengelola data ruangan dan PIC.", 403);
    }
}

async function assertPicCandidate(employeeId: string): Promise<string> {
    const id = employeeId.trim();
    if (!id || id.length > 100) throw new AppointmentError("ID karyawan PIC tidak valid. Periksa kembali ID karyawan.", 400);
    const emp = await prisma.employee.findUnique({
        where: { employeeId: id },
        select: { employeeId: true, isActive: true, userAccount: { select: { id: true, username: true, isActive: true } } },
    });
    if (!emp || !emp.isActive || !emp.userAccount || !emp.userAccount.isActive) {
        throw new AppointmentError("Karyawan tersebut bukan karyawan internal yang aktif.", 422);
    }
    if (emp.userAccount.username === "WIG002") {
        throw new AppointmentError("Akun administrator tidak dapat ditunjuk sebagai PIC.", 422);
    }
    return emp.employeeId;
}

export async function setAppointmentPics(rawIds: string[], actor: { userId?: string | null; username: string }): Promise<string[]> {
    const ids = [...new Set(rawIds.map((v) => v.trim()).filter(Boolean))];
    if (ids.length > MAX_APPOINTMENT_PICS) {
        throw new AppointmentError(`Jumlah PIC resepsionis maksimal ${MAX_APPOINTMENT_PICS} orang.`, 409);
    }
    const validated: string[] = [];
    for (const id of ids) validated.push(await assertPicCandidate(id));
    await prisma.appSetting.upsert({
        where: { key: APPOINTMENT_PIC_KEY },
        update: { value: JSON.stringify(validated), updatedByUserId: actor.userId ?? null },
        create: { key: APPOINTMENT_PIC_KEY, value: JSON.stringify(validated), updatedByUserId: actor.userId ?? null },
    });
    invalidateAppointmentPicCache();
    await prisma.auditLog
        .create({
            data: {
                action: "SET_APPOINTMENT_PICS",
                entity: "APP_SETTING",
                entityId: APPOINTMENT_PIC_KEY,
                details: JSON.stringify({ employeeIds: validated }),
                actorType: "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.username,
            },
        })
        .catch((err) => logger.error("appointment audit SET_PICS gagal", { err }));
    return validated;
}

export async function getAppointmentPicInfos(): Promise<Array<{ employeeId: string; name: string | null; isActive: boolean }>> {
    const ids = await getAppointmentPicIds();
    if (ids.length === 0) return [];
    const employees = await prisma.employee.findMany({
        where: { employeeId: { in: ids } },
        select: { employeeId: true, name: true, isActive: true },
    });
    const byId = new Map(employees.map((e) => [e.employeeId, e]));
    return ids.map((id) => {
        const e = byId.get(id);
        if (!e) return { employeeId: id, name: null, isActive: false };
        return { employeeId: e.employeeId, name: e.name, isActive: e.isActive };
    });
}

// ─── Reminder offsets dinamis (milik PIC, bukan WIG002) ───

function parseReminderOffsets(raw: string | null | undefined): number[] {
    if (!raw) return [...DEFAULT_REMINDER_OFFSETS];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [...DEFAULT_REMINDER_OFFSETS];
        const nums = [...new Set(parsed.filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 15))].sort(
            (a, b) => b - a
        );
        return nums.slice(0, MAX_REMINDER_OFFSETS);
    } catch {
        return [...DEFAULT_REMINDER_OFFSETS];
    }
}

export async function getReminderOffsets(): Promise<number[]> {
    if (reminderOffsetsCache && Date.now() <= reminderOffsetsCache.expiresAt) return [...reminderOffsetsCache.value];
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: APPOINTMENT_REMINDER_KEY } });
        const offsets = row ? parseReminderOffsets(row.value) : [...DEFAULT_REMINDER_OFFSETS];
        reminderOffsetsCache = { value: offsets, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
        return [...offsets];
    } catch {
        return [...DEFAULT_REMINDER_OFFSETS];
    }
}

export async function setReminderOffsets(raw: number[], actor: { userId?: string | null; username: string }): Promise<number[]> {
    const offsets = [...new Set(raw.filter((v) => Number.isInteger(v) && v >= 15))].sort((a, b) => b - a);
    if (offsets.length > MAX_REMINDER_OFFSETS) {
        throw new AppointmentError(`Jumlah pengingat maksimal ${MAX_REMINDER_OFFSETS} per rapat.`, 409);
    }
    await prisma.appSetting.upsert({
        where: { key: APPOINTMENT_REMINDER_KEY },
        update: { value: JSON.stringify(offsets), updatedByUserId: actor.userId ?? null },
        create: { key: APPOINTMENT_REMINDER_KEY, value: JSON.stringify(offsets), updatedByUserId: actor.userId ?? null },
    });
    invalidateReminderOffsetsCache();
    return offsets;
}

// ─── Master ruangan ───────────────────────────────────────────

export function normalizeRoomName(raw: string): string {
    return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function getMeetingRooms(session: SessionPayload, includeInactive = true): Promise<unknown[]> {
    requireWig002(session);
    return prisma.meetingRoom.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, capacity: true, location: true, facilities: true, isActive: true, updatedAt: true },
    });
}

export async function getActiveMeetingRooms(): Promise<unknown[]> {
    return prisma.meetingRoom.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, capacity: true, location: true },
    });
}

export async function createMeetingRoom(
    session: SessionPayload,
    input: { name: string; capacity?: number | null; location?: string | null; facilities?: string | null }
): Promise<unknown> {
    requireWig002(session);
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 200) throw new AppointmentError("Nama ruangan wajib diisi (maksimal 200 karakter).", 400);
    if (input.capacity !== undefined && input.capacity !== null && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
        throw new AppointmentError("Kapasitas harus bilangan bulat minimal 1 orang.", 400);
    }
    try {
        const room = await prisma.meetingRoom.create({
            data: {
                name,
                nameNormalized: normalizeRoomName(name),
                capacity: input.capacity ?? null,
                location: input.location?.trim() || null,
                facilities: input.facilities?.trim() || null,
            },
        });
        const actor = actorFromSession(session);
        await prisma.auditLog
            .create({
                data: { action: "CREATE_MEETING_ROOM", entity: "MEETING_ROOM", entityId: room.id, details: JSON.stringify({ name }), actorType: "USER", actorUserId: actor.userId ?? null, actorIdentifier: actor.identifier, actorName: actor.name ?? null, actorRole: actor.role ?? null },
            })
            .catch((err) => logger.error("appointment audit CREATE_ROOM gagal", { err }));
        return room;
    } catch (err) {
        if (isPrismaUniqueViolation(err)) throw new AppointmentError("Ruangan dengan nama tersebut sudah ada.", 409);
        throw err;
    }
}

async function assertNoFutureBookings(roomId: string): Promise<void> {
    const now = new Date();
    const count = await prisma.meetingAppointment.count({
        where: { roomId, status: "SCHEDULED", endAt: { gt: now } },
    });
    if (count > 0) {
        throw new AppointmentError("Ruangan masih memiliki jadwal aktif pada masa mendatang. Pindahkan jadwal tersebut terlebih dahulu.", 422);
    }
}

export async function updateMeetingRoom(
    session: SessionPayload,
    id: string,
    input: { name?: string; capacity?: number | null; location?: string | null; facilities?: string | null; isActive?: boolean }
): Promise<unknown> {
    requireWig002(session);
    const existing = await prisma.meetingRoom.findUnique({ where: { id } });
    if (!existing) throw new AppointmentError("Ruangan tidak ditemukan.", 404);
    if (input.isActive === false && existing.isActive) {
        await assertNoFutureBookings(id);
    }
    const data: Prisma.MeetingRoomUpdateInput = {};
    if (input.name !== undefined) {
        const name = input.name.trim().replace(/\s+/g, " ");
        if (!name || name.length > 200) throw new AppointmentError("Nama ruangan wajib diisi (maksimal 200 karakter).", 400);
        data.name = name;
        data.nameNormalized = normalizeRoomName(name);
    }
    if (input.capacity !== undefined) {
        if (input.capacity !== null && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
            throw new AppointmentError("Kapasitas harus bilangan bulat minimal 1.", 400);
        }
        data.capacity = input.capacity;
    }
    if (input.location !== undefined) data.location = input.location?.trim() || null;
    if (input.facilities !== undefined) data.facilities = input.facilities?.trim() || null;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    try {
        return await prisma.meetingRoom.update({ where: { id }, data });
    } catch (err) {
        if (isPrismaUniqueViolation(err)) throw new AppointmentError("Ruangan dengan nama tersebut sudah ada.", 409);
        throw err;
    }
}

export async function deleteMeetingRoom(session: SessionPayload, id: string): Promise<void> {
    requireWig002(session);
    const existing = await prisma.meetingRoom.findUnique({ where: { id } });
    if (!existing) throw new AppointmentError("Ruangan tidak ditemukan.", 404);
    const used = await prisma.meetingAppointment.count({ where: { roomId: id } });
    if (used > 0) {
        throw new AppointmentError("Ruangan sudah pernah digunakan. Nonaktifkan ruangan sebagai gantinya.", 422);
    }
    await prisma.meetingRoom.delete({ where: { id } });
}

// ─── Waktu & overlap ──────────────────────────────────────────

export interface AppointmentSlot {
    date: string;
    startTime: string;
    endTime: string;
    isFullDay?: boolean;
}

export function slotToDates(slot: AppointmentSlot): { startAt: Date; endAt: Date } {
    if (!isValidCalendarDate(slot.date)) throw new AppointmentError("Tanggal tidak valid. Gunakan format YYYY-MM-DD.", 400);
    if (slot.isFullDay) {
        return { startAt: wibDateTimeToDate(slot.date, "00:00"), endAt: wibDateTimeToDate(slot.date, "23:59") };
    }
    const startAt = wibDateTimeToDate(slot.date, slot.startTime);
    const endAt = wibDateTimeToDate(slot.date, slot.endTime);
    if (!(endAt > startAt)) throw new AppointmentError("Jam selesai harus setelah jam mulai.", 400);
    return { startAt, endAt };
}

/** Cek overlap ruangan [start,end): s1<e2 && s2<e1, status aktif saja. */
export async function hasRoomOverlap(
    tx: TxClient,
    roomId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string
): Promise<boolean> {
    const found = await tx.meetingAppointment.findFirst({
        where: {
            roomId,
            status: "SCHEDULED",
            ...(excludeId ? { id: { not: excludeId } } : {}),
            startAt: { lt: endAt },
            endAt: { gt: startAt },
        },
        select: { id: true },
    });
    return found !== null;
}

/** Cek overlap orang [start,end): peserta ATAU requester, status aktif saja. */
export async function hasEmployeeOverlap(
    tx: TxClient,
    employeeIds: string[],
    startAt: Date,
    endAt: Date,
    excludeId?: string
): Promise<Array<{ appointmentId: string; employeeId: string }>> {
    const ids = [...new Set(employeeIds.filter(Boolean))];
    if (ids.length === 0) return [];
    const rows = await tx.meetingAppointment.findMany({
        where: {
            status: "SCHEDULED",
            ...(excludeId ? { id: { not: excludeId } } : {}),
            startAt: { lt: endAt },
            endAt: { gt: startAt },
            OR: [{ participants: { some: { employeeId: { in: ids } } } }, { requesterEmployeeId: { in: ids } }],
        },
        select: {
            id: true,
            requesterEmployeeId: true,
            participants: { where: { employeeId: { in: ids } }, select: { employeeId: true } },
        },
    });
    const out: Array<{ appointmentId: string; employeeId: string }> = [];
    for (const r of rows) {
        const hit = new Set<string>();
        if (r.requesterEmployeeId && ids.includes(r.requesterEmployeeId)) hit.add(r.requesterEmployeeId);
        for (const p of r.participants) if (p.employeeId) hit.add(p.employeeId);
        for (const e of hit) out.push({ appointmentId: r.id, employeeId: e });
    }
    return out;
}

export interface ParticipantInput {
    employeeId?: string;
    guestName?: string;
}

async function validateParticipants(inputs: ParticipantInput[]): Promise<Array<{ employeeId: string | null; guestName: string | null; isExternal: boolean }>> {
    const internalIds = [...new Set(inputs.map((p) => p.employeeId?.trim()).filter((v): v is string => Boolean(v)))];
    const byId = new Map<string, { isActive: boolean }>();
    if (internalIds.length > 0) {
        const rows = await prisma.employee.findMany({
            where: { employeeId: { in: internalIds } },
            select: { employeeId: true, isActive: true },
        });
        for (const r of rows) byId.set(r.employeeId, r);
    }
    const unknown = internalIds.filter((id) => {
        const e = byId.get(id);
        return !e || !e.isActive;
    });
    if (unknown.length > 0) {
        throw new AppointmentError(`Peserta berikut tidak ditemukan atau sudah nonaktif: ${unknown.join(", ")}. Periksa kembali daftar peserta.`, 400);
    }
    const seen = new Set<string>();
    const out: Array<{ employeeId: string | null; guestName: string | null; isExternal: boolean }> = [];
    for (const p of inputs) {
        const empId = p.employeeId?.trim() || null;
        const guest = p.guestName?.trim() || null;
        if (empId) {
            const key = `e:${empId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ employeeId: empId, guestName: null, isExternal: false });
        } else if (guest) {
            const key = `g:${guest.toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (guest.length > 200) throw new AppointmentError("Nama tamu maksimal 200 karakter.", 400);
            out.push({ employeeId: null, guestName: guest, isExternal: true });
        }
    }
    return out;
}

// ─── CRUD appointment ─────────────────────────────────────────

export interface CreateAppointmentInput extends AppointmentSlot {
    title: string;
    agenda?: string | null;
    roomId?: string | null;
    meetingLink?: string | null;
    participants: ParticipantInput[];
    reminderOffsets?: number[] | null;
    force?: boolean;
}

function parseReminderOverride(raw: number[] | null | undefined): string | null {
    if (!raw) return null;
    const offsets = [...new Set(raw.filter((v) => Number.isInteger(v) && v >= 15))].sort((a, b) => b - a).slice(0, MAX_REMINDER_OFFSETS);
    return JSON.stringify(offsets);
}

export async function createAppointment(session: SessionPayload, input: CreateAppointmentInput, asOperator: boolean): Promise<unknown> {
    if (!session.employeeId && !isWig002(session)) throw new AppointmentError("Hanya karyawan yang dapat membuat rapat.", 403);
    const title = input.title.trim();
    if (!title || title.length > 200) throw new AppointmentError("Topik rapat wajib diisi (maksimal 200 karakter).", 400);
    const { startAt, endAt } = slotToDates(input);
    if (startAt <= new Date()) throw new AppointmentError("Jadwal harus setelah waktu saat ini.", 400);

    let room: { id: string; isActive: boolean } | null = null;
    if (input.roomId) {
        room = await prisma.meetingRoom.findUnique({ where: { id: input.roomId }, select: { id: true, isActive: true } });
        if (!room) throw new AppointmentError("Ruangan tidak ditemukan.", 404);
        if (!room.isActive) throw new AppointmentError("Ruangan tersebut sedang nonaktif.", 422);
    } else if (!input.meetingLink?.trim()) {
        throw new AppointmentError("Pilih ruang rapat atau isi tautan rapat daring.", 400);
    }

    const participants = await validateParticipants(input.participants);
    // Siapa cepat dia dapat: booking langsung SCHEDULED, meeting tetap jalan
    // tanpa menunggu PIC. PIC hanya reschedule darurat.
    const status = "SCHEDULED";

    const created = await prisma.$transaction(async (tx) => {
        if (room) {
            const overlap = await hasRoomOverlap(tx, room.id, startAt, endAt);
            if (overlap && !(asOperator && input.force)) {
                throw new AppointmentError("Ruangan sudah terisi pada waktu tersebut. Pilih waktu lain atau hubungi PIC.", 409);
            }
        }
        const involvedIds = [...(session.employeeId ? [session.employeeId] : []), ...participants.filter((p) => p.employeeId).map((p) => p.employeeId as string)];
        const personOverlap = await hasEmployeeOverlap(tx, involvedIds, startAt, endAt);
        const blockedIds = await busyBlockEmployeeIds(tx, involvedIds, startAt, endAt);
        const busyNames = [...new Set([...personOverlap.map((o) => o.employeeId), ...blockedIds])];
        if (busyNames.length > 0 && !(asOperator && input.force)) {
            throw new AppointmentError(`Peserta berikut berhalangan (jadwal bertabrakan/cuti/sibuk): ${busyNames.join(", ")}. Pilih waktu lain atau hubungi PIC.`, 409);
        }
        const appt = await tx.meetingAppointment.create({
            data: {
                roomId: room?.id ?? null,
                title,
                agenda: input.agenda?.trim() || null,
                meetingLink: input.meetingLink?.trim() || null,
                isFullDay: input.isFullDay ?? false,
                status,
                startAt,
                endAt,
                requesterEmployeeId: session.employeeId,
                createdByUserId: session.userId ?? null,
                reminderOffsets: parseReminderOverride(input.reminderOffsets),
                participants: {
                    create: participants.map((p) => ({ employeeId: p.employeeId, guestName: p.guestName, isExternal: p.isExternal })),
                },
            },
            include: { room: { select: { id: true, name: true } }, participants: { select: { id: true, employeeId: true, guestName: true, isExternal: true } } },
        });
        const actor = actorFromSession(session);
        await tx.auditLog.create({
            data: {
                action: "CREATE_APPOINTMENT",
                entity: "APPOINTMENT",
                entityId: appt.id,
                details: JSON.stringify({ title, status, force: asOperator && input.force ? true : false, participantCount: participants.length }),
                actorType: "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.identifier,
                actorName: actor.name ?? null,
                actorRole: actor.role ?? null,
            },
        });
        return appt;
    });
    return created;
}

export interface AppointmentFilters {
    roomId?: string;
    from?: string;
    to?: string;
    status?: string;
    q?: string;
    page?: number;
    limit?: number;
}

function buildWhere(session: SessionPayload, filters: AppointmentFilters, isPrivileged: boolean): Prisma.MeetingAppointmentWhereInput {
    const where: Prisma.MeetingAppointmentWhereInput = {};
    if (filters.roomId) {
        if (filters.roomId === "__online__") where.roomId = null;
        else where.roomId = filters.roomId;
    }
    if (filters.q?.trim()) where.title = { contains: filters.q.trim() };
    const and: Prisma.MeetingAppointmentWhereInput[] = [];
    if (filters.status === "IN_PROGRESS") {
        const now = new Date();
        and.push({ status: "SCHEDULED", startAt: { lte: now }, endAt: { gt: now } });
    } else if (filters.status === "COMPLETED") {
        and.push({ OR: [{ status: "COMPLETED" }, { status: "SCHEDULED", endAt: { lt: new Date() } }] });
    } else if (filters.status) {
        and.push({ status: filters.status as Prisma.EnumMeetingAppointmentStatusFilter["equals"] });
    }
    if (!isPrivileged) {
        and.push({ OR: [{ requesterEmployeeId: session.employeeId }, { participants: { some: { employeeId: session.employeeId } } }] });
    }
    if (and.length > 0) where.AND = and;
    if (filters.from || filters.to) {
        const startAt: { gte?: Date; lt?: Date } = {};
        if (filters.from && isValidCalendarDate(filters.from)) startAt.gte = wibDateTimeToDate(filters.from, "00:00");
        if (filters.to && isValidCalendarDate(filters.to)) {
            const d = new Date(filters.to + "T00:00:00+07:00");
            d.setDate(d.getDate() + 1);
            startAt.lt = d;
        }
        where.startAt = startAt;
    }
    return where;
}

function withLifecycle<T extends { status: string; startAt: Date; endAt: Date }>(row: T, now: Date = new Date()): T & { lifecycle: DisplayLifecycle } {
    return { ...row, lifecycle: resolveLifecycleStatus(row.status, row.startAt, row.endAt, now) };
}

export async function getAppointments(session: SessionPayload, filters: AppointmentFilters): Promise<{ data: unknown[]; total: number }> {
    const privileged = isWig002(session) || session.permissions.includes(PERMISSIONS.HR_MANAGE) || (await isAppointmentPic(session).catch(() => false));
    const where = buildWhere(session, filters, privileged);
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    const page = Math.max(filters.page ?? 1, 1);
    const [rows, total] = await Promise.all([
        prisma.meetingAppointment.findMany({
            where,
            orderBy: { startAt: "asc" },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true, title: true, status: true, startAt: true, endAt: true, isFullDay: true,
                meetingLink: true, requesterEmployeeId: true,
                room: { select: { id: true, name: true } },
                participants: { select: { id: true, employeeId: true, guestName: true, isExternal: true, attendance: true, inviteStatus: true, inviteRespondedAt: true, inviteNote: true, employee: { select: { name: true } } } },
            },
        }),
        prisma.meetingAppointment.count({ where }),
    ]);
    return { data: rows.map((r) => withLifecycle(r)), total };
}

export async function getAppointmentDetail(session: SessionPayload, id: string): Promise<unknown> {
    const appt = await prisma.meetingAppointment.findUnique({
        where: { id },
        include: {
            room: { select: { id: true, name: true, capacity: true, location: true } },
            participants: { select: { id: true, employeeId: true, guestName: true, isExternal: true, attendance: true, inviteStatus: true, inviteRespondedAt: true, inviteNote: true, employee: { select: { name: true } } } },
        },
    });
    if (!appt) throw new AppointmentError("Jadwal rapat tidak ditemukan.", 404);
    const privileged = isWig002(session) || session.permissions.includes(PERMISSIONS.HR_MANAGE) || (await isAppointmentPic(session).catch(() => false));
    if (!privileged) {
        const mine = appt.requesterEmployeeId === session.employeeId || appt.participants.some((p) => p.employeeId === session.employeeId);
        if (!mine) throw new AppointmentError("Anda tidak memiliki akses ke jadwal rapat ini.", 403);
    }
    return withLifecycle(appt);
}

// ─── RSVP peserta (terima/tolak, sekali dan final) ────────────────────

export async function respondInvite(
    session: SessionPayload,
    id: string,
    action: "ACCEPT" | "DECLINE",
    note: string | null,
    actor: { userId?: string | null; username: string }
): Promise<unknown> {
    if (!session.employeeId) throw new AppointmentError("Hanya karyawan yang dapat merespons undangan rapat.", 403);
    const appt = await prisma.meetingAppointment.findUnique({
        where: { id },
        select: {
            id: true,
            title: true,
            status: true,
            requesterEmployeeId: true,
            participants: { where: { employeeId: session.employeeId }, select: { id: true, inviteStatus: true } },
        },
    });
    if (!appt) throw new AppointmentError("Jadwal rapat tidak ditemukan.", 404);
    if (["CANCELLED", "COMPLETED"].includes(appt.status)) {
        throw new AppointmentError("Undangan sudah tidak berlaku karena rapat telah dibatalkan atau selesai.", 409);
    }
    const mine = appt.participants[0];
    if (!mine) throw new AppointmentError("Anda bukan peserta undangan ini.", 403);
    if (mine.inviteStatus === "ACCEPTED" || mine.inviteStatus === "DECLINED") {
        throw new AppointmentError("Respons Anda sudah tercatat dan bersifat final. Hubungi penyelenggara untuk perubahan.", 409);
    }
    const next = action === "ACCEPT" ? "ACCEPTED" : "DECLINED";
    await prisma.meetingAppointmentParticipant.update({
        where: { id: mine.id },
        data: { inviteStatus: next, inviteRespondedAt: new Date(), inviteNote: note?.trim().slice(0, 500) || null },
    });
    await prisma.auditLog
        .create({
            data: {
                action: `INVITE_${action}`,
                entity: "APPOINTMENT",
                entityId: id,
                details: JSON.stringify({ inviteStatus: next }),
                actorType: "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.username,
            },
        })
        .catch((err) => logger.error("appointment audit INVITE gagal", { err }));
    return { appointmentId: id, inviteStatus: next, title: appt.title, requesterEmployeeId: appt.requesterEmployeeId };
}

// ─── Reschedule / pindah ruangan ──────────────────────────────

export interface RescheduleInput extends AppointmentSlot {
    roomId?: string | null;
    meetingLink?: string | null;
    changeReason: string;
    force?: boolean;
}

export async function rescheduleAppointment(
    session: SessionPayload,
    id: string,
    input: RescheduleInput,
    actor: { userId?: string | null; username: string }
): Promise<unknown> {
    const operator = isWig002(session) || (await isAppointmentPic(session).catch(() => false));
    if (!session.employeeId && !operator) throw new AppointmentError("Hanya karyawan yang dapat mengubah jadwal rapat.", 403);
    if (!input.changeReason || input.changeReason.trim().length < 5) {
        throw new AppointmentError("Alasan perubahan minimal 5 karakter.", 400);
    }
    const { startAt, endAt } = slotToDates(input);
    if (startAt <= new Date()) throw new AppointmentError("Jadwal baru harus di masa depan.", 400);

    let room: { id: string } | null = null;
    if (input.roomId !== undefined) {
        if (input.roomId) {
            room = await prisma.meetingRoom.findUnique({ where: { id: input.roomId }, select: { id: true, isActive: true } }).then((r) =>
                r && r.isActive ? { id: r.id } : null
            );
            if (!room) throw new AppointmentError("Ruangan tidak ditemukan/nonaktif.", 404);
        }
    }

    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM meeting_appointments WHERE id = ${id} FOR UPDATE`;
        const existing = await tx.meetingAppointment.findUnique({ where: { id } });
        if (!existing) throw new AppointmentError("Jadwal rapat tidak ditemukan.", 404);
        if (["CANCELLED", "COMPLETED"].includes(existing.status)) {
            throw new AppointmentError("Rapat yang sudah selesai atau dibatalkan tidak dapat diubah.", 400);
        }
        const isOwner = session.employeeId !== null && session.employeeId !== undefined && existing.requesterEmployeeId === session.employeeId;
        const lockMin = operator ? 15 : 60;
        if (!operator) {
            if (!isOwner) throw new AppointmentError("Hanya pembuat rapat atau PIC yang dapat mengubah.", 403);
            if (existing.status !== "SCHEDULED") throw new AppointmentError("Rapat yang sudah selesai atau dibatalkan tidak dapat diubah pemilik.", 400);
        }
        const minutesLeft = (existing.startAt.getTime() - Date.now()) / 60000;
        if (minutesLeft < lockMin) {
            throw new AppointmentError(`Perubahan dikunci. Batas perubahan ${lockMin} menit sebelum mulai. Hubungi PIC.`, 400);
        }
        const nextRoomId = input.roomId === undefined ? existing.roomId : input.roomId;
        const nextLink = input.meetingLink === undefined ? existing.meetingLink : input.meetingLink?.trim() || null;
        if (!nextRoomId && !nextLink) {
            throw new AppointmentError("Pilih ruangan fisik atau isi link meeting online.", 400);
        }
        if (nextRoomId) {
            const overlap = await hasRoomOverlap(tx, nextRoomId, startAt, endAt, id);
            if (overlap && !(operator && input.force)) {
                throw new AppointmentError("Ruangan sudah terisi pada jadwal baru. Pilih waktu atau ruangan lain.", 409);
            }
        }
        const involvedRows = await tx.meetingAppointmentParticipant.findMany({ where: { appointmentId: id, employeeId: { not: null } }, select: { employeeId: true } });
        const involvedIds = [...(existing.requesterEmployeeId ? [existing.requesterEmployeeId] : []), ...involvedRows.map((p) => p.employeeId as string)];
        const personOverlap = await hasEmployeeOverlap(tx, involvedIds, startAt, endAt, id);
        const blockedIds = await busyBlockEmployeeIds(tx, involvedIds, startAt, endAt);
        const busyNames = [...new Set([...personOverlap.map((o) => o.employeeId), ...blockedIds])];
        if (busyNames.length > 0 && !(operator && input.force)) {
            throw new AppointmentError(`Peserta berikut berhalangan (jadwal bertabrakan/cuti/sibuk): ${busyNames.join(", ")}.`, 409);
        }
        const count = await tx.meetingAppointmentRevision.count({ where: { appointmentId: id } });
        try {
            await tx.meetingAppointmentRevision.create({
                data: {
                    appointmentId: id,
                    revisionNumber: count + 1,
                    changeReason: input.changeReason.trim(),
                    changedBy: actor.username,
                    previousData: { status: existing.status, roomId: existing.roomId, meetingLink: existing.meetingLink, startAt: existing.startAt, endAt: existing.endAt },
                },
            });
        } catch (err) {
            if (isPrismaUniqueViolation(err)) throw new AppointmentError("Data berubah bersamaan. Muat ulang halaman lalu coba lagi.", 409);
            throw err;
        }
        const updated = await tx.meetingAppointment.update({
            where: { id },
            data: { roomId: nextRoomId, meetingLink: nextLink, startAt, endAt, isFullDay: input.isFullDay ?? false },
        });
        const actorInfo = actorFromSession(session);
        await tx.auditLog.create({
            data: {
                action: input.roomId !== undefined && input.roomId !== existing.roomId ? "MOVE_APPOINTMENT_ROOM" : "RESCHEDULE_APPOINTMENT",
                entity: "APPOINTMENT",
                entityId: id,
                details: JSON.stringify({ changeReason: input.changeReason.trim(), force: operator && input.force ? true : false }),
                actorType: "USER",
                actorUserId: actorInfo.userId ?? null,
                actorIdentifier: actorInfo.identifier,
                actorName: actorInfo.name ?? null,
                actorRole: actorInfo.role ?? null,
            },
        });
        return updated;
    });
}

// ─── Cancel ───────────────────────────────────────────────────

export async function cancelAppointment(
    session: SessionPayload,
    id: string,
    reason: string,
    actor: { userId?: string | null; username: string }
): Promise<unknown> {
    const operator = isWig002(session) || (await isAppointmentPic(session).catch(() => false));
    if (!reason || reason.trim().length < 5) throw new AppointmentError("Alasan pembatalan minimal 5 karakter.", 400);
    const existing = await prisma.meetingAppointment.findUnique({ where: { id }, select: { id: true, status: true, requesterEmployeeId: true, roomId: true, startAt: true, endAt: true } });
    if (!existing) throw new AppointmentError("Appointment tidak ditemukan.", 404);
    if (["CANCELLED", "COMPLETED"].includes(existing.status)) {
        throw new AppointmentError("Rapat yang sudah selesai atau dibatalkan tidak dapat dibatalkan.", 409);
    }
    if (!operator) {
        if (existing.requesterEmployeeId !== session.employeeId) throw new AppointmentError("Hanya pembuat rapat atau PIC yang dapat membatalkan.", 403);
        if (existing.status !== "SCHEDULED") throw new AppointmentError("Rapat yang sudah selesai atau dibatalkan tidak dapat dibatalkan pemilik.", 400);
    }
    return prisma.$transaction(async (tx) => {
        const res = await tx.meetingAppointment.updateMany({ where: { id, status: existing.status }, data: { status: "CANCELLED" } });
        if (res.count !== 1) throw new AppointmentError("Data berubah bersamaan. Muat ulang halaman lalu coba lagi.", 409);
        const count = await tx.meetingAppointmentRevision.count({ where: { appointmentId: id } });
        await tx.meetingAppointmentRevision.create({
            data: {
                appointmentId: id,
                revisionNumber: count + 1,
                changeReason: reason.trim(),
                changedBy: actor.username,
                previousData: { status: existing.status, roomId: existing.roomId, startAt: existing.startAt, endAt: existing.endAt },
            },
        });
        await tx.auditLog.create({
            data: { action: "CANCEL_APPOINTMENT", entity: "APPOINTMENT", entityId: id, details: JSON.stringify({ reason: reason.trim() }), actorType: "USER", actorUserId: actor.userId ?? null, actorIdentifier: actor.username },
        });
        return tx.meetingAppointment.findUnique({ where: { id } });
    });
}

// ─── Tandai hadir (PIC + pembuat, s/d H+1) ────────────────────

export async function markAttendance(
    session: SessionPayload,
    id: string,
    marks: Array<{ participantId: string; attendance: "HADIR" | "TIDAK_HADIR" }>,
    actor: { userId?: string | null; username: string }
): Promise<unknown> {
    const operator = isWig002(session) || (await isAppointmentPic(session).catch(() => false));
    const existing = await prisma.meetingAppointment.findUnique({
        where: { id },
        select: { id: true, requesterEmployeeId: true, startAt: true, endAt: true, status: true, participants: { select: { id: true } } },
    });
    if (!existing) throw new AppointmentError("Appointment tidak ditemukan.", 404);
    if (!operator && !(session.employeeId && existing.requesterEmployeeId === session.employeeId)) {
        throw new AppointmentError("Hanya PIC atau pembuat rapat yang dapat menandai kehadiran.", 403);
    }
    if (existing.status !== "SCHEDULED" && existing.status !== "COMPLETED") {
        throw new AppointmentError("Kehadiran hanya dapat ditandai untuk rapat yang sedang berlangsung.", 400);
    }
    if (Date.now() < existing.startAt.getTime()) {
        throw new AppointmentError("Rapat belum dimulai. Kehadiran dapat ditandai setelah rapat dimulai.", 400);
    }
    if (Date.now() > existing.endAt.getTime() + 24 * 60 * 60 * 1000) {
        throw new AppointmentError("Penandaan kehadiran dikunci maksimal 1 hari setelah rapat berakhir.", 400);
    }
    const validIds = new Set(existing.participants.map((p) => p.id));
    for (const m of marks) {
        if (!validIds.has(m.participantId)) throw new AppointmentError("Data peserta tidak valid. Muat ulang daftar peserta.", 400);
        if (m.attendance !== "HADIR" && m.attendance !== "TIDAK_HADIR") throw new AppointmentError("Status kehadiran tidak valid.", 400);
    }
    await prisma.$transaction(
        marks.map((m) => prisma.meetingAppointmentParticipant.update({ where: { id: m.participantId }, data: { attendance: m.attendance } }))
    );
    await prisma.auditLog
        .create({
            data: { action: "MARK_APPOINTMENT_ATTENDANCE", entity: "APPOINTMENT", entityId: id, details: JSON.stringify({ marks }), actorType: "USER", actorUserId: actor.userId ?? null, actorIdentifier: actor.username },
        })
        .catch((err) => logger.error("appointment audit MARK_ATTENDANCE gagal", { err }));
    return prisma.meetingAppointmentParticipant.findMany({ where: { appointmentId: id }, select: { id: true, employeeId: true, guestName: true, attendance: true } });
}

// ─── Blokir sibuk mandiri (OOO): tanpa hierarki, hanya fakta kalender ───

export interface UnavailabilityInput {
    startDate: string;
    endDate: string;
    reason?: string | null;
}

export async function getMyUnavailability(session: SessionPayload): Promise<unknown[]> {
    if (!session.employeeId) throw new AppointmentError("Hanya karyawan yang dapat mengakses penanda sibuk.", 403);
    return prisma.employeeUnavailability.findMany({
        where: { employeeId: session.employeeId, endAt: { gte: new Date() } },
        orderBy: { startAt: "asc" },
        take: 50,
    });
}

export async function createUnavailability(session: SessionPayload, input: UnavailabilityInput): Promise<unknown> {
    if (!session.employeeId) throw new AppointmentError("Hanya karyawan yang dapat mengakses penanda sibuk.", 403);
    if (!isValidCalendarDate(input.startDate) || !isValidCalendarDate(input.endDate)) {
        throw new AppointmentError("Tanggal tidak valid.", 400);
    }
    const startAt = wibDateTimeToDate(input.startDate, "00:00");
    const endAt = wibDateTimeToDate(input.endDate, "23:59");
    if (!(endAt > startAt)) throw new AppointmentError("Tanggal selesai harus setelah tanggal mulai.", 400);
    if (endAt.getTime() - startAt.getTime() > 31 * 24 * 60 * 60 * 1000) {
        throw new AppointmentError("Rentang penanda sibuk maksimal 31 hari.", 400);
    }
    const clash = await prisma.employeeUnavailability.findFirst({
        where: { employeeId: session.employeeId, startAt: { lt: endAt }, endAt: { gt: startAt } },
        select: { id: true },
    });
    if (clash) throw new AppointmentError("Sudah ada penanda sibuk pada rentang tersebut.", 409);
    const created = await prisma.employeeUnavailability.create({
        data: { employeeId: session.employeeId, startAt, endAt, reason: input.reason?.trim().slice(0, 500) || null },
    });
    const actor = actorFromSession(session);
    await prisma.auditLog
        .create({
            data: { action: "CREATE_UNAVAILABILITY", entity: "EMPLOYEE_UNAVAILABILITY", entityId: created.id, details: JSON.stringify({ startDate: input.startDate, endDate: input.endDate }), actorType: "USER", actorUserId: actor.userId ?? null, actorIdentifier: actor.identifier, actorName: actor.name ?? null, actorRole: actor.role ?? null },
        })
        .catch((err) => logger.error("appointment audit UNAVAILABILITY gagal", { err }));
    return created;
}

export async function deleteUnavailability(session: SessionPayload, id: string): Promise<void> {
    if (!session.employeeId) throw new AppointmentError("Hanya karyawan yang dapat mengakses penanda sibuk.", 403);
    const res = await prisma.employeeUnavailability.deleteMany({ where: { id, employeeId: session.employeeId } });
    if (res.count !== 1) throw new AppointmentError("Penanda sibuk tidak ditemukan.", 404);
}

/** EmployeeId yang punya blokir mandiri overlap [startAt,endAt). */
export async function busyBlockEmployeeIds(
    tx: TxClient,
    employeeIds: string[],
    startAt: Date,
    endAt: Date
): Promise<string[]> {
    const ids = [...new Set(employeeIds.filter(Boolean))];
    if (ids.length === 0) return [];
    const rows = await tx.employeeUnavailability.findMany({
        where: { employeeId: { in: ids }, startAt: { lt: endAt }, endAt: { gt: startAt } },
        select: { employeeId: true },
    });
    return [...new Set(rows.map((r) => r.employeeId))];
}

// ─── Availability (redact topik) ──────────────────────────────

export interface AvailabilityQuery {
    date: string;
    roomId?: string;
    employeeIds?: string[];
}

export async function getAvailability(query: AvailabilityQuery): Promise<unknown> {
    if (!isValidCalendarDate(query.date)) throw new AppointmentError("Tanggal tidak valid.", 400);
    const dayStart = wibDateTimeToDate(query.date, "00:00");
    const next = new Date(query.date + "T00:00:00+07:00");
    next.setDate(next.getDate() + 1);
    const result: Record<string, unknown> = {};
    if (query.roomId) {
        const busy = await prisma.meetingAppointment.findMany({
            where: { roomId: query.roomId, status: "SCHEDULED", startAt: { lt: next }, endAt: { gt: dayStart } },
            select: { startAt: true, endAt: true },
            orderBy: { startAt: "asc" },
        });
        result.roomBusy = busy.map((b) => ({ startAt: b.startAt, endAt: b.endAt }));
    }
    if (query.employeeIds && query.employeeIds.length > 0) {
        const ids = [...new Set(query.employeeIds.map((v) => v.trim()).filter(Boolean))].slice(0, 50);
        const rows = await prisma.meetingAppointment.findMany({
            where: {
                status: "SCHEDULED",
                startAt: { lt: next },
                endAt: { gt: dayStart },
                OR: [{ participants: { some: { employeeId: { in: ids } } } }, { requesterEmployeeId: { in: ids } }],
            },
            select: { startAt: true, endAt: true, requesterEmployeeId: true, participants: { where: { employeeId: { in: ids } }, select: { employeeId: true } } },
        });
        const byEmployee: Record<string, Array<{ startAt: Date; endAt: Date }>> = {};
        for (const id of ids) byEmployee[id] = [];
        for (const r of rows) {
            const hit = new Set<string>();
            for (const p of r.participants) {
                if (p.employeeId) hit.add(p.employeeId);
            }
            if (r.requesterEmployeeId && ids.includes(r.requesterEmployeeId)) hit.add(r.requesterEmployeeId);
            for (const e of hit) byEmployee[e]?.push({ startAt: r.startAt, endAt: r.endAt });
        }
        const leaves = await prisma.leaveRequest.findMany({
            where: { employeeId: { in: ids }, status: "approved", startDate: { lte: next }, endDate: { gte: dayStart } },
            select: { employeeId: true, startDate: true, endDate: true },
        });
        for (const l of leaves) {
            byEmployee[l.employeeId]?.push({ startAt: l.startDate < dayStart ? dayStart : l.startDate, endAt: l.endDate > next ? next : l.endDate, leave: true } as { startAt: Date; endAt: Date });
        }
        const blocks = await prisma.employeeUnavailability.findMany({
            where: { employeeId: { in: ids }, startAt: { lt: next }, endAt: { gt: dayStart } },
            select: { employeeId: true, startAt: true, endAt: true },
        });
        for (const b of blocks) {
            byEmployee[b.employeeId]?.push({ startAt: b.startAt < dayStart ? dayStart : b.startAt, endAt: b.endAt > next ? next : b.endAt, ooo: true } as { startAt: Date; endAt: Date });
        }
        result.employeeBusy = byEmployee;
    }
    result.wibDate = toWIBDateString(dayStart);
    return result;
}
