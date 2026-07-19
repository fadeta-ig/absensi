import { DocumentType } from "@prisma/client";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export const MAX_EMPLOYEE_DOCUMENT_SIZE = 10 * 1024 * 1024;
const STORAGE_ROOT = path.resolve(process.cwd(), "storage", "employee-documents");

const EXTENSIONS_BY_MIME: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

export const EMPLOYEE_DOCUMENT_TYPES = Object.values(DocumentType);

function hasExpectedSignature(mimeType: string, buffer: Buffer): boolean {
    if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    if (mimeType.includes("openxmlformats")) return buffer[0] === 0x50 && buffer[1] === 0x4b;
    // Legacy Office compound binary signature.
    if (mimeType === "application/msword" || mimeType === "application/vnd.ms-excel") {
        return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    }
    return false;
}

function safeResolvedPath(fileUrl: string): string {
    if (fileUrl.startsWith("/uploads/")) {
        const publicUploads = path.resolve(process.cwd(), "public", "uploads");
        const legacyPath = path.resolve(process.cwd(), "public", fileUrl.replace(/^\/+/, ""));
        if (!legacyPath.startsWith(`${publicUploads}${path.sep}`)) throw new Error("Lokasi dokumen tidak valid.");
        return legacyPath;
    }

    const resolved = path.resolve(STORAGE_ROOT, fileUrl);
    if (!resolved.startsWith(`${STORAGE_ROOT}${path.sep}`)) throw new Error("Lokasi dokumen tidak valid.");
    return resolved;
}

export async function listEmployeeDocuments(employeeDatabaseId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeDatabaseId }, select: { employeeId: true, isActive: true } });
    if (!employee) return null;
    const documents = await prisma.employeeDocument.findMany({
        where: { employeeId: employee.employeeId },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            type: true,
            title: true,
            originalName: true,
            mimeType: true,
            fileSize: true,
            expiresAt: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
        },
    });
    return { employee, documents };
}

export async function uploadEmployeeDocument(input: {
    employeeDatabaseId: string;
    type: DocumentType;
    title: string;
    file: File;
    expiresAt?: string | null;
    notes?: string | null;
    uploadedByUserId?: string | null;
}) {
    const employee = await prisma.employee.findUnique({
        where: { id: input.employeeDatabaseId },
        select: { employeeId: true, isActive: true },
    });
    if (!employee) throw new Error("Karyawan tidak ditemukan.");
    if (!employee.isActive) throw new Error("Dokumen hanya dapat diunggah setelah karyawan aktif.");
    if (!input.file.size || input.file.size > MAX_EMPLOYEE_DOCUMENT_SIZE) throw new Error("Ukuran dokumen harus lebih dari 0 dan maksimal 10MB.");

    const extension = EXTENSIONS_BY_MIME[input.file.type];
    if (!extension) throw new Error("Format dokumen tidak didukung.");
    const buffer = Buffer.from(await input.file.arrayBuffer());
    if (!hasExpectedSignature(input.file.type, buffer)) throw new Error("Isi file tidak sesuai dengan format dokumen.");

    const employeeFolder = employee.employeeId.replace(/[^A-Za-z0-9_-]/g, "_");
    const relativePath = path.join(employeeFolder, `${randomUUID()}${extension}`).replace(/\\/g, "/");
    const absolutePath = safeResolvedPath(relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer, { flag: "wx" });

    try {
        return await prisma.employeeDocument.create({
            data: {
                employeeId: employee.employeeId,
                type: input.type,
                title: input.title.trim(),
                fileUrl: relativePath,
                originalName: path.basename(input.file.name),
                mimeType: input.file.type,
                fileSize: input.file.size,
                expiresAt: input.expiresAt ? new Date(`${input.expiresAt}T00:00:00.000Z`) : null,
                notes: input.notes?.trim() || null,
                uploadedByUserId: input.uploadedByUserId ?? null,
            },
            select: { id: true, type: true, title: true, originalName: true, mimeType: true, fileSize: true, expiresAt: true, notes: true, createdAt: true },
        });
    } catch (error) {
        await unlink(absolutePath).catch(() => undefined);
        throw error;
    }
}

export async function readEmployeeDocument(employeeDatabaseId: string, documentId: string) {
    const document = await prisma.employeeDocument.findFirst({
        where: { id: documentId, employee: { id: employeeDatabaseId } },
        select: { id: true, employeeId: true, fileUrl: true, originalName: true, mimeType: true },
    });
    if (!document) return null;
    return { document, buffer: await readFile(safeResolvedPath(document.fileUrl)) };
}

export async function deleteEmployeeDocument(employeeDatabaseId: string, documentId: string) {
    const document = await prisma.employeeDocument.findFirst({
        where: { id: documentId, employee: { id: employeeDatabaseId } },
        select: { id: true, employeeId: true, fileUrl: true, title: true },
    });
    if (!document) return null;
    await prisma.employeeDocument.delete({ where: { id: document.id } });
    await unlink(safeResolvedPath(document.fileUrl)).catch(() => undefined);
    return document;
}
