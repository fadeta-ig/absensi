import { z } from "zod";
import {
    MAX_GREETING_AUTHOR_LENGTH,
    MAX_GREETING_LENGTH,
    MAX_GREETING_NAME_LENGTH,
    MAX_GREETING_PRIORITY,
    MAX_GREETING_QUOTE_LENGTH,
    MAX_SUB_GREETING_LENGTH,
} from "@/lib/greeting";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam HH:MM.");

export const greetingRuleSchema = z.object({
    name: z.string().trim().min(1).max(MAX_GREETING_NAME_LENGTH),
    greeting: z.string().trim().min(1).max(MAX_GREETING_LENGTH),
    subGreeting: z.string().trim().min(1).max(MAX_SUB_GREETING_LENGTH),
    authorName: z.string().trim().max(MAX_GREETING_AUTHOR_LENGTH).nullable().optional(),
    startTime: timeSchema,
    endTime: timeSchema,
    repeatWeekly: z.boolean(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7),
    specificDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    priority: z.number().int().min(0).max(MAX_GREETING_PRIORITY),
    isActive: z.boolean(),
}).superRefine((value, ctx) => {
    if (value.startTime === value.endTime) {
        ctx.addIssue({ code: "custom", message: "Jam mulai dan jam selesai tidak boleh sama.", path: ["endTime"] });
    }
    if (value.repeatWeekly && value.daysOfWeek.length === 0) {
        ctx.addIssue({ code: "custom", message: "Pilih minimal satu hari.", path: ["daysOfWeek"] });
    }
    if (!value.repeatWeekly && !value.specificDate) {
        ctx.addIssue({ code: "custom", message: "Tanggal khusus wajib diisi.", path: ["specificDate"] });
    }
});

export const greetingRuleIdSchema = z.string().trim().min(1).max(100);

export const greetingQuoteSlotSchema = z.enum(["ALL", "PAGI", "SIANG", "SORE", "MALAM"]);

export const greetingQuoteStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export const greetingQuoteUpdateSchema = z.object({
    quote: z.string().trim().min(1, "Teks quotes wajib diisi.").max(MAX_GREETING_QUOTE_LENGTH),
    greeting: z.string().trim().max(MAX_GREETING_LENGTH).nullable().optional(),
    authorName: z.string().trim().max(MAX_GREETING_AUTHOR_LENGTH).nullable().optional(),
    slot: greetingQuoteSlotSchema,
    status: greetingQuoteStatusSchema,
});
