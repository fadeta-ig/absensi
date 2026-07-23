import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    calculateAllBpjs,
    isValidJkkRiskLevel,
    type JkkRiskLevel,
} from "@/lib/services/bpjsService";
import { z } from "zod";

const bpjsCalculateSchema = z.object({
    grossMonthlyIncome: z.number().min(0, "Gaji bruto bulanan tidak boleh negatif"),
    jkkRiskLevel: z.number().min(1).max(5).default(1),
});

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const result = await validateBody(request, bpjsCalculateSchema);
        if ("error" in result) return result.error;
        const { grossMonthlyIncome, jkkRiskLevel } = result.data;

        if (!isValidJkkRiskLevel(jkkRiskLevel)) {
            return NextResponse.json({ error: "Tingkat risiko JKK tidak valid (1-5)." }, { status: 400 });
        }

        const calculation = calculateAllBpjs({
            grossMonthlyIncome,
            jkkRiskLevel: jkkRiskLevel as JkkRiskLevel,
        });

        return NextResponse.json(calculation);
    } catch (err) {
        return serverErrorResponse("BpjsCalculate", err);
    }
}
