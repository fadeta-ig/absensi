import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== "hr") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const departmentId = searchParams.get("departmentId");

        const divisions = await prisma.division.findMany({
            where: departmentId ? { departmentId } : {},
            orderBy: { name: "asc" },
            include: { department: { select: { name: true } } },
        });

        return NextResponse.json(divisions);
    } catch (error) {
        console.error("[Master Division GET Error]:", error);
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
        if (!data.name || !data.departmentId) {
            return NextResponse.json({ error: "Nama dan Departemen harus diisi" }, { status: 400 });
        }

        const division = await prisma.division.create({
            data: {
                name: data.name,
                departmentId: data.departmentId,
                isActive: data.isActive !== undefined ? data.isActive : true,
            },
            include: { department: { select: { name: true } } },
        });

        return NextResponse.json(division);
    } catch (error) {
        console.error("[Master Division POST Error]:", error);
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
        if (!data.id || !data.name || !data.departmentId) {
            return NextResponse.json({ error: "ID, Nama, dan Departemen harus diisi" }, { status: 400 });
        }

        const division = await prisma.division.update({
            where: { id: data.id },
            data: {
                name: data.name,
                departmentId: data.departmentId,
                isActive: data.isActive !== undefined ? data.isActive : true,
            },
            include: { department: { select: { name: true } } },
        });

        return NextResponse.json(division);
    } catch (error) {
        console.error("[Master Division PUT Error]:", error);
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

        await prisma.division.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Master Division DELETE Error]:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
