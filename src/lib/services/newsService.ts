import { prisma } from "../prisma";
import { NewsItem } from "@/types";
import { unlink } from "fs/promises";
import path from "path";
import logger from "@/lib/logger";
import { toISOOrNull } from "@/lib/utils";
import { Prisma } from "@prisma/client";

const getUploadDir = () => path.join(process.cwd(), "public");

const NEWS_CATEGORIES: NewsItem["category"][] = ["announcement", "event", "policy", "general"];

function toNewsCategory(value: string): NewsItem["category"] {
    return NEWS_CATEGORIES.includes(value as NewsItem["category"])
        ? value as NewsItem["category"]
        : "general";
}

function mapNewsItem(row: Prisma.NewsItemGetPayload<Record<string, never>>): NewsItem {
    return {
        ...row,
        category: toNewsCategory(row.category),
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
    const existing = await prisma.newsItem.findUnique({ where: { id }, select: { mediaUrl: true } });
    if (!existing) return null;

    if (data.mediaUrl !== undefined) {
        if (existing.mediaUrl && existing.mediaUrl !== data.mediaUrl) {
            const oldFilePath = path.join(getUploadDir(), existing.mediaUrl);
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
}

export async function deleteNews(id: string): Promise<boolean> {
    const existing = await prisma.newsItem.findUnique({ where: { id }, select: { mediaUrl: true } });
    if (!existing) return false;

    if (existing.mediaUrl) {
        const oldFilePath = path.join(getUploadDir(), existing.mediaUrl);
        try {
            await unlink(oldFilePath);
        } catch (error) {
            logger.warn("Old news media not found for deletion", { path: oldFilePath, error });
        }
    }

    await prisma.newsItem.delete({ where: { id } });
    return true;
}
