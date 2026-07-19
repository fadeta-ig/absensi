export const IMPORT_ROW_LIMIT = 1000;
export const CLEAR_MARKER = "[HAPUS]";

export type ImportMode = "create" | "update" | "upsert";
export type ImportAction = "CREATE" | "UPDATE" | "UNCHANGED" | "CONFLICT" | "REJECTED";
export type ReferenceType = "division" | "department" | "position";

export interface ImportOptions {
    mode: ImportMode;
    allowCreateMaster: boolean;
}

export interface BulkRowInput {
    rowNumber: number;
    employeeId: string;
    name?: string | null;
    academicTitle?: string | null;
    preferredName?: string | null;
    employmentType?: "PERMANENT" | "CONTRACT" | "PROBATION" | "INTERN" | null;
    position?: string | null;
    department?: string | null;
    division?: string | null;
    gender?: "Laki-Laki" | "Perempuan" | null;
    birthPlace?: string | null;
    birthDate?: string | null;
    joinDate?: string | null;
    employmentStartDate?: string | null;
    employmentEndDate?: string | null;
    probationEndDate?: string | null;
    nationalId?: string | null;
    familyCardNumber?: string | null;
    bpjsEmploymentNumber?: string | null;
    bpjsHealthNumber?: string | null;
    email?: string | null;
    idCardAddress?: string | null;
    domicileAddress?: string | null;
    phone?: string | null;
    alternatePhone?: string | null;
    emergencyContactName?: string | null;
    emergencyContactRelationship?: string | null;
    emergencyContactPhone?: string | null;
    maritalStatus?: string | null;
    ptkpStatus?: string | null;
    ptkpEffectiveDate?: string | null;
    bloodType?: string | null;
    religion?: string | null;
    bankName?: string | null;
    bankAccountNumber?: string | null;
    bankAccountHolderName?: string | null;
    lastEducation?: string | null;
    notes?: string | null;
    managerId?: string | null;
    basicSalary?: number | null;
    totalLeave?: number | null;
    isActive?: boolean | null;
    statusReason?: string | null;
    statusEffectiveDate?: string | null;
    unsafeNumericFields?: string[];
}

export interface PreparedImportRow extends BulkRowInput {
    action: Exclude<ImportAction, "CONFLICT" | "REJECTED">;
    existingEmployeeDatabaseId?: string;
    departmentId?: string;
    divisionId?: string | null;
    positionId?: string;
    changedFields: string[];
}

export interface RowError {
    row: number;
    field: string;
    message: string;
}

export interface RowPlan {
    row: number;
    action: ImportAction;
    employeeId: string;
    name: string;
    department: string;
    position: string;
    changedFields: string[];
    issues: RowError[];
}

export interface MissingReference {
    type: ReferenceType;
    name: string;
    parentName?: string | null;
    affectedRows: number[];
    canCreate: boolean;
}

export interface ValidationReport {
    totalRows: number;
    executableRows: number;
    counts: Record<ImportAction, number>;
    rows: RowPlan[];
    errors: RowError[];
    failedRows: number;
    issueCount: number;
    missingReferences: MissingReference[];
}

export interface PreparedImportReport extends ValidationReport {
    preparedRows: PreparedImportRow[];
}

export interface ImportResult {
    created: number;
    updated: number;
    unchanged: number;
    failedRows: number;
    issueCount: number;
    errors: RowError[];
    jobId: string;
}

export interface ColumnDefinition {
    field: keyof BulkRowInput;
    header: string;
    aliases: string[];
    kind?: "text" | "date" | "number" | "boolean";
}

