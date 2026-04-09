import { z } from "zod";

/* ───────────────────── Auth ───────────────────── */

export const loginSchema = z.object({
    employeeId: z.string().min(1, "ID Karyawan harus diisi"),
    password: z.string().min(1, "Password harus diisi"),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Password saat ini harus diisi"),
    newPassword: z.string().min(8, "Password baru minimal 8 karakter"),
});

export const sendPasswordSchema = z.object({
    employeeId: z.string().min(1, "Employee ID harus diisi"),
});

/* ───────────────────── Attendance ───────────────────── */

const locationSchema = z.object({
    lat: z.number({ message: "Latitude harus berupa angka" }),
    lng: z.number({ message: "Longitude harus berupa angka" }),
});

export const attendanceSchema = z.object({
    location: locationSchema.optional(),
    photo: z.string().min(1, "Foto absensi wajib disertakan untuk keperluan face recognition"),
});

/* ───────────────────── Employee ───────────────────── */

export const employeeCreateSchema = z.object({
    employeeId: z.string().min(1, "ID Karyawan harus diisi"),
    name: z.string().min(1, "Nama harus diisi"),
    email: z.string().email("Format email tidak valid"),
    phone: z.string().min(1, "Nomor telepon harus diisi"),
    department: z.string().min(1, "Departemen harus diisi"),
    division: z.string().nullable().optional(),
    position: z.string().min(1, "Posisi harus diisi"),
    gender: z.enum(["Laki-Laki", "Perempuan"]).default("Laki-Laki"),
    role: z.enum(["employee", "hr", "ga"], { message: "Role harus employee, hr, atau ga" }),
    level: z.enum(["STAFF", "SUPERVISOR", "MANAGER", "GM", "HR", "CEO"], {
        message: "Level tidak valid",
    }),
    managerId: z.string().nullable().optional(),
    joinDate: z.string().min(1, "Tanggal bergabung harus diisi"),
    isActive: z.boolean().optional().default(true),
    totalLeave: z.number().optional().default(12),
    usedLeave: z.number().optional().default(0),
    shiftId: z.string().nullable().optional(),
    bypassLocation: z.boolean().optional().default(false),
    locationIds: z.array(z.string()).optional(),
    basicSalary: z.number().optional().default(0),
    payrollComponents: z.array(z.any()).optional().default([]),
    avatarUrl: z.string().nullable().optional(),
});

export const employeeUpdateSchema = z.object({
    id: z.string().min(1, "ID harus diisi"),
    // Identitas dasar
    name: z.string().min(1).optional(),
    email: z.string().email("Format email tidak valid").optional(),
    phone: z.string().min(1).optional(),
    department: z.string().min(1).optional(),
    division: z.string().nullable().optional(),
    position: z.string().min(1).optional(),
    gender: z.enum(["Laki-Laki", "Perempuan"]).optional(),
    // Role & Level — hanya HR yang bisa ubah (enforced di API route)
    role: z.enum(["employee", "hr", "ga"]).optional(),
    level: z.enum(["STAFF", "SUPERVISOR", "MANAGER", "GM", "HR", "CEO"]).optional(),
    managerId: z.string().nullable().optional(),
    // Kepegawaian
    joinDate: z.string().optional(),
    isActive: z.boolean().optional(),
    totalLeave: z.number().min(0).optional(),
    usedLeave: z.number().min(0).optional(),
    bypassLocation: z.boolean().optional(),
    // Penugasan
    shiftId: z.string().nullable().optional(),
    locationIds: z.array(z.string()).optional(),
    // Payroll
    basicSalary: z.number().min(0).optional(),
    payrollComponents: z.array(z.any()).optional(),
    // Foto profil
    avatarUrl: z.string().nullable().optional(),
    // ⛔ DILARANG via schema ini: password, faceDescriptor, employeeId
});
// Tipe untuk route handler agar tidak perlu cast 'as any'
export type EmployeeUpdatePayload = z.infer<typeof employeeUpdateSchema>;

/* ───────────────────── Leave ───────────────────── */

export const leaveRequestSchema = z.object({
    type: z.enum(["annual", "sick", "personal", "maternity"], {
        message: "Tipe cuti tidak valid",
    }),
    startDate: z.string().min(1, "Tanggal mulai harus diisi"),
    endDate: z.string().min(1, "Tanggal selesai harus diisi"),
    reason: z.string().min(1, "Alasan harus diisi"),
    attachment: z.string().nullable().optional(),
});

export const leaveUpdateSchema = z.object({
    id: z.string().min(1, "ID harus diisi"),
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    reason: z.string().optional(),
    attachment: z.string().nullable().optional(),
    // ⛔ employeeId tidak bisa diubah via update
});

