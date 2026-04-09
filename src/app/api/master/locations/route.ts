import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import logger from "@/lib/logger";

const locationSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Nama lokasi harus diisi"),
    address: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
    radius: z.number().min(5, "Radius minimal 5 meter"),
    isActive: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const locations = await prisma.location.findMany({
            orderBy: { name: "asc" },
        });
        return NextResponse.json(locations);
    } catch (err) {
        return serverErrorResponse("MasterLocationGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, locationSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        const location = await prisma.location.create({
            data: {
                name: body.name,
                latitude: body.latitude,
                longitude: body.longitude,
                radius: body.radius,
                isActive: body.isActive,
            },
        });

        logger.info("Location created", { id: location.id, name: location.name, createdBy: session.employeeId });
        return NextResponse.json(location, { status: 201 });
    } catch (err) {
        return serverErrorResponse("MasterLocationPOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, locationSchema);
        if ("error" in result) return result.error;
        const { id, name, latitude, longitude, radius, isActive } = result.data;

        if (!id) {
            return NextResponse.json({ error: "ID lokasi diperlukan." }, { status: 400 });
        }

        const location = await prisma.location.update({
            where: { id },
            data: { name, latitude, longitude, radius, isActive },
        });

        logger.info("Location updated", { id, updatedBy: session.employeeId });
        return NextResponse.json(location);
    } catch (err) {
        return serverErrorResponse("MasterLocationPUT", err);
    }
}

export async function DELETE(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID lokasi diperlukan." }, { status: 400 });
        }

        await prisma.location.delete({ where: { id } });

        logger.info("Location deleted", { id, deletedBy: session.employeeId });
        return NextResponse.json({ success: true, message: "Lokasi berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("MasterLocationDELETE", err);
    }
}
