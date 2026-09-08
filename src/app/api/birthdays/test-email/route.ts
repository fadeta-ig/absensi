import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { birthdayTestEmailSchema } from "@/lib/validations/validationSchemas";
import { getBirthdayReminderSettings } from "@/lib/services/birthdayService";
import { sendTestBirthdayReminderEmail, isEmailConfigured } from "@/lib/services/emailService";

export async function POST(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        if (!isEmailConfigured()) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Layanan SMTP belum dikonfigurasi di file environment (.env). Pastikan SMTP_HOST, SMTP_USER, dan SMTP_PASS telah terisi.",
                },
                { status: 400 }
            );
        }

        const validation = await validateBody(request, birthdayTestEmailSchema);
        let recipients: string[] = [];

        if (!("error" in validation) && validation.data.recipients?.trim()) {
            recipients = validation.data.recipients
                .split(/[,;\n]+/)
                .map((e) => e.trim())
                .filter((e) => e.length > 0 && e.includes("@"));
        }

        // If no explicit recipient in body, fall back to configured recipients in database
        if (recipients.length === 0) {
            const settings = await getBirthdayReminderSettings();
            if (settings?.recipientEmails) {
                recipients = settings.recipientEmails
                    .split(/[,;\n]+/)
                    .map((e) => e.trim())
                    .filter((e) => e.length > 0 && e.includes("@"));
            }
        }

        // Fallback to user session email if still empty
        if (recipients.length === 0 && session.email && session.email.includes("@")) {
            recipients = [session.email];
        }

        if (recipients.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Tidak ada alamat email penerima. Masukkan alamat email tujuan atau simpan penerima di Pengaturan Email Reminder.",
                },
                { status: 400 }
            );
        }

        const result = await sendTestBirthdayReminderEmail(recipients);

        return NextResponse.json({
            success: result.success,
            message: result.message,
            recipients,
        }, { status: result.success ? 200 : 500 });
    } catch (error) {
        return serverErrorResponse("BirthdayTestEmailPOST", error);
    }
}
