import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    calculatePph21,
    isValidPtkpStatus,
    type PtkpStatus,
} from "@/lib/services/pph21Service";
import { z } from "zod";

const pph21CalculateSchema = z.object({
    grossMonthlyIncome: z.number().min(0, "Penghasilan bruto bulanan tidak boleh negatif"),
    ptkpStatus: z.string().min(1, "Status PTKP diperlukan"),
    month: z.number().min(1).max(12).default(1),
});

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const result = await validateBody(request, pph21CalculateSchema);
        if ("error" in result) return result.error;
        const { grossMonthlyIncome, ptkpStatus, month } = result.data;

        if (!isValidPtkpStatus(ptkpStatus)) {
            return NextResponse.json({
                error: "Status PTKP tidak valid. Gunakan: TK/0, TK/1, TK/2, TK/3, K/0, K/1, K/2, K/3"
            }, { status: 400 });
        }

        const calculation = calculatePph21({
            grossMonthlyIncome,
            ptkpStatus: ptkpStatus as PtkpStatus,
            month,
        });

        return NextResponse.json(calculation);
    } catch (err) {
        return serverErrorResponse("Pph21Calculate", err);
    }
}
