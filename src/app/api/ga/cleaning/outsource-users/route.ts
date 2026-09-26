import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse, validateBody } from "@/lib/middleware/apiGuard";
import {
    isWig002,
    CleaningError,
    createOutsourceUser,
    listOutsourceUsers,
} from "@/lib/services/cleaningService";
import { z } from "zod";

const createOutsourceSchema = z.object({
    username: z
        .string()
        .trim()
        .min(3, "Username minimal 3 karakter.")
        .max(100)
        .regex(/^[A-Za-z0-9._-]+$/, "Username hanya boleh berisi huruf, angka, titik, strip, atau garis bawah."),
    displayName: z.string().trim().min(2, "Nama minimal 2 karakter.").max(150),
    password: z
        .string()
        .min(8, "Password minimal 8 karakter.")
        .max(128, "Password maksimal 128 karakter."),
    email: z.string().email("Format email tidak valid.").optional().or(z.literal("")),
});

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const users = await listOutsourceUsers(session);
        return NextResponse.json({ success: true, data: users });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningOutsourceUsersGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    const validation = await validateBody(request, createOutsourceSchema);
    if ("error" in validation) return validation.error;

    try {
        const user = await createOutsourceUser(session, {
            username: validation.data.username,
            displayName: validation.data.displayName,
            password: validation.data.password,
            email: validation.data.email || undefined,
        });

        return NextResponse.json({ success: true, data: user }, { status: 201 });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningOutsourceUsersPOST", err);
    }
}
