import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ZodSchema, ZodError } from "zod";
import logger from "@/lib/logger";
import { sanitizeObject } from "./sanitize";

/** Standardized session type from JWT payload */
export interface SessionPayload {
    id: string;
    employeeId: string;
    name: string;
    role: "employee" | "hr";
    level: "STAFF" | "SUPERVISOR" | "MANAGER" | "GM" | "HR" | "CEO";
}

/**
 * Verify session and return it, or null if invalid.
 */
export async function requireAuth(): Promise<SessionPayload | null> {
    const session = await getSession();
    return session as SessionPayload | null;
}

/**
 * Standard 401 Unauthorized response.
 */
export function unauthorizedResponse(): NextResponse {
    return NextResponse.json(
        { error: "Sesi Anda telah berakhir. Silakan login kembali." },
        { status: 401 }
    );
}

/**
 * Standard 403 Forbidden response.
 */
export function forbiddenResponse(): NextResponse {
    return NextResponse.json(
        { error: "Anda tidak memiliki akses untuk melakukan tindakan ini." },
        { status: 403 }
    );
}

/**
 * Validate request body against a Zod schema.
 * Input otomatis di-sanitize (strip HTML tags) sebelum validasi Zod.
 * Returns parsed data on success, or a NextResponse error on failure.
 */
export async function validateBody<T>(
    request: Request,
    schema: ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse }> {
    try {
        const raw = await request.json();
        // Sanitize semua string values dari HTML tags untuk mencegah XSS
        const body = typeof raw === "object" && raw !== null
            ? sanitizeObject(raw as Record<string, unknown>)
            : raw;
        const data = schema.parse(body);
        return { data };
    } catch (err) {
        if (err instanceof ZodError) {
            const messages = err.issues.map((e: { message: string }) => e.message);
            logger.warn("Validation failed", { errors: messages });
            return {
                error: NextResponse.json(
                    { error: "Data tidak valid", details: messages },
                    { status: 400 }
                ),
            };
        }
        return {
            error: NextResponse.json(
                { error: "Format data tidak valid. Pastikan mengirim JSON yang benar." },
                { status: 400 }
            ),
        };
    }
}

/**
 * Standard 500 Server Error response with logging.
 */
export function serverErrorResponse(context: string, err: unknown): NextResponse {
    logger.error(`[${context}]`, { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
        { error: "Terjadi kesalahan pada server. Silakan coba lagi." },
        { status: 500 }
    );
}
