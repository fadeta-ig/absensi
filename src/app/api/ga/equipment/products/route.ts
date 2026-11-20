import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    listEquipmentProducts,
    createEquipmentProduct,
} from "@/lib/services/equipmentProductService";
import { EquipmentError } from "@/lib/services/equipmentService";
import { requireGaEquipmentAdminAuth } from "@/lib/middleware/equipmentGuard";
import { equipmentProductCreateSchema } from "@/lib/validations/validationSchemas";

export async function GET(request: NextRequest) {
    const auth = await requireGaEquipmentAdminAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const { searchParams } = new URL(request.url);
        const company = searchParams.get("company");
        if (company !== "WIG" && company !== "MKI") {
            return NextResponse.json({ error: "Parameter company wajib WIG atau MKI." }, { status: 400 });
        }
        const products = await listEquipmentProducts(session, company);
        return NextResponse.json({ success: true, data: products });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentProductsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireGaEquipmentAdminAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const result = await validateBody(request, equipmentProductCreateSchema);
        if ("error" in result) return result.error;

        const product = await createEquipmentProduct(session, result.data);
        return NextResponse.json({ success: true, data: product }, { status: 201 });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentProductsPOST", err);
    }
}
