import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import logger from "@/lib/logger";

// ─── Schema Validasi ──────────────────────────────────────────────────────────

const LETTER_TYPES = ["SK_KERJA", "KET_PENGHASILAN", "KET_MASIH_BEKERJA", "BPJS"] as const;
type LetterType = typeof LETTER_TYPES[number];

const letterRequestCreateSchema = z.object({
    type:    z.enum(LETTER_TYPES, { message: "Jenis surat tidak valid" }),
    purpose: z.string().min(5, "Tujuan surat minimal 5 karakter").max(500, "Tujuan terlalu panjang"),
});

export type LetterRequestCreateBody = z.infer<typeof letterRequestCreateSchema>;

// ─── Type untuk response yang type-safe ──────────────────────────────────────

interface LetterRequestRow {
    id: string;
    type: LetterType;
    purpose: string;
    status: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
}

function toLetterDTO(row: LetterRequestRow) {
    return {
        id:        row.id,
        type:      row.type,
        purpose:   row.purpose,
        status:    row.status,
        notes:     row.notes,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

// ─── GET: Ambil semua request surat milik karyawan yang login ─────────────────

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const rows = await prisma.letterRequest.findMany({
            where: { employeeId: session.employeeId },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json(rows.map(toLetterDTO));
    } catch (err) {
        return serverErrorResponse("LetterRequestGET", err);
    }
}

// ─── POST: Buat request surat baru ───────────────────────────────────────────

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const body = await request.json() as unknown;
        const parsed = letterRequestCreateSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: "Data tidak valid", details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { type, purpose } = parsed.data;

        const created = await prisma.letterRequest.create({
            data: {
                employeeId: session.employeeId,
                type,
                purpose,
                status: "PENDING",
            },
        });

        logger.info("LetterRequest created", { id: created.id, by: session.employeeId, type });
        return NextResponse.json(toLetterDTO(created as LetterRequestRow), { status: 201 });
    } catch (err) {
        return serverErrorResponse("LetterRequestPOST", err);
    }
}
