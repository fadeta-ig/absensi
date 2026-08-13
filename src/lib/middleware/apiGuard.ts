import { NextResponse } from "next/server";
import { getActiveSession, type SessionPayload } from "@/lib/auth";
import { ZodSchema, ZodError } from "zod";
import logger, { serializeError } from "@/lib/logger";
import { sanitizeObject } from "./sanitize";

// SessionPayload is now imported from @/lib/auth (single source of truth)
export type { SessionPayload } from "@/lib/auth";

/**
 * Verify session and return it, or null if invalid.
 */
export async function requireAuth(): Promise<SessionPayload | null> {
    const session = await getActiveSession();
    return session as SessionPayload | null;
}

/**
 * Standard 401 Unauthorized response.
 */
export function unauthorizedResponse(): NextResponse {
    const response = NextResponse.json(
        { error: "Sesi Anda telah berakhir. Silakan login kembali." },
        { status: 401 }
    );
    response.cookies.delete("session");
    return response;
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

function requestLogMeta(request: Request, context?: string): Record<string, unknown> {
    let path = "unknown";
    try {
        path = new URL(request.url).pathname;
    } catch {
        path = request.url || "unknown";
    }

    return {
        ...(context ? { context } : {}),
        method: request.method,
        path,
    };
}

export async function parseJsonBody<T = unknown>(
    request: Request,
    context?: string
): Promise<{ data: T } | { error: NextResponse }> {
    try {
        return { data: await request.json() as T };
    } catch (err) {
        logger.warn("Malformed JSON request body", {
            ...requestLogMeta(request, context),
            error: serializeError(err),
        });
        return {
            error: NextResponse.json(
                { error: "Format data tidak valid. Pastikan mengirim JSON yang benar." },
                { status: 400 }
            ),
        };
    }
}

export async function parseFormData(
    request: Request,
    context?: string
): Promise<{ data: FormData } | { error: NextResponse }> {
    try {
        return { data: await request.formData() };
    } catch (err) {
        logger.warn("Malformed multipart form data", {
            ...requestLogMeta(request, context),
            error: serializeError(err),
        });
        return {
            error: NextResponse.json(
                { error: "Format form-data tidak valid. Pastikan file dan field dikirim dengan benar." },
                { status: 400 }
            ),
        };
    }
}

/**
 * Validate request body against a Zod schema.
 * Input otomatis di-sanitize (strip HTML tags) sebelum validasi Zod.
 * Returns parsed data on success, or a NextResponse error on failure.
 */
export async function validateBody<T>(
    request: Request,
    schema: ZodSchema<T>,
    /** Pre-parsed body — pass this to skip request.json() when body was already consumed. */
    preParsedBody?: unknown
): Promise<{ data: T } | { error: NextResponse }> {
    try {
        const raw = preParsedBody ?? await request.json();
        // Sanitize semua string values dari HTML tags untuk mencegah XSS
        const body = typeof raw === "object" && raw !== null
            ? sanitizeObject(raw as Record<string, unknown>)
            : raw;
        const data = schema.parse(body);
        return { data };
    } catch (err) {
        if (err instanceof ZodError) {
            const issues = err.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
                code: issue.code,
            }));
            const messages = issues.map((issue) => issue.message);
            logger.warn("Request validation failed", {
                ...requestLogMeta(request),
                issues,
            });
            return {
                error: NextResponse.json(
                    { error: "Data tidak valid", details: messages },
                    { status: 400 }
                ),
            };
        }
        logger.warn("Malformed JSON request body", {
            ...requestLogMeta(request),
            error: serializeError(err),
        });
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
export function serverErrorResponse(
    context: string,
    err: unknown,
    meta: Record<string, unknown> = {}
): NextResponse {
    logger.error(`[${context}] Server error`, { ...meta, error: serializeError(err) });
    return NextResponse.json(
        { error: "Terjadi kesalahan pada server. Silakan coba lagi." },
        { status: 500 }
    );
}
