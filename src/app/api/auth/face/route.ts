import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** GET — Check if current employee has a face registered */
export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employee = await prisma.employee.findUnique({
        where: { employeeId: session.employeeId },
        select: { faceDescriptor: true },
    });

    if (!employee) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const descriptor = employee.faceDescriptor as number[] | null;
    return NextResponse.json({
        hasFace: !!descriptor && Array.isArray(descriptor) && descriptor.length === 128,
        descriptor: descriptor,
    });
}

/** POST — Save face descriptor for current employee */
export async function POST(request: Request) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { descriptor } = body;

        // Validate descriptor format
        if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
            return NextResponse.json(
                { error: "Face descriptor harus berupa array 128 angka" },
                { status: 400 }
            );
        }

        // Validate all entries are numbers
        const isValidNumbers = descriptor.every((v: unknown) => typeof v === "number" && !isNaN(v as number));
        if (!isValidNumbers) {
            return NextResponse.json(
                { error: "Face descriptor mengandung data tidak valid" },
                { status: 400 }
            );
        }

        await prisma.employee.update({
            where: { employeeId: session.employeeId },
            data: { faceDescriptor: descriptor },
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[API Face Error]:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

/** DELETE — Remove face descriptor for current employee */
export async function DELETE() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await prisma.employee.update({
            where: { employeeId: session.employeeId },
            data: { faceDescriptor: Prisma.DbNull },
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[API Face Delete Error]:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
