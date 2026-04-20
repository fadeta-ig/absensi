import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { getAssetsByEmployeeId } from "@/lib/services/assetService";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    // HR can access for 360 view, GA can access for general asset management
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get("employeeId");

        if (!employeeId) {
            return NextResponse.json({ error: "employeeId diperlukan" }, { status: 400 });
        }

        const assets = await getAssetsByEmployeeId(employeeId);
        
        // As a safeguard, ensuring COMPANY_OWNED assets aren't shown to HR, although
        // practically a company owned asset shouldn't be assigned to an employee directly
        // but rather marked AS company owned in the status.
        const filteredAssets = session.role === "hr" 
            ? assets.filter(a => a.status !== "COMPANY_OWNED")
            : assets;

        return NextResponse.json(filteredAssets);
    } catch (err) {
        return serverErrorResponse("EmployeesAssetsGET", err);
    }
}
