import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const categorySchema = z.object({
    name: z.string().min(1, "Nama kategori diperlukan"),
    prefix: z.string().min(1, "Prefix diperlukan").max(5, "Prefix maksimal 5 karakter"),
});

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    // GA and HR can view
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const categories = await prisma.assetCategory.findMany({
            orderBy: { name: 'asc' },
            include: { _count: { select: { assets: true } } },
        });
        return NextResponse.json(categories);
    } catch (err) {
        return serverErrorResponse("CategoriesGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    // Only GA can create category
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const result = await validateBody(request, categorySchema);
        if ("error" in result) return result.error;

        const { name, prefix } = result.data;
        
        const existing = await prisma.assetCategory.findFirst({
            where: {
                OR: [
                    { name: name },
                    { prefix: prefix }
                ]
            }
        });

        if (existing) {
            return NextResponse.json(
                { error: "Kategori dengan nama atau prefix tersebut sudah ada" },
                { status: 400 }
            );
        }

        const category = await prisma.assetCategory.create({
            data: { name, prefix: prefix.toUpperCase() }
        });

        return NextResponse.json(category, { status: 201 });
    } catch (err) {
        return serverErrorResponse("CategoriesPOST", err);
    }
}
