import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import logger from "@/lib/logger";

// ─── Schema Validasi ──────────────────────────────────────────────────────────

const LETTER_TYPES = ["SK_KERJA", "KET_PENGHASILAN", "KET_MASIH_BEKERJA", "BPJS"] as const;
type LetterType = (typeof LETTER_TYPES)[number];

const letterRequestCreateSchema = z.object({
    type:    z.enum(LETTER_TYPES, { message: "Jenis surat tidak valid" }),
    purpose: z.string().min(5, "Tujuan surat minimal 5 karakter").max(500, "Tujuan terlalu panjang"),
});

const letterRequestUpdateSchema = z.object({
    id:     z.string().min(1, "ID harus diisi"),
    status: z.enum(["PROCESSING", "READY", "REJECTED"], { message: "Status tidak valid" }),
    notes:  z.string().max(500, "Catatan terlalu panjang").nullable().optional(),
});

export type LetterRequestCreateBody = z.infer<typeof letterRequestCreateSchema>;

// ─── DTO ─────────────────────────────────────────────────────────────────────

interface LetterRequestRow {
    id: string;
    employeeId: string;
    type: string;
    purpose: string;
    status: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
}

interface LetterWithEmployee extends LetterRequestRow {
    employee: { name: string };
}

function toLetterDTO(row: LetterRequestRow, employeeName?: string) {
    return {
        id:           row.id,
        type:         row.type as LetterType,
        purpose:      row.purpose,
        status:       row.status,
        notes:        row.notes,
        employeeId:   row.employeeId,
        employeeName: employeeName ?? null,
        createdAt:    row.createdAt.toISOString(),
        updatedAt:    row.updatedAt.toISOString(),
    };
}

// ─── GET ──────────────────────────────────────────────────────────────────────
// HR → semua request (dengan nama karyawan)
// Employee → hanya milik sendiri

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        if (session.role === "hr") {
            const rows = await prisma.letterRequest.findMany({
                orderBy: { createdAt: "desc" },
                include: { employee: { select: { name: true } } },
            });

            return NextResponse.json(
                rows.map((r) => {
                    const row = r as unknown as LetterWithEmployee;
                    return toLetterDTO(row, row.employee?.name);
                })
            );
        }

        const rows = await prisma.letterRequest.findMany({
            where: { employeeId: session.employeeId },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json(rows.map((r) => toLetterDTO(r as unknown as LetterRequestRow)));
    } catch (err) {
        return serverErrorResponse("LetterRequestGET", err);
    }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

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
        return NextResponse.json(toLetterDTO(created as unknown as LetterRequestRow), { status: 201 });
    } catch (err) {
        return serverErrorResponse("LetterRequestPOST", err);
    }
}

// ─── PATCH: HR update status surat ───────────────────────────────────────────

export async function PATCH(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const body = await request.json() as unknown;
        const parsed = letterRequestUpdateSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: "Data tidak valid", details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { id, status, notes } = parsed.data;

        const existing = await prisma.letterRequest.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: "Permintaan surat tidak ditemukan" }, { status: 404 });
        }

        const updated = await prisma.letterRequest.update({
            where: { id },
            data: { status, notes: notes ?? existing.notes },
        });

        logger.info("LetterRequest updated", { id, status, by: session.employeeId });
        return NextResponse.json(toLetterDTO(updated as unknown as LetterRequestRow));
    } catch (err) {
        return serverErrorResponse("LetterRequestPATCH", err);
    }
}
