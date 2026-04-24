import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const categoryUpdateSchema = z.object({
    name: z.string().min(1, "Nama kategori diperlukan").optional(),
    prefix: z.string().min(1, "Prefix diperlukan").max(5, "Prefix maksimal 5 karakter").optional(),
});

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    // Only GA can edit category
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const { id } = await params;
        const result = await validateBody(request, categoryUpdateSchema);
        if ("error" in result) return result.error;

        const { name, prefix } = result.data;

        // Check if exists
        const existingCat = await prisma.assetCategory.findUnique({ where: { id } });
        if (!existingCat) {
            return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 404 });
        }

        // Check for duplicates if prefixed/name changed
        if (name || prefix) {
            const conflict = await prisma.assetCategory.findFirst({
                where: {
                    id: { not: id },
                    OR: [
                        ...(name ? [{ name }] : []),
                        ...(prefix ? [{ prefix: prefix.toUpperCase() }] : []),
                    ]
                }
            });

            if (conflict) {
                return NextResponse.json(
                    { error: "Kategori dengan nama atau prefix tersebut sudah ada" },
                    { status: 400 }
                );
            }
        }

        const category = await prisma.assetCategory.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(prefix && { prefix: prefix.toUpperCase() }),
            }
        });

        return NextResponse.json(category);
    } catch (err: unknown) {
        return serverErrorResponse("CategoriesPUT", err);
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    // Only GA can delete category
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const { id } = await params;
        
        // Cek kategori
        const existingCat = await prisma.assetCategory.findUnique({ 
            where: { id },
            include: { _count: { select: { assets: true } } }
        });

        if (!existingCat) {
            return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 404 });
        }

        // Hindari foreign key constraint fail (onDelete: Restrict)
        if (existingCat._count.assets > 0) {
            return NextResponse.json({ error: "Kategori ini masih digunakan oleh aset. Pindahkan aset terlebih dahulu." }, { status: 400 });
        }

        await prisma.assetCategory.delete({
            where: { id }
        });

        return NextResponse.json({ success: true, message: "Kategori berhasil dihapus" });
    } catch (err: unknown) {
        return serverErrorResponse("CategoriesDELETE", err);
    }
}
