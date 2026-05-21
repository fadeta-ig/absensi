import { prisma } from "../prisma";
import { NewsItem } from "@/types";
import { unlink } from "fs/promises";
import path from "path";

const getUploadDir = () => path.join(process.cwd(), "public");

export async function getNews(): Promise<NewsItem[]> {
    const rows = await prisma.newsItem.findMany({
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    });
    return rows as unknown as NewsItem[];
}

export async function createNews(data: Omit<NewsItem, "id">): Promise<NewsItem> {
    const row = await prisma.newsItem.create({
        data: {
            title: data.title,
            content: data.content,
            category: data.category,
            author: data.author,
            createdAt: data.createdAt,
            isPinned: data.isPinned,
            mediaUrl: data.mediaUrl ?? null,
            mediaName: data.mediaName ?? null,
        },
    });
    return row as unknown as NewsItem;
}

export async function updateNews(id: string, data: Partial<NewsItem>): Promise<NewsItem | null> {
    try {
        if (data.mediaUrl !== undefined) {
            const oldRow = await prisma.newsItem.findUnique({ where: { id }, select: { mediaUrl: true } });
            if (oldRow?.mediaUrl && oldRow.mediaUrl !== data.mediaUrl) {
                const oldFilePath = path.join(getUploadDir(), oldRow.mediaUrl);
                try {
                    await unlink(oldFilePath);
                } catch { /* ignore if file not found */ }
            }
        }

        const row = await prisma.newsItem.update({
            where: { id },
            data: {
                ...(data.title !== undefined && { title: data.title }),
                ...(data.content !== undefined && { content: data.content }),
                ...(data.category !== undefined && { category: data.category }),
                ...(data.isPinned !== undefined && { isPinned: data.isPinned }),
                ...(data.mediaUrl !== undefined && { mediaUrl: data.mediaUrl }),
                ...(data.mediaName !== undefined && { mediaName: data.mediaName }),
            },
        });
        return row as unknown as NewsItem;
    } catch {
        return null;
    }
}

export async function deleteNews(id: string): Promise<boolean> {
    try {
        const oldRow = await prisma.newsItem.findUnique({ where: { id }, select: { mediaUrl: true } });
        if (oldRow?.mediaUrl) {
            const oldFilePath = path.join(getUploadDir(), oldRow.mediaUrl);
            try {
                await unlink(oldFilePath);
            } catch { /* ignore if file not found */ }
        }

        await prisma.newsItem.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}
