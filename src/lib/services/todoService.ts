import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";
import { TodoItem } from "@/types";

/** Mapper aman: mengkonversi objek Prisma TodoItem (Date) ke domain type (string ISO) */
function toTodoItem(row: Prisma.TodoItemGetPayload<Record<string, never>>): TodoItem {
    return {
        id: row.id,
        employeeId: row.employeeId,
        text: row.text,
        completed: row.completed,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
}

export async function getTodos(employeeId: string): Promise<TodoItem[]> {
    const rows = await prisma.todoItem.findMany({
        where: { employeeId },
        orderBy: { createdAt: "desc" },
    });
    return rows.map(toTodoItem);
}

export async function createTodo(data: Omit<TodoItem, "id">): Promise<TodoItem> {
    const row = await prisma.todoItem.create({
        data: {
            employeeId: data.employeeId,
            text: data.text,
            completed: data.completed,
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        },
    });
    return toTodoItem(row);
}

export async function updateTodo(id: string, data: Partial<TodoItem>): Promise<TodoItem | null> {
    const existing = await prisma.todoItem.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return null;

    const row = await prisma.todoItem.update({
        where: { id },
        data: {
            ...(data.text !== undefined && { text: data.text }),
            ...(data.completed !== undefined && { completed: data.completed }),
        },
    });
    return toTodoItem(row);
}

export async function deleteTodo(id: string): Promise<boolean> {
    const existing = await prisma.todoItem.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return false;
    await prisma.todoItem.delete({ where: { id } });
    return true;
}