export const COLUMN_DEFINITIONS: ColumnDefinition[] = [
    { field: "employeeId", header: "NIP", aliases: ["ID Karyawan", "Employee ID"], kind: "text" },
    { field: "name", header: "Nama Karyawan", aliases: ["Nama"], kind: "text" },
    { field: "academicTitle", header: "Gelar", aliases: [], kind: "text" },
    { field: "preferredName", header: "Panggilan", aliases: ["Nama Panggilan"], kind: "text" },
    { field: "employmentType", header: "Status Karyawan", aliases: ["Tipe Karyawan"], kind: "text" },
    { field: "position", header: "Jabatan", aliases: ["Posisi"], kind: "text" },
    { field: "department", header: "Departemen", aliases: ["Department"], kind: "text" },
    { field: "division", header: "Divisi", aliases: ["Division"], kind: "text" },
    { field: "gender", header: "Jenis Kelamin", aliases: ["Gender"], kind: "text" },
    { field: "birthPlace", header: "Tempat Lahir", aliases: [], kind: "text" },
    { field: "birthDate", header: "Tanggal Lahir", aliases: [], kind: "date" },
    { field: "joinDate", header: "Tanggal Masuk", aliases: ["Tanggal Bergabung"], kind: "date" },
    { field: "employmentStartDate", header: "Tanggal Mulai Kerja", aliases: ["Tanggal Mulai Kontrak"], kind: "date" },
    { field: "employmentEndDate", header: "Tanggal Selesai Kerja", aliases: ["Tanggal Selesai Kontrak"], kind: "date" },
    { field: "probationEndDate", header: "Tanggal Selesai Probation/Magang", aliases: [], kind: "date" },
    { field: "nationalId", header: "No. KTP", aliases: ["No KTP", "NIK"], kind: "text" },
    { field: "familyCardNumber", header: "No. Kartu Keluarga", aliases: ["No KK"], kind: "text" },
    { field: "bpjsEmploymentNumber", header: "No. KPJ", aliases: ["BPJS Ketenagakerjaan"], kind: "text" },
    { field: "bpjsHealthNumber", header: "No. JKN-KIS", aliases: ["BPJS Kesehatan", "No JKN KIS"], kind: "text" },
    { field: "email", header: "Alamat Email", aliases: ["Email"], kind: "text" },
    { field: "idCardAddress", header: "Alamat KTP", aliases: [], kind: "text" },
    { field: "domicileAddress", header: "Alamat Domisili", aliases: [], kind: "text" },
    { field: "phone", header: "No. HP", aliases: ["No. Telepon", "Telepon"], kind: "text" },
    { field: "alternatePhone", header: "No. HP Lain", aliases: ["Telepon Lain"], kind: "text" },
    { field: "emergencyContactName", header: "Nama Kerabat", aliases: ["Kontak Darurat"], kind: "text" },
    { field: "emergencyContactRelationship", header: "Hubungan Kerabat", aliases: ["Hubungan Kontak Darurat"], kind: "text" },
    { field: "emergencyContactPhone", header: "No. HP Kerabat", aliases: ["No HP Kontak Darurat"], kind: "text" },
    { field: "maritalStatus", header: "Status Pernikahan", aliases: [], kind: "text" },
    { field: "ptkpStatus", header: "PTKP", aliases: ["Status PTKP"], kind: "text" },
    { field: "ptkpEffectiveDate", header: "Tanggal Berlaku PTKP", aliases: [], kind: "date" },
    { field: "bloodType", header: "Golongan Darah", aliases: ["GOLONGAN DARAH"], kind: "text" },
    { field: "religion", header: "Agama", aliases: ["AGAMA"], kind: "text" },
    { field: "bankName", header: "Nama Bank", aliases: ["Bank"], kind: "text" },
    { field: "bankAccountNumber", header: "No. Rekening", aliases: ["No. Rekening Mandiri"], kind: "text" },
    { field: "bankAccountHolderName", header: "Nama Pemilik Rekening", aliases: [], kind: "text" },
    { field: "lastEducation", header: "Pendidikan Terakhir", aliases: [], kind: "text" },
    { field: "notes", header: "Keterangan", aliases: ["Catatan"], kind: "text" },
    { field: "managerId", header: "Atasan (NIP)", aliases: ["Atasan (ID)", "NIP Atasan"], kind: "text" },
    { field: "basicSalary", header: "Gaji Pokok", aliases: [], kind: "number" },
    { field: "totalLeave", header: "Cuti Tahunan", aliases: [], kind: "number" },
    { field: "isActive", header: "Status Aktif", aliases: [], kind: "boolean" },
    { field: "statusReason", header: "Alasan Status", aliases: [], kind: "text" },
    { field: "statusEffectiveDate", header: "Tanggal Efektif Status", aliases: [], kind: "date" },
];

export const TEMPLATE_HEADERS = COLUMN_DEFINITIONS.map((column) => column.header);
