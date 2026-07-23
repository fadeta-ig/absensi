import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { actorFromSession, logAction } from "@/lib/services/auditService";

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

        const result = await prisma.$transaction(async (tx) => {
            const asset = await tx.asset.findUnique({
                where: { id },
                select: { id: true, assetCode: true, status: true },
            });
            if (!asset) return null;

            const record = await tx.assetMaintenance.create({
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

            if (body.data.status === "IN_PROGRESS") {
                await tx.asset.update({
                    where: { id },
                    data: { status: "MAINTENANCE" }
                });
            } else if (body.data.status === "COMPLETED" && asset.status === "MAINTENANCE") {
                await tx.asset.update({
                    where: { id },
                    data: { status: "AVAILABLE" }
                });
            }

            return { record, assetCode: asset.assetCode };
        });

        if (!result) {
            return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });
        }

        logger.info("Asset maintenance created", {
            maintenanceId: result.record.id,
            assetId: id,
            assetCode: result.assetCode,
            status: result.record.status,
            performedBy: session.username,
        });
        await logAction("CREATE_MAINTENANCE", "ASSET", actorFromSession(session), id, {
            maintenanceId: result.record.id,
            status: result.record.status,
            vendorName: result.record.vendorName,
        }).catch((error) => logger.error("Gagal mencatat audit log", { error }));

        return NextResponse.json(result.record, { status: 201 });
    } catch (err) {
        return serverErrorResponse("AssetMaintenancePOST", err);
    }
}
