import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== "hr") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const locations = await prisma.location.findMany({
            orderBy: { name: "asc" },
        });

        return NextResponse.json(locations);
    } catch (error) {
        console.error("[Master Location GET Error]:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== "hr") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const data = await request.json();
        if (!data.name || data.latitude === undefined || data.longitude === undefined) {
            return NextResponse.json({ error: "Nama, latitude, dan longitude harus diisi" }, { status: 400 });
        }

        const location = await prisma.location.create({
            data: {
                name: data.name,
                latitude: parseFloat(data.latitude),
                longitude: parseFloat(data.longitude),
                radius: data.radius ? parseFloat(data.radius) : 100,
                isActive: data.isActive !== undefined ? data.isActive : true,
            },
        });

        return NextResponse.json(location);
    } catch (error) {
        console.error("[Master Location POST Error]:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== "hr") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const data = await request.json();
        if (!data.id || !data.name || data.latitude === undefined || data.longitude === undefined) {
            return NextResponse.json({ error: "ID, Nama, latitude, dan longitude harus diisi" }, { status: 400 });
        }

        const location = await prisma.location.update({
            where: { id: data.id },
            data: {
                name: data.name,
                latitude: parseFloat(data.latitude),
                longitude: parseFloat(data.longitude),
                radius: data.radius ? parseFloat(data.radius) : 100,
                isActive: data.isActive !== undefined ? data.isActive : true,
            },
        });

        return NextResponse.json(location);
    } catch (error) {
        console.error("[Master Location PUT Error]:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== "hr") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID harus diisi" }, { status: 400 });
        }

        await prisma.location.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Master Location DELETE Error]:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
