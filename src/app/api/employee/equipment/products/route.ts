import { NextRequest, NextResponse } from "next/server";
import { serverErrorResponse } from "@/lib/middleware/apiGuard";
import { requireEquipmentPortalAuth } from "@/lib/middleware/equipmentGuard";
import { listScopedEquipmentProducts } from "@/lib/services/equipmentProductService";
import { EquipmentError } from "@/lib/services/equipmentService";

/**
 * GET /api/employee/equipment/products?company=
 * Daftar produk dalam cakupan perusahaan sesi (untuk dropdown filter).
 * Tanpa parameter = semua perusahaan cakupan; di luar cakupan = 403.
 */
export async function GET(request: NextRequest) {
    const auth = await requireEquipmentPortalAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

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
