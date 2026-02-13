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
        const type = searchParams.get("type"); // "allowance" | "deduction"

        const components = await prisma.payrollComponent.findMany({
            where: type ? { type } : {},
            orderBy: { name: "asc" },
        });

        return NextResponse.json(components);
    } catch (error) {
        console.error("[Master PayrollComponent GET Error]:", error);
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
        if (!data.name || !data.type) {
            return NextResponse.json({ error: "Nama dan Tipe harus diisi" }, { status: 400 });
        }

        const component = await prisma.payrollComponent.create({
            data: {
                name: data.name,
                type: data.type,
                defaultAmount: data.defaultAmount || 0,
                isActive: data.isActive !== undefined ? data.isActive : true,
                description: data.description || null,
            },
        });

        return NextResponse.json(component);
    } catch (error) {
        console.error("[Master PayrollComponent POST Error]:", error);
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
        if (!data.id || !data.name || !data.type) {
            return NextResponse.json({ error: "ID, Nama, dan Tipe harus diisi" }, { status: 400 });
        }

        const component = await prisma.payrollComponent.update({
            where: { id: data.id },
            data: {
                name: data.name,
                type: data.type,
                defaultAmount: data.defaultAmount || 0,
                isActive: data.isActive !== undefined ? data.isActive : true,
                description: data.description || null,
            },
        });

        return NextResponse.json(component);
    } catch (error) {
        console.error("[Master PayrollComponent PUT Error]:", error);
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

        await prisma.payrollComponent.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Master PayrollComponent DELETE Error]:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