/* ───────────────────── Overtime ───────────────────── */

export const overtimeCreateSchema = z.object({
    date: z.string().min(1, "Tanggal harus diisi"),
    startTime: z.string().min(1, "Jam mulai harus diisi"),
    endTime: z.string().min(1, "Jam selesai harus diisi"),
    reason: z.string().min(1, "Alasan harus diisi"),
    isHoliday: z.boolean().optional().default(false),
});

export const overtimeUpdateSchema = z.object({
    id: z.string().min(1, "ID harus diisi"),
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    date: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    reason: z.string().optional(),
    approvedHours: z.number().positive().optional(),
    isHoliday: z.boolean().optional(),
});

/* ───────────────────── Visit ───────────────────── */

export const visitCreateSchema = z.object({
    clientName: z.string().min(1, "Nama klien harus diisi"),
    clientAddress: z.string().min(1, "Alamat klien harus diisi"),
    purpose: z.string().min(1, "Tujuan kunjungan harus diisi"),
    result: z.string().nullable().optional(),
    location: locationSchema.nullable().optional(),
    photo: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
});

export const visitUpdateSchema = z.object({
    id: z.string().min(1, "ID harus diisi"),
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    notes: z.string().optional(),
    clientName: z.string().optional(),
    clientAddress: z.string().optional(),
    purpose: z.string().optional(),
    result: z.string().optional(),
});

/* ───────────────────── News ───────────────────── */

export const newsCreateSchema = z.object({
    title: z.string().min(1, "Judul harus diisi"),
    content: z.string().min(1, "Konten harus diisi"),
    category: z.enum(["announcement", "event", "policy", "general"], {
        message: "Kategori tidak valid",
    }),
    isPinned: z.boolean().optional().default(false),
    mediaUrl: z.string().nullable().optional(),
    mediaName: z.string().nullable().optional(),
});

export const newsUpdateSchema = z.object({
    id: z.string().min(1, "ID harus diisi"),
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    category: z.enum(["announcement", "event", "policy", "general"]).optional(),
    isPinned: z.boolean().optional(),
    mediaUrl: z.string().nullable().optional(),
    mediaName: z.string().nullable().optional(),
    // ⛔ author tidak bisa diubah via update
});

/* ───────────────────── Shift ───────────────────── */

const shiftDaySchema = z.object({
    dayOfWeek: z.number().min(0).max(6),
    startTime: z.string(),
    endTime: z.string(),
    isOff: z.boolean(),
});

export const shiftCreateSchema = z.object({
    name: z.string().min(1, "Nama shift harus diisi"),
    isDefault: z.boolean().optional().default(false),
    lateCheckIn: z.number().optional().default(0),
    earlyCheckIn: z.number().optional().default(0),
    lateCheckOut: z.number().optional().default(0),
    earlyCheckOut: z.number().optional().default(0),
    days: z.array(shiftDaySchema).optional(),
});

export const shiftUpdateSchema = z.object({
    id: z.string().min(1, "ID harus diisi"),
    name: z.string().min(1).optional(),
    isDefault: z.boolean().optional(),
    lateCheckIn: z.number().min(0).optional(),
    earlyCheckIn: z.number().min(0).optional(),
    lateCheckOut: z.number().min(0).optional(),
    earlyCheckOut: z.number().min(0).optional(),
    days: z.array(shiftDaySchema).optional(),
});

/* ───────────────────── Todo ───────────────────── */

export const todoCreateSchema = z.object({
    text: z.string().min(1, "Teks tugas harus diisi"),
});

export const todoUpdateSchema = z.object({
    id: z.string().min(1, "ID harus diisi"),
    text: z.string().min(1).optional(),
    completed: z.boolean().optional(),
    // ⛔ employeeId tidak bisa diubah via update
});

/* ───────────────────── Face Descriptor ───────────────────── */

export const faceDescriptorSchema = z.object({
    descriptor: z
        .array(z.number())
        .length(128, "Face descriptor harus berupa array 128 angka"),
});

/* ───────────────────── Master Data ───────────────────── */

export const masterCreateSchema = z.object({
    name: z.string().min(1, "Nama harus diisi"),
});

export const masterUpdateSchema = z.object({
    id: z.string().min(1, "ID harus diisi"),
    name: z.string().min(1, "Nama harus diisi"),
});

// ────────────────────────────────────────────────────────────────
// NOTE: PPh 21 and BPJS calculator schemas are defined inline in
// their respective route handlers (src/app/api/pph21/calculate/route.ts
// and src/app/api/bpjs/calculate/route.ts) because they have different
// field names and logic than what a centralized schema would provide.
// ────────────────────────────────────────────────────────────────
