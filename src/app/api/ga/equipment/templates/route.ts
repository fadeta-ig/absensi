import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    getEquipmentTemplates,
    createEquipmentTemplate,
    updateEquipmentTemplate,
    EquipmentError,
} from "@/lib/services/equipmentService";
import { requireEquipmentSettingsAuth } from "@/lib/middleware/equipmentGuard";
import { equipmentTemplateCreateSchema, equipmentTemplateUpdateSchema } from "@/lib/validations/validationSchemas";

export async function GET() {
    const auth = await requireEquipmentSettingsAuth(["templates", "units"]);
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const templates = await getEquipmentTemplates(session);
        return NextResponse.json({ success: true, data: templates });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentTemplatesGET", err);
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireEquipmentSettingsAuth("templates");
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const result = await validateBody(request, equipmentTemplateCreateSchema);
        if ("error" in result) return result.error;

        const template = await createEquipmentTemplate(session, result.data.name);
        return NextResponse.json({ success: true, data: template }, { status: 201 });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentTemplatesPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const auth = await requireEquipmentSettingsAuth("templates");
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const result = await validateBody(request, equipmentTemplateUpdateSchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;
        const template = await updateEquipmentTemplate(session, id, data);
        return NextResponse.json({ success: true, data: template });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentTemplatesPATCH", err);
    }
}
