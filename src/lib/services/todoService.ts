import { prisma } from "../prisma";
import { TodoItem } from "@/types";

export async function getTodos(employeeId: string): Promise<TodoItem[]> {
    const rows = await prisma.todoItem.findMany({
        where: { employeeId },
        orderBy: { createdAt: "desc" },
    });
    return rows as unknown as TodoItem[];
}

export async function createTodo(data: Omit<TodoItem, "id">): Promise<TodoItem> {
    const row = await prisma.todoItem.create({
        data: {
            employeeId: data.employeeId,
            text: data.text,
            completed: data.completed,
            createdAt: data.createdAt,
        },
    });
    return row as unknown as TodoItem;
}

export async function updateTodo(id: string, data: Partial<TodoItem>): Promise<TodoItem | null> {
    try {
        const row = await prisma.todoItem.update({
            where: { id },
            data: {
                ...(data.text !== undefined && { text: data.text }),
                ...(data.completed !== undefined && { completed: data.completed }),
            },
        });
        return row as unknown as TodoItem;
    } catch {
        return null;
    }
}

export async function deleteTodo(id: string): Promise<boolean> {
    try {
        await prisma.todoItem.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}
