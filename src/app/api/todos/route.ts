import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { getTodos, createTodo, updateTodo, deleteTodo } from "@/lib/services/todoService";
import { todoCreateSchema, todoUpdateSchema } from "@/lib/validations/validationSchemas";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const todos = await getTodos(session.employeeId);
        return NextResponse.json(todos);
    } catch (err) {
        return serverErrorResponse("TodosGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const result = await validateBody(request, todoCreateSchema);
        if ("error" in result) return result.error;
        const { text } = result.data;

        const todo = await createTodo({
            employeeId: session.employeeId,
            text,
            completed: false,
            createdAt: new Date().toISOString(),
        });

        logger.info("Todo item created", { employeeId: session.employeeId, todoId: todo.id });
        return NextResponse.json(todo, { status: 201 });
    } catch (err) {
        return serverErrorResponse("TodosPOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const result = await validateBody(request, todoUpdateSchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;

        const updated = await updateTodo(id, data);
        if (!updated) {
            return NextResponse.json({ error: "Tugas tidak ditemukan." }, { status: 404 });
        }

        // Ownership check can be added if todo service doesn't handle it

        logger.info("Todo item updated", { todoId: id, employeeId: session.employeeId });
        return NextResponse.json(updated);
    } catch (err) {
        return serverErrorResponse("TodosPUT", err);
    }
}

export async function DELETE(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "ID tugas diperlukan." }, { status: 400 });
        }

        const deleted = await deleteTodo(id);
        if (!deleted) {
            return NextResponse.json({ error: "Tugas tidak ditemukan." }, { status: 404 });
        }

        logger.info("Todo item deleted", { todoId: id, employeeId: session.employeeId });
        return NextResponse.json({ success: true, message: "Tugas berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("TodosDELETE", err);
    }
}
