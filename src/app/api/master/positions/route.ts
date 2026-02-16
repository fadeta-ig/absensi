import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== "hr") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const positions = await prisma.position.findMany({
            orderBy: { name: "asc" },
        });

        return NextResponse.json(positions);
    } catch (error) {
        console.error("[Master Position GET Error]:", error);
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
        if (!data.name) {
            return NextResponse.json({ error: "Nama jabatan harus diisi" }, { status: 400 });
        }

        const position = await prisma.position.create({
            data: {
                name: data.name,
                isActive: data.isActive !== undefined ? data.isActive : true,
            },
        });

        return NextResponse.json(position);
    } catch (error) {
        console.error("[Master Position POST Error]:", error);
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
        if (!data.id || !data.name) {
            return NextResponse.json({ error: "ID dan Nama jabatan harus diisi" }, { status: 400 });
        }

        const position = await prisma.position.update({
            where: { id: data.id },
            data: {
                name: data.name,
                isActive: data.isActive !== undefined ? data.isActive : true,
            },
        });

        return NextResponse.json(position);
    } catch (error) {
        console.error("[Master Position PUT Error]:", error);
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

        await prisma.position.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Master Position DELETE Error]:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
