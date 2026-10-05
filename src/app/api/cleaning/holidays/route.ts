import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    serverErrorResponse,
    validateBody,
} from "@/lib/middleware/apiGuard";
import { isValidCalendarDate } from "@/lib/timezone";
import { CleaningError, isWig002 } from "@/lib/services/cleaningService";
import {
    createCleaningHoliday,
    createCleaningHolidayRange,
    deleteCleaningHoliday,
    listCleaningHolidays,
} from "@/lib/services/cleaningParafService";
import {
    AppSettingsError,
    getCleaningWeeklyOffDays,
    updateCleaningWeeklyOffDays,
} from "@/lib/services/appSettingsService";
import { z } from "zod";

const wibDateField = (label: string) =>
    z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, `Format ${label} harus YYYY-MM-DD.`)
        .refine((value) => isValidCalendarDate(value), `Tanggal ${label} tidak valid.`);

const holidayPostSchema = z
    .object({
        wibDate: wibDateField("wibDate").optional(),
        startDate: wibDateField("startDate").optional(),
        endDate: wibDateField("endDate").optional(),
        description: z.string().trim().min(3, "Deskripsi libur wajib diisi minimal 3 karakter.").max(500, "Deskripsi libur maksimal 500 karakter."),
    })
    .superRefine((value, ctx) => {
        const start = value.startDate ?? value.wibDate;
        if (!start) {
            ctx.addIssue({ code: "custom", message: "Tanggal mulai (wibDate/startDate) wajib diisi.", path: ["startDate"] });
            return;
        }
        // Rentang harus eksplisit startDate+endDate; wibDate+endDate tanpa
        // startDate ditolak agar tidak tercipta libur berhari-hari tak sengaja.
        if (value.endDate && !value.startDate) {
            ctx.addIssue({ code: "custom", message: "Rentang libur wajib memakai startDate dan endDate. wibDate hanya untuk satu tanggal.", path: ["startDate"] });
            return;
        }
        if (value.endDate && start && value.endDate < start) {
            ctx.addIssue({
                code: "custom",
                message: "Tanggal akhir rentang libur tidak boleh sebelum tanggal mulai.",
                path: ["endDate"],
            });
        }
    });

const weeklyOffPutSchema = z.object({
    weeklyOffDays: z.union([
        z.string().trim().min(0).max(30),
        z.array(z.number().int().min(0).max(6)).max(7),
    ]),
});

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const holidays = await listCleaningHolidays();
        let weeklyOffDays: number[] = [0, 6];
        try {
            weeklyOffDays = await getCleaningWeeklyOffDays();
        } catch {
            weeklyOffDays = [0, 6];
        }
        return NextResponse.json({ success: true, data: holidays, weeklyOffDays });
    } catch (err) {
        return serverErrorResponse("CleaningHolidaysGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    const validation = await validateBody(request, holidayPostSchema);
    if ("error" in validation) return validation.error;

    try {
        const { wibDate, startDate, endDate, description } = validation.data;
        const isRangeRequest = Boolean(startDate);
        if (!isRangeRequest && wibDate) {
            const created = await createCleaningHoliday(session, { wibDate, description });
            return NextResponse.json({ success: true, data: created }, { status: 201 });
        }
        const start = (startDate ?? wibDate) as string;
        const result = await createCleaningHolidayRange(session, {
            startDate: start,
            endDate: endDate ?? start,
            description,
        });
        return NextResponse.json(
            { success: true, data: result },
            { status: result.created.length > 0 ? 201 : 200 }
        );
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningHolidaysPOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    const validation = await validateBody(request, weeklyOffPutSchema);
    if ("error" in validation) return validation.error;

    try {
        const updated = await updateCleaningWeeklyOffDays(validation.data.weeklyOffDays, session.userId);
        return NextResponse.json({ success: true, data: updated });
    } catch (err) {
        if (err instanceof AppSettingsError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningHolidaysPUT", err);
    }
}

export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id") ?? undefined;
        const wibDate = searchParams.get("wibDate") ?? searchParams.get("date") ?? undefined;

        if (!id && !wibDate) {
            return NextResponse.json({ error: "ID atau tanggal libur wajib diisi." }, { status: 400 });
        }
        if (wibDate && !isValidCalendarDate(wibDate)) {
            return NextResponse.json({ error: "Format wibDate harus YYYY-MM-DD yang valid." }, { status: 400 });
        }

        const result = await deleteCleaningHoliday(session, { id: id ?? undefined, wibDate: wibDate ?? undefined });
        return NextResponse.json({ success: true, data: result });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningHolidaysDELETE", err);
    }
}
