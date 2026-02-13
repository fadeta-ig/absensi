import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await getSession();
        if (!session || session.role !== "hr") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const departments = await prisma.department.findMany({
            orderBy: { name: "asc" },
            include: { _count: { select: { positions: true } } },
        });

        return NextResponse.json(departments);
    } catch (error) {
        console.error("[Master Department GET Error]:", error);
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
            return NextResponse.json({ error: "Nama departemen harus diisi" }, { status: 400 });
        }

        const department = await prisma.department.create({
            data: {
                name: data.name,
                code: data.code || null,
                description: data.description || null,
                isActive: data.isActive !== undefined ? data.isActive : true,
            },
        });

        return NextResponse.json(department);
    } catch (error) {
        console.error("[Master Department POST Error]:", error);
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
            return NextResponse.json({ error: "ID dan Nama departemen harus diisi" }, { status: 400 });
        }

        const department = await prisma.department.update({
            where: { id: data.id },
            data: {
                name: data.name,
                code: data.code || null,
                description: data.description || null,
                isActive: data.isActive !== undefined ? data.isActive : true,
            },
        });

        return NextResponse.json(department);
    } catch (error) {
        console.error("[Master Department PUT Error]:", error);
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

        // Check for employees or positions using this department - but since we store department as string in Employee,
        // we only need to check for positions.
        const positionsCount = await prisma.position.count({ where: { departmentId: id } });
        if (positionsCount > 0) {
            return NextResponse.json({ error: "Gagal menghapus: Departemen masih digunakan oleh jabatan." }, { status: 400 });
        }

        await prisma.department.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Master Department DELETE Error]:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
