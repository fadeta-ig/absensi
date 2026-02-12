import { prisma } from "../prisma";
import { NewsItem } from "@/types";

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
        },
    });
    return row as unknown as NewsItem;
}

export async function updateNews(id: string, data: Partial<NewsItem>): Promise<NewsItem | null> {
    try {
        const row = await prisma.newsItem.update({
            where: { id },
            data: {
                ...(data.title !== undefined && { title: data.title }),
                ...(data.content !== undefined && { content: data.content }),
                ...(data.category !== undefined && { category: data.category }),
                ...(data.isPinned !== undefined && { isPinned: data.isPinned }),
            },
        });
        return row as unknown as NewsItem;
    } catch {
        return null;
    }
}

export async function deleteNews(id: string): Promise<boolean> {
    try {
        await prisma.newsItem.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}
