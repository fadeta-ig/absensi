import { prisma } from "../prisma";
import { NewsItem } from "@/types";
import { unlink } from "fs/promises";
import path from "path";
import logger from "@/lib/logger";
import { toISOOrNull } from "@/lib/utils";

const getUploadDir = () => path.join(process.cwd(), "public");

function mapNewsItem(row: any): NewsItem {
    return {
        ...row,
        createdAt: toISOOrNull(row.createdAt)!
    };
}

export async function getNews(): Promise<NewsItem[]> {
    const rows = await prisma.newsItem.findMany({
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(mapNewsItem);
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
    return mapNewsItem(row);
}

export async function updateNews(id: string, data: Partial<NewsItem>): Promise<NewsItem | null> {
    try {
        if (data.mediaUrl !== undefined) {
            const oldRow = await prisma.newsItem.findUnique({ where: { id }, select: { mediaUrl: true } });
            if (oldRow?.mediaUrl && oldRow.mediaUrl !== data.mediaUrl) {
                const oldFilePath = path.join(getUploadDir(), oldRow.mediaUrl);
                try {
                    await unlink(oldFilePath);
                } catch (error) {
                    logger.warn("Old news media not found for deletion", { path: oldFilePath, error });
                }
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
        return mapNewsItem(row);
    } catch (error) {
        logger.error("Failed to update news", { id, error });
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
            } catch (error) {
                logger.warn("Old news media not found for deletion", { path: oldFilePath, error });
            }
        }

        await prisma.newsItem.delete({ where: { id } });
        return true;
    } catch (error) {
        logger.error("Failed to delete news", { id, error });
        return false;
    }
}
