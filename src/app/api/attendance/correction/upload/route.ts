import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { requireAuth, unauthorizedResponse, forbiddenResponse, parseFormData, serverErrorResponse } from "@/lib/middleware/apiGuard";
import logger from "@/lib/logger";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "attendance-corrections");
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXTENSIONS: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
};

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const parsedForm = await parseFormData(request, "AttendanceCorrectionUploadPOST");
        if ("error" in parsedForm) return parsedForm.error;
        const file = parsedForm.data.get("file");

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "File wajib dipilih." }, { status: 400 });
        }
        if (!ALLOWED_TYPES.has(file.type)) {
            return NextResponse.json({ error: "Format file tidak didukung. Gunakan JPG, PNG, WEBP, atau PDF." }, { status: 400 });
        }
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: "Ukuran file terlalu besar. Maksimal 2MB." }, { status: 400 });
        }

        await mkdir(UPLOAD_DIR, { recursive: true });
        const filename = `${randomUUID()}${EXTENSIONS[file.type]}`;
        await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()));

        const url = `/uploads/attendance-corrections/${filename}`;
        logger.info("Attendance correction attachment uploaded", { filename, uploadedBy: session.employeeId });
        return NextResponse.json({ url, name: file.name });
    } catch (error) {
        return serverErrorResponse("AttendanceCorrectionUploadPOST", error);
    }
}
