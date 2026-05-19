import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const maintenanceCreateSchema = z.object({
    vendorName: z.string().min(1, "Nama vendor wajib diisi"),
    cost: z.number().min(0).default(0),
    startDate: z.string().min(1, "Tanggal mulai wajib diisi"),
    estimatedEndDate: z.string().optional().nullable(),
    actualEndDate: z.string().optional().nullable(),
    status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]).default("IN_PROGRESS"),
    notes: z.string().optional().nullable(),
    attachmentUrl: z.string().optional().nullable(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const { id } = await params;
        const records = await prisma.assetMaintenance.findMany({
            where: { assetId: id },
            orderBy: { startDate: "desc" },
        });
        return NextResponse.json(records);
    } catch (err) {
        return serverErrorResponse("AssetMaintenanceGET", err);
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const { id } = await params;
        const body = await validateBody(request, maintenanceCreateSchema);
        if ("error" in body) return body.error;

        const record = await prisma.assetMaintenance.create({
            data: {
                assetId: id,
                vendorName: body.data.vendorName,
                cost: body.data.cost,
                startDate: new Date(body.data.startDate),
                estimatedEndDate: body.data.estimatedEndDate ? new Date(body.data.estimatedEndDate) : null,
                actualEndDate: body.data.actualEndDate ? new Date(body.data.actualEndDate) : null,
                status: body.data.status,
                notes: body.data.notes,
                attachmentUrl: body.data.attachmentUrl,
            }
        });

        // Optional: Jika IN_PROGRESS, mungkin update status asset menjadi MAINTENANCE
        if (body.data.status === "IN_PROGRESS") {
            await prisma.asset.update({
                where: { id },
                data: { status: "MAINTENANCE" }
            });
        } else if (body.data.status === "COMPLETED") {
            // Kita kembalikan ke AVAILABLE jika sebelumnya MAINTENANCE
            const asset = await prisma.asset.findUnique({ where: { id } });
            if (asset && asset.status === "MAINTENANCE") {
                await prisma.asset.update({
                    where: { id },
                    data: { status: "AVAILABLE" }
                });
            }
        }

        return NextResponse.json(record, { status: 201 });
    } catch (err) {
        return serverErrorResponse("AssetMaintenancePOST", err);
    }
}
