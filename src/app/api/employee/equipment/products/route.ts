import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { listScopedEquipmentProducts } from "@/lib/services/equipmentProductService";
import { EquipmentError } from "@/lib/services/equipmentService";

/**
 * GET /api/employee/equipment/products?company=
 * Daftar produk dalam cakupan perusahaan sesi (untuk dropdown filter).
 * Tanpa parameter = semua perusahaan cakupan; di luar cakupan = 403.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const rawCompany = searchParams.get("company") ?? undefined;
        if (rawCompany && rawCompany !== "WIG" && rawCompany !== "MKI") {
            return NextResponse.json({ error: "Parameter company wajib WIG atau MKI." }, { status: 400 });
        }
        const products = await listScopedEquipmentProducts(session, rawCompany as "WIG" | "MKI" | undefined);
        return NextResponse.json({ success: true, data: products });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentProductsGET", err);
    }
}
