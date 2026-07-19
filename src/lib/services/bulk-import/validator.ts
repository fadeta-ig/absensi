import { z } from "zod";
import { prisma } from "../../prisma";
import { hashPii, normalizeEmployeeId } from "@/lib/security/pii";
import { serializeEmployeePrivateData } from "@/lib/services/employeePrivateService";
import { parseExcel } from "./parser";
import {
    IMPORT_ROW_LIMIT,
    type BulkRowInput,
    type ImportAction,
    type ImportOptions,
    type MissingReference,
    type PreparedImportReport,
    type PreparedImportRow,
    type ReferenceType,
    type RowError,
    type RowPlan,
    type ValidationReport,
} from "./types";

const emailSchema = z.string().email();
const EMPLOYMENT_TYPES = new Set(["PERMANENT", "CONTRACT", "PROBATION", "INTERN"]);
const GENDERS = new Set(["Laki-Laki", "Perempuan"]);
const PTKP_VALUES = new Set(["TK", "K/0", "K/1", "K/2", "K/3", "TK/1", "TK/2", "TK/3"]);

function normalizedName(value: string | null | undefined): string {
    return value?.trim().toLocaleLowerCase("id-ID") ?? "";
}

function isRealDate(value: string | null | undefined): value is string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function publicReport(report: PreparedImportReport): ValidationReport {
    const { preparedRows: _privateRows, ...safe } = report;
    void _privateRows;
    return safe;
}

