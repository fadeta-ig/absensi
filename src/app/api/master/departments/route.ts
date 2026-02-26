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
        const divisionId = searchParams.get("divisionId");

        const departments = await prisma.department.findMany({
            where: divisionId ? { divisionId } : {},
            orderBy: { name: "asc" },
            include: { division: { select: { name: true } } },
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
        if (!data.name || !data.divisionId) {
            return NextResponse.json({ error: "Nama departemen dan Divisi harus diisi" }, { status: 400 });
        }

        const department = await prisma.department.create({
            data: {
                name: data.name,
                code: data.code || null,
                description: data.description || null,
                divisionId: data.divisionId,
                isActive: data.isActive !== undefined ? data.isActive : true,
            },
            include: { division: { select: { name: true } } },
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
        if (!data.id || !data.name || !data.divisionId) {
            return NextResponse.json({ error: "ID, Nama, dan Divisi harus diisi" }, { status: 400 });
        }

        const department = await prisma.department.update({
            where: { id: data.id },
            data: {
                name: data.name,
                code: data.code || null,
                description: data.description || null,
                divisionId: data.divisionId,
                isActive: data.isActive !== undefined ? data.isActive : true,
            },
            include: { division: { select: { name: true } } },
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

        // Check for dependencies if any (none yet for Department -> Employee)
        // Note: In schema.prisma, Employee still has 'department' as a String field, 
        // not a relation yet. But for master data integrity:
        /*
        const employeesCount = await prisma.employee.count({ where: { department: id } });
        if (employeesCount > 0) {
            return NextResponse.json({ error: "Gagal menghapus: Departemen masih digunakan oleh karyawan." }, { status: 400 });
        }
        */

        await prisma.department.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Master Department DELETE Error]:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
