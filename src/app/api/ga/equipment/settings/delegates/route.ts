import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { requireGaEquipmentAdminAuth } from "@/lib/middleware/equipmentGuard";
import {
    EquipmentError,
    getEquipmentSettingsDelegatesForAdmin,
    setEquipmentSettingsDelegates,
} from "@/lib/services/equipmentService";
import { equipmentSettingsDelegatesSchema } from "@/lib/validations/validationSchemas";

/**
 * GET/POST /api/ga/equipment/settings/delegates
 * Pengelolaan daftar PIC delegasi pengaturan Equipment (maks 10 karyawan internal aktif).
 * Ketat WIG002-only — PIC delegasi tidak pernah dapat mengelola daftar delegasi (anti-eskalasi).
 */
export async function GET() {
    const auth = await requireGaEquipmentAdminAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const data = await getEquipmentSettingsDelegatesForAdmin(session);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EquipmentSettingsDelegatesGET", err);
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireGaEquipmentAdminAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const result = await validateBody(request, equipmentSettingsDelegatesSchema);
        if ("error" in result) return result.error;

        const data = await setEquipmentSettingsDelegates(session, result.data.delegates, {
            userId: session.userId,
            username: session.username,
        });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EquipmentSettingsDelegatesPOST", err);
    }
}