export async function prepareImport(buffer: ArrayBuffer, options: ImportOptions): Promise<PreparedImportReport> {
    const rows = parseExcel(buffer);
    const errors: RowError[] = [];
    const plans: RowPlan[] = [];
    const preparedRows: PreparedImportRow[] = [];
    const missingMap = new Map<string, MissingReference>();

    if (rows.length === 0) {
        const error = { row: 0, field: "-", message: "File tidak berisi data karyawan." };
        return {
            totalRows: 0,
            executableRows: 0,
            counts: { CREATE: 0, UPDATE: 0, UNCHANGED: 0, CONFLICT: 0, REJECTED: 0 },
            rows: [],
            errors: [error],
            failedRows: 0,
            issueCount: 1,
            missingReferences: [],
            preparedRows: [],
        };
    }
    if (rows.length > IMPORT_ROW_LIMIT) {
        const error = { row: 0, field: "file", message: `Maksimal ${IMPORT_ROW_LIMIT} baris per file; ditemukan ${rows.length} baris.` };
        return {
            totalRows: rows.length,
            executableRows: 0,
            counts: { CREATE: 0, UPDATE: 0, UNCHANGED: 0, CONFLICT: 0, REJECTED: rows.length },
            rows: [],
            errors: [error],
            failedRows: rows.length,
            issueCount: 1,
            missingReferences: [],
            preparedRows: [],
        };
    }

    const [departments, divisions, positions, existingEmployees] = await Promise.all([
        prisma.department.findMany({ where: { isActive: true }, include: { division: { select: { id: true, name: true } } } }),
        prisma.division.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
        prisma.position.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
        prisma.employee.findMany({
            include: {
                privateProfile: true,
                identity: true,
                addresses: true,
                emergencyContacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
                bankAccounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
                taxProfile: true,
            },
        }),
    ]);

    const divisionByName = new Map(divisions.map((row) => [normalizedName(row.name), row]));
    const departmentByName = new Map(departments.map((row) => [normalizedName(row.name), row]));
    const positionByName = new Map(positions.map((row) => [normalizedName(row.name), row]));
    const employeeById = new Map(existingEmployees.map((row) => [row.employeeId.toLowerCase(), row]));
    const employeeByEmail = new Map(existingEmployees.map((row) => [row.email.toLowerCase(), row]));
    const nationalIdOwner = new Map<string, string>(existingEmployees.flatMap((row) => row.identity?.nationalIdHash ? [[row.identity.nationalIdHash, row.employeeId]] : []));
    const bpjsEmploymentOwner = new Map<string, string>(existingEmployees.flatMap((row) => row.identity?.bpjsEmploymentHash ? [[row.identity.bpjsEmploymentHash, row.employeeId]] : []));
    const bpjsHealthOwner = new Map<string, string>(existingEmployees.flatMap((row) => row.identity?.bpjsHealthHash ? [[row.identity.bpjsHealthHash, row.employeeId]] : []));
    const bankOwner = new Map<string, string>(existingEmployees.flatMap((row) => row.bankAccounts.map((account) => [`${normalizedName(account.bankName)}:${account.accountNumberHash}`, row.employeeId])));
    const employeesByNormalizedId = new Map<string, typeof existingEmployees>();
    for (const employee of existingEmployees) {
        const normalized = normalizeEmployeeId(employee.employeeId);
        employeesByNormalizedId.set(normalized, [...(employeesByNormalizedId.get(normalized) ?? []), employee]);
    }

    const idCounts = new Map<string, number>();
    const emailCounts = new Map<string, number>();
    const sensitiveCounts = new Map<string, number>();
    for (const row of rows) {
        const idKey = row.employeeId.toLowerCase();
        if (idKey) idCounts.set(idKey, (idCounts.get(idKey) ?? 0) + 1);
        if (row.email) emailCounts.set(row.email.toLowerCase(), (emailCounts.get(row.email.toLowerCase()) ?? 0) + 1);
        for (const [field, value] of [["nationalId", row.nationalId], ["bpjsEmploymentNumber", row.bpjsEmploymentNumber], ["bpjsHealthNumber", row.bpjsHealthNumber]] as const) {
            const hash = hashPii(value);
            if (hash) sensitiveCounts.set(`${field}:${hash}`, (sensitiveCounts.get(`${field}:${hash}`) ?? 0) + 1);
        }
        const accountHash = hashPii(row.bankAccountNumber);
        if (accountHash && row.bankName) {
            const key = `bank:${normalizedName(row.bankName)}:${accountHash}`;
            sensitiveCounts.set(key, (sensitiveCounts.get(key) ?? 0) + 1);
        }
    }

    function addMissing(type: ReferenceType, name: string, row: number, parentName?: string | null, canCreate = true) {
        const key = `${type}:${normalizedName(name)}:${normalizedName(parentName)}`;
        const current = missingMap.get(key);
        if (current) {
            if (!current.affectedRows.includes(row)) current.affectedRows.push(row);
        } else {
            missingMap.set(key, { type, name, parentName, affectedRows: [row], canCreate });
        }
    }

    for (const sourceRow of rows.slice(0, IMPORT_ROW_LIMIT)) {
        const row: BulkRowInput = { ...sourceRow };
        const rowErrors: RowError[] = [];
        let conflict = false;
        const addError = (field: string, message: string, isConflict = false) => {
            const issue = { row: row.rowNumber, field, message };
            rowErrors.push(issue);
            errors.push(issue);
            conflict ||= isConflict;
        };

        if (!row.employeeId) addError("employeeId", "NIP wajib diisi.");
        else if (row.employeeId.length > 100) addError("employeeId", "NIP maksimal 100 karakter.");
        else if ((idCounts.get(row.employeeId.toLowerCase()) ?? 0) > 1) addError("employeeId", "NIP duplikat dalam file.", true);

        if (row.email && (emailCounts.get(row.email.toLowerCase()) ?? 0) > 1) addError("email", "Email duplikat dalam file.", true);
        for (const field of row.unsafeNumericFields ?? []) {
            addError(field, "Nilai identitas disimpan Excel sebagai angka yang tidak aman. Ubah format sel menjadi Text dan masukkan ulang nilainya.");
        }

        const exactExisting = row.employeeId ? employeeById.get(row.employeeId.toLowerCase()) : undefined;
        const normalizedMatches = row.employeeId ? employeesByNormalizedId.get(normalizeEmployeeId(row.employeeId)) ?? [] : [];
        const emailExisting = row.email ? employeeByEmail.get(row.email.toLowerCase()) : undefined;
        let action: ImportAction;

        if (exactExisting) {
            if (options.mode === "create") {
                addError("employeeId", "NIP sudah terdaftar; gunakan mode Update atau Upsert.", true);
                action = "CONFLICT";
            } else {
                action = "UPDATE";
            }
        } else if (normalizedMatches.length > 0) {
            addError("employeeId", `Format NIP berkonflik dengan NIP yang sudah ada (${normalizedMatches.map((item) => item.employeeId).join(", ")}). Periksa manual; sistem tidak menggabungkan otomatis.`, true);
            action = "CONFLICT";
        } else if (emailExisting) {
            addError("email", `Email sudah terhubung ke NIP ${emailExisting.employeeId}. Periksa manual; sistem tidak menggabungkan berdasarkan email.`, true);
            action = "CONFLICT";
        } else if (options.mode === "update") {
            addError("employeeId", "NIP belum terdaftar; gunakan mode Create atau Upsert.", true);
            action = "CONFLICT";
        } else {
            action = "CREATE";
        }

        for (const [field, value, owners] of [
            ["nationalId", row.nationalId, nationalIdOwner],
            ["bpjsEmploymentNumber", row.bpjsEmploymentNumber, bpjsEmploymentOwner],
            ["bpjsHealthNumber", row.bpjsHealthNumber, bpjsHealthOwner],
        ] as const) {
            const hash = hashPii(value);
            if (!hash) continue;
            const owner = owners.get(hash);
            if ((sensitiveCounts.get(`${field}:${hash}`) ?? 0) > 1) addError(field, "Nomor identitas duplikat dalam file.", true);
            if (owner && owner.toLowerCase() !== row.employeeId.toLowerCase()) addError(field, `Nomor identitas sudah terhubung ke NIP ${owner}.`, true);
        }
        const bankHash = hashPii(row.bankAccountNumber);
        if (bankHash && row.bankName) {
            const bankKey = `${normalizedName(row.bankName)}:${bankHash}`;
            if ((sensitiveCounts.get(`bank:${bankKey}`) ?? 0) > 1) addError("bankAccountNumber", "Rekening duplikat dalam file.", true);
            const owner = bankOwner.get(bankKey);
            if (owner && owner.toLowerCase() !== row.employeeId.toLowerCase()) addError("bankAccountNumber", `Rekening sudah terhubung ke NIP ${owner}.`, true);
        }

        const isCreate = action === "CREATE";
        const requiredOnCreate: Array<[keyof BulkRowInput, string]> = [
            ["name", "Nama Karyawan"], ["email", "Alamat Email"], ["phone", "No. HP"],
            ["gender", "Jenis Kelamin"], ["department", "Departemen"], ["position", "Jabatan"], ["joinDate", "Tanggal Masuk"],
        ];
        if (isCreate) {
            for (const [field, label] of requiredOnCreate) {
                if (row[field] === undefined || row[field] === null || row[field] === "") addError(String(field), `${label} wajib diisi untuk karyawan baru.`);
            }
            row.employmentType ??= "PERMANENT";
            row.totalLeave ??= 12;
            row.basicSalary ??= 0;
            row.isActive ??= true;
            row.employmentStartDate ??= row.joinDate;
            if (row.bankAccountNumber && !row.bankAccountHolderName) row.bankAccountHolderName = row.name;
            if (row.ptkpStatus && !row.ptkpEffectiveDate) row.ptkpEffectiveDate = row.joinDate;
            if (row.isActive === false && !row.statusEffectiveDate) row.statusEffectiveDate = row.joinDate;
        }

        if (row.name === null || row.email === null || row.phone === null || row.department === null || row.position === null || row.joinDate === null) {
            addError("row", "Field wajib tidak dapat dihapus melalui impor.");
        }
        if (row.email !== undefined && row.email !== null && !emailSchema.safeParse(row.email).success) addError("email", "Format email tidak valid.");
        if (row.gender === null) addError("gender", "Jenis kelamin tidak dapat dihapus.");
        else if (row.gender !== undefined && !GENDERS.has(row.gender)) addError("gender", "Jenis kelamin harus Laki-Laki atau Perempuan.");
        if (row.employmentType === null) addError("employmentType", "Status karyawan tidak dapat dihapus.");
        else if (row.employmentType !== undefined && !EMPLOYMENT_TYPES.has(row.employmentType)) addError("employmentType", "Status karyawan harus Tetap, Kontrak, Probation, atau Magang.");
        if (row.ptkpStatus !== undefined && row.ptkpStatus !== null && !PTKP_VALUES.has(row.ptkpStatus)) addError("ptkpStatus", "Kode PTKP tidak valid.");
        if (row.isActive === null) addError("isActive", "Status aktif tidak dapat dihapus.");
        else if (row.isActive !== undefined && typeof row.isActive !== "boolean") addError("isActive", "Status aktif harus Ya atau Tidak.");

        for (const [field, label] of [
            ["birthDate", "Tanggal Lahir"], ["joinDate", "Tanggal Masuk"], ["employmentStartDate", "Tanggal Mulai Kerja"],
            ["employmentEndDate", "Tanggal Selesai Kerja"], ["probationEndDate", "Tanggal Selesai Probation/Magang"],
            ["ptkpEffectiveDate", "Tanggal Berlaku PTKP"], ["statusEffectiveDate", "Tanggal Efektif Status"],
        ] as const) {
            const value = row[field];
            if (value !== undefined && value !== null && !isRealDate(value)) addError(field, `${label} tidak valid; gunakan YYYY-MM-DD.`);
        }
        if (row.birthDate && row.birthDate > new Date().toISOString().slice(0, 10)) addError("birthDate", "Tanggal lahir tidak boleh berada di masa depan.");
        if (row.employmentStartDate && row.employmentEndDate && row.employmentEndDate < row.employmentStartDate) addError("employmentEndDate", "Tanggal selesai kerja tidak boleh sebelum tanggal mulai.");
        if (row.basicSalary !== undefined && row.basicSalary !== null && (!Number.isFinite(row.basicSalary) || row.basicSalary < 0)) addError("basicSalary", "Gaji pokok harus berupa angka nol atau lebih.");
        if (row.totalLeave !== undefined && row.totalLeave !== null && (!Number.isInteger(row.totalLeave) || row.totalLeave < 0)) addError("totalLeave", "Cuti tahunan harus berupa bilangan bulat nol atau lebih.");
        if (row.isActive === false && (!row.statusReason || row.statusReason.trim().length < 5)) addError("statusReason", "Alasan status minimal 5 karakter untuk karyawan nonaktif.");

        const emergencyValues = [row.emergencyContactName, row.emergencyContactRelationship, row.emergencyContactPhone].filter((value) => value !== undefined && value !== null && value !== "");
        if (emergencyValues.length > 0 && emergencyValues.length < 3) addError("emergencyContact", "Nama, hubungan, dan nomor HP kerabat harus diisi lengkap.");
        const bankValues = [row.bankName, row.bankAccountNumber, row.bankAccountHolderName].filter((value) => value !== undefined && value !== null && value !== "");
        if (bankValues.length > 0 && bankValues.length < 3) addError("bankAccount", "Nama bank, nomor rekening, dan nama pemilik rekening harus diisi lengkap.");
        if (row.ptkpStatus && !row.ptkpEffectiveDate) addError("ptkpEffectiveDate", "Tanggal berlaku PTKP wajib diisi.");

        let divisionRecord = row.division ? divisionByName.get(normalizedName(row.division)) : undefined;
        const departmentRecord = row.department ? departmentByName.get(normalizedName(row.department)) : undefined;
        const positionRecord = row.position ? positionByName.get(normalizedName(row.position)) : undefined;

        if (row.division && !divisionRecord) {
            addMissing("division", row.division, row.rowNumber);
            if (!options.allowCreateMaster) addError("division", `Divisi "${row.division}" belum ada di master data.`, true);
        }
        if (row.department && !departmentRecord) {
            const canCreate = Boolean(row.division);
            addMissing("department", row.department, row.rowNumber, row.division, canCreate);
            if (!options.allowCreateMaster || !canCreate) addError("department", canCreate ? `Departemen "${row.department}" belum ada di master data.` : "Divisi wajib diisi untuk membuat departemen baru.", true);
        }
        if (departmentRecord) {
            if (row.division && normalizedName(departmentRecord.division.name) !== normalizedName(row.division)) {
                addError("department", `Departemen ${departmentRecord.name} terdaftar di Divisi ${departmentRecord.division.name}, bukan ${row.division}.`, true);
            }
            divisionRecord ??= departmentRecord.division;
        }
        if (row.position && !positionRecord) {
            addMissing("position", row.position, row.rowNumber);
            if (!options.allowCreateMaster) addError("position", `Jabatan "${row.position}" belum ada di master data.`, true);
        }

        if (row.managerId) {
            if (row.managerId.toLowerCase() === row.employeeId.toLowerCase()) addError("managerId", "Karyawan tidak dapat menjadi atasannya sendiri.");
            else {
                const managerExact = employeeById.has(row.managerId.toLowerCase()) || idCounts.has(row.managerId.toLowerCase());
                const managerNormalized = employeesByNormalizedId.get(normalizeEmployeeId(row.managerId));
                if (!managerExact && managerNormalized?.length) addError("managerId", "Format NIP atasan berbeda dengan data yang ada; periksa manual.", true);
                else if (!managerExact) addError("managerId", "NIP atasan tidak ditemukan di database maupun file.");
            }
        }

        const changedFields: string[] = [];
        if (action === "UPDATE" && exactExisting) {
            const privateData = serializeEmployeePrivateData(exactExisting);
            const comparisons: Array<[keyof BulkRowInput, unknown]> = [
                ["name", exactExisting.name], ["academicTitle", exactExisting.academicTitle], ["preferredName", exactExisting.preferredName],
                ["email", exactExisting.email], ["phone", exactExisting.phone], ["alternatePhone", exactExisting.alternatePhone],
                ["gender", exactExisting.gender], ["employmentType", exactExisting.employmentType],
                ["joinDate", exactExisting.joinDate.toISOString().slice(0, 10)],
                ["employmentStartDate", exactExisting.employmentStartDate?.toISOString().slice(0, 10) ?? null],
                ["employmentEndDate", exactExisting.employmentEndDate?.toISOString().slice(0, 10) ?? null],
                ["probationEndDate", exactExisting.probationEndDate?.toISOString().slice(0, 10) ?? null],
                ["basicSalary", exactExisting.basicSalary], ["totalLeave", exactExisting.totalLeave], ["isActive", exactExisting.isActive],
                ["birthPlace", privateData.birthPlace], ["birthDate", privateData.birthDate], ["maritalStatus", privateData.maritalStatus],
                ["bloodType", privateData.bloodType], ["religion", privateData.religion], ["lastEducation", privateData.lastEducation], ["notes", privateData.notes],
                ["nationalId", privateData.nationalId], ["familyCardNumber", privateData.familyCardNumber],
                ["bpjsEmploymentNumber", privateData.bpjsEmploymentNumber], ["bpjsHealthNumber", privateData.bpjsHealthNumber],
                ["idCardAddress", privateData.idCardAddress], ["domicileAddress", privateData.domicileAddress],
                ["emergencyContactName", privateData.emergencyContactName], ["emergencyContactRelationship", privateData.emergencyContactRelationship],
                ["emergencyContactPhone", privateData.emergencyContactPhone], ["bankName", privateData.bankName],
                ["bankAccountNumber", privateData.bankAccountNumber], ["bankAccountHolderName", privateData.bankAccountHolderName],
                ["ptkpStatus", privateData.ptkpStatus], ["ptkpEffectiveDate", privateData.ptkpEffectiveDate],
            ];
            for (const [field, current] of comparisons) {
                if (row[field] !== undefined && String(row[field] ?? "") !== String(current ?? "")) changedFields.push(String(field));
            }
            if (row.department && normalizedName(row.department) !== normalizedName(departments.find((item) => item.id === exactExisting.departmentId)?.name)) changedFields.push("department");
            if (row.division && normalizedName(row.division) !== normalizedName(divisions.find((item) => item.id === exactExisting.divisionId)?.name)) changedFields.push("division");
            if (row.position && normalizedName(row.position) !== normalizedName(positions.find((item) => item.id === exactExisting.positionId)?.name)) changedFields.push("position");
            if (row.managerId !== undefined && String(row.managerId ?? "") !== String(exactExisting.managerId ?? "")) changedFields.push("managerId");
            if (changedFields.length === 0 && rowErrors.length === 0) action = "UNCHANGED";
        } else if (action === "CREATE") {
            changedFields.push(...Object.keys(row).filter((key) => !["rowNumber", "unsafeNumericFields"].includes(key) && row[key as keyof BulkRowInput] !== undefined));
        }

        if (rowErrors.length > 0) action = conflict ? "CONFLICT" : "REJECTED";
        const plan: RowPlan = {
            row: row.rowNumber,
            action,
            employeeId: row.employeeId,
            name: row.name ?? "",
            department: row.department ?? "",
            position: row.position ?? "",
            changedFields: [...new Set(changedFields)],
            issues: rowErrors,
        };
        plans.push(plan);
        if (["CREATE", "UPDATE", "UNCHANGED"].includes(action)) {
            preparedRows.push({
                ...row,
                action: action as PreparedImportRow["action"],
                existingEmployeeDatabaseId: exactExisting?.id,
                departmentId: departmentRecord?.id,
                divisionId: divisionRecord?.id ?? null,
                positionId: positionRecord?.id,
                changedFields: plan.changedFields,
            });
        }
    }

    // A manager that is declared in the same file must itself be executable.
    const executableIds = new Set(preparedRows.map((row) => row.employeeId.toLowerCase()));
    const rejectedPrepared = new Set<number>();
    for (const row of preparedRows) {
        if (!row.managerId || employeeById.has(row.managerId.toLowerCase()) || executableIds.has(row.managerId.toLowerCase())) continue;
        const issue = { row: row.rowNumber, field: "managerId", message: "Baris atasan tidak dapat dieksekusi karena memiliki konflik atau error." };
        errors.push(issue);
        const plan = plans.find((item) => item.row === row.rowNumber)!;
        plan.issues.push(issue);
        plan.action = "REJECTED";
        rejectedPrepared.add(row.rowNumber);
    }

    // Validate the final reporting hierarchy, including rows whose manager is later in the file.
    const managerGraph = new Map(existingEmployees.map((employee) => [employee.employeeId.toLowerCase(), employee.managerId?.toLowerCase() ?? null]));
    for (const row of preparedRows.filter((item) => !rejectedPrepared.has(item.rowNumber) && item.action !== "UNCHANGED")) {
        if (row.managerId !== undefined) managerGraph.set(row.employeeId.toLowerCase(), row.managerId?.toLowerCase() ?? null);
    }
    for (const row of preparedRows.filter((item) => !rejectedPrepared.has(item.rowNumber))) {
        const start = row.employeeId.toLowerCase();
        const visited = new Set<string>();
        let cursor: string | null = start;
        let hasCycle = false;
        while (cursor) {
            if (visited.has(cursor)) { hasCycle = true; break; }
            visited.add(cursor);
            cursor = managerGraph.get(cursor) ?? null;
        }
        if (hasCycle) {
            const issue = { row: row.rowNumber, field: "managerId", message: "Hierarki atasan akan membentuk siklus dan tidak dapat diimpor." };
            errors.push(issue);
            const plan = plans.find((item) => item.row === row.rowNumber)!;
            if (!plan.issues.some((item) => item.message === issue.message)) plan.issues.push(issue);
            plan.action = "REJECTED";
            rejectedPrepared.add(row.rowNumber);
        }
    }

    const finalPrepared = preparedRows.filter((row) => !rejectedPrepared.has(row.rowNumber));
    const counts = plans.reduce<Record<ImportAction, number>>((result, plan) => {
        result[plan.action] += 1;
        return result;
    }, { CREATE: 0, UPDATE: 0, UNCHANGED: 0, CONFLICT: 0, REJECTED: 0 });
    const failedRowNumbers = new Set(errors.filter((error) => error.row > 0).map((error) => error.row));
    const missingReferences = [...missingMap.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

    return {
        totalRows: rows.length,
        executableRows: counts.CREATE + counts.UPDATE,
        counts,
        rows: plans.slice(0, 200),
        errors,
        failedRows: failedRowNumbers.size,
        issueCount: errors.length,
        missingReferences,
        preparedRows: finalPrepared,
    };
}

export async function validateImport(buffer: ArrayBuffer, options: ImportOptions = { mode: "create", allowCreateMaster: false }): Promise<ValidationReport> {
    return publicReport(await prepareImport(buffer, options));
}
