import { z } from "zod";

export const bulkRowSchema = z.object({
    employeeId: z.string().min(1, "ID Karyawan wajib diisi"),
    name: z.string().min(1, "Nama wajib diisi"),
    email: z.string().email("Format email tidak valid"),
    phone: z.string().min(1, "No. Telepon wajib diisi"),
    gender: z.enum(["Laki-Laki", "Perempuan"], { message: "Gender harus Laki-Laki / Perempuan" }),
    department: z.string().min(1, "Departemen wajib diisi"),
    division: z.string().nullable().optional(),
    position: z.string().min(1, "Posisi wajib diisi"),
    role: z.enum(["employee", "hr", "ga"], { message: "Role harus employee / hr / ga" }),
    departmentId: z.string().optional(),
    divisionId: z.string().optional(),
    positionId: z.string().optional(),
    joinDate: z.string().min(1, "Tanggal bergabung wajib diisi"),
    basicSalary: z.number().min(0).optional().default(0),
    totalLeave: z.number().min(0).optional().default(12),
    managerId: z.string().nullable().optional(),
    isActive: z.boolean().optional().default(true),
    statusReason: z.string().trim().max(1000).optional(),
}).superRefine((row, context) => {
    if (!row.isActive && (!row.statusReason || row.statusReason.length < 5)) {
        context.addIssue({
            code: "custom",
            path: ["statusReason"],
            message: "Alasan status wajib diisi minimal 5 karakter untuk karyawan nonaktif",
        });
    }
});

export type BulkRowInput = z.infer<typeof bulkRowSchema>;

export interface RowError {
    row: number;
    field: string;
    message: string;
}

export interface ValidationReport {
    validRows: BulkRowInput[];
    errors: RowError[];
    totalRows: number;
}

export interface ImportResult {
    created: number;
    failed: number;
    errors: { row: number; field: string; message: string }[];
    credentials?: { employeeId: string; name: string; email: string; password: string }[];
}

export const COLUMN_MAP: Record<string, keyof BulkRowInput> = {
    "ID Karyawan": "employeeId",
    "Nama": "name",
    "Email": "email",
    "No. Telepon": "phone",
    "Jenis Kelamin": "gender",
    "Departemen": "department",
    "Divisi": "division",
    "Posisi": "position",
    "Role": "role",
    "Tanggal Bergabung": "joinDate",
    "Gaji Pokok": "basicSalary",
    "Cuti Tahunan": "totalLeave",
    "Atasan (ID)": "managerId",
    "Status Aktif": "isActive",
    "Alasan Status": "statusReason",
};

export const TEMPLATE_HEADERS = Object.keys(COLUMN_MAP);
