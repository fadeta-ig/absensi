import { prisma } from "../prisma";
import { NewsAudience, NewsItem, NewsTargetEmployee } from "@/types";
import { unlink } from "fs/promises";
import path from "path";
import logger from "@/lib/logger";
import { toISOOrNull } from "@/lib/utils";
import { Prisma } from "@prisma/client";

const getUploadDir = () => path.join(process.cwd(), "public");

const getPublicUploadsDir = () => path.resolve(getUploadDir(), "uploads");

export class NewsValidationError extends Error {
    readonly statusCode = 400;
    constructor(message: string) {
        super(message);
        this.name = "NewsValidationError";
    }
}

/**
 * Guard path traversal untuk file media berita (keputusan D4).
 * Mengembalikan absolute path hanya bila `mediaUrl` tetap berada di dalam `public/uploads`.
 * Menolak `../` dan absolute path di luar uploads dengan Error berbahasa Indonesia.
 */
export function assertInsidePublicUploads(mediaUrl: string): string {
    const publicUploads = getPublicUploadsDir();
    const resolved = path.resolve(getUploadDir(), mediaUrl.replace(/^\/+/, ""));
    if (!resolved.startsWith(`${publicUploads}${path.sep}`)) {
        throw new Error("Lokasi media berita tidak valid.");
    }
    return resolved;
}

const NEWS_CATEGORIES: NewsItem["category"][] = ["announcement", "event", "policy", "general"];

function toNewsCategory(value: string): NewsItem["category"] {
    return NEWS_CATEGORIES.includes(value as NewsItem["category"])
        ? (value as NewsItem["category"])
        : "general";
}

function toNewsAudience(value: string | null | undefined): NewsAudience {
    return value === "SELECTED" ? "SELECTED" : "ALL";
}

export function parseTargetEmployeeIds(raw: unknown): string[] {
    if (!raw) return [];
    let parsed: unknown = raw;
    if (typeof raw === "string") {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))];
}

/**
 * Menentukan apakah sebuah berita boleh dilihat oleh karyawan tertentu:
 * - `audience === "ALL"` (atau kosong/legacy) → tampil untuk semua karyawan
 * - `audience === "SELECTED"` → hanya tampil bila `employeeId` ada di `targetEmployeeIds`
 */
export function isNewsVisibleToEmployee(
    row: { audience?: string | null; targetEmployeeIds?: unknown },
    employeeId?: string | null,
): boolean {
    const audience = toNewsAudience(row.audience);
    if (audience === "ALL") return true;
    if (!employeeId) return false;
    const targets = parseTargetEmployeeIds(row.targetEmployeeIds);
    return targets.includes(employeeId);
}

function mapNewsItem(
    row: Prisma.NewsItemGetPayload<Record<string, never>>,
    opts?: { redactTargetList?: boolean; employeeById?: Map<string, NewsTargetEmployee> },
): NewsItem {
    const audience = toNewsAudience((row as { audience?: string | null }).audience);
    const targetIds = audience === "SELECTED"
        ? parseTargetEmployeeIds((row as { targetEmployeeIds?: unknown }).targetEmployeeIds)
        : null;

    if (opts?.redactTargetList) {
        return {
            id: row.id,
            title: row.title,
            content: row.content,
            category: toNewsCategory(row.category),
            author: row.author,
            createdAt: toISOOrNull(row.createdAt)!,
            isPinned: row.isPinned,
            mediaName: row.mediaName,
            mediaUrl: row.mediaUrl,
            audience,
            targetEmployeeIds: null,
        };
    }

    const targetEmployees = targetIds && opts?.employeeById
        ? targetIds.map((empId) => opts.employeeById!.get(empId) ?? { employeeId: empId, name: empId })
        : undefined;

    return {
        id: row.id,
        title: row.title,
        content: row.content,
        category: toNewsCategory(row.category),
        author: row.author,
        createdAt: toISOOrNull(row.createdAt)!,
        isPinned: row.isPinned,
        mediaName: row.mediaName,
        mediaUrl: row.mediaUrl,
        audience,
        targetEmployeeIds: targetIds,
        ...(targetEmployees ? { targetEmployees } : {}),
    };
}

async function resolveTargetEmployeeMap(ids: string[]): Promise<Map<string, NewsTargetEmployee>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const map = new Map<string, NewsTargetEmployee>();
    if (unique.length === 0 || !prisma.employee?.findMany) return map;

    const employees = await prisma.employee.findMany({
        where: { employeeId: { in: unique } },
        select: {
            employeeId: true,
            name: true,
            departmentRel: { select: { name: true } },
            positionRel: { select: { name: true } },
        },
    });
    for (const emp of employees) {
        map.set(emp.employeeId, {
            employeeId: emp.employeeId,
            name: emp.name,
            department: emp.departmentRel?.name || "-",
            position: emp.positionRel?.name || "-",
        });
    }
    return map;
}

async function validateAndNormalizeAudience(input: {
    audience?: NewsAudience;
    targetEmployeeIds?: string[] | null;
}): Promise<{ audience: NewsAudience; targetEmployeeIds: string[] | null }> {
    const audience = toNewsAudience(input.audience);
    if (audience === "ALL") {
        return { audience: "ALL", targetEmployeeIds: null };
    }

    const ids = [...new Set((input.targetEmployeeIds ?? []).map((v) => v.trim()).filter(Boolean))];
    if (ids.length === 0) {
        throw new NewsValidationError("Pilih minimal 1 karyawan penerima untuk berita khusus/private.");
    }

    if (prisma.employee?.findMany) {
        const rows = await prisma.employee.findMany({
            where: { employeeId: { in: ids }, isActive: true },
            select: { employeeId: true },
        });
        const activeSet = new Set(rows.map((r) => r.employeeId));
        const invalidIds = ids.filter((id) => !activeSet.has(id));
        if (invalidIds.length > 0) {
            throw new NewsValidationError(
                `Karyawan penerima tidak ditemukan atau sudah nonaktif: ${invalidIds.slice(0, 5).join(", ")}.`
            );
        }
    }

    return { audience: "SELECTED", targetEmployeeIds: ids };
}

export async function getNews(options?: {
    viewerEmployeeId?: string | null;
    includeAllForHr?: boolean;
}): Promise<NewsItem[]> {
    const rows = await prisma.newsItem.findMany({
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    });

    const isHrView = options === undefined || options.includeAllForHr === true;
    if (!isHrView) {
        const visibleRows = rows.filter((row) => isNewsVisibleToEmployee(row, options?.viewerEmployeeId));
        return visibleRows.map((row) => mapNewsItem(row, { redactTargetList: true }));
    }

    const allTargetIds = rows.flatMap((row) =>
        toNewsAudience((row as { audience?: string | null }).audience) === "SELECTED"
            ? parseTargetEmployeeIds((row as { targetEmployeeIds?: unknown }).targetEmployeeIds)
            : []
    );
    const employeeById = await resolveTargetEmployeeMap(allTargetIds);

    return rows.map((row) => mapNewsItem(row, { employeeById }));
}

export async function createNews(data: Omit<NewsItem, "id">): Promise<NewsItem> {
    const normalized = await validateAndNormalizeAudience({
        audience: data.audience,
        targetEmployeeIds: data.targetEmployeeIds,
    });

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
            audience: normalized.audience,
            targetEmployeeIds: normalized.targetEmployeeIds ?? Prisma.DbNull,
        },
    });
    const employeeById = normalized.targetEmployeeIds
        ? await resolveTargetEmployeeMap(normalized.targetEmployeeIds)
        : undefined;
    return mapNewsItem(row, { employeeById });
}

export async function updateNews(id: string, data: Partial<NewsItem>): Promise<NewsItem | null> {
    const existing = await prisma.newsItem.findUnique({
        where: { id },
        select: { mediaUrl: true, audience: true, targetEmployeeIds: true },
    });
    if (!existing) return null;

    if (data.mediaUrl !== undefined) {
        if (existing.mediaUrl && existing.mediaUrl !== data.mediaUrl) {
            const oldFilePath = assertInsidePublicUploads(existing.mediaUrl);
            try {
                await unlink(oldFilePath);
            } catch (error) {
                logger.warn("Old news media not found for deletion", { path: oldFilePath, error });
            }
        }
    }

    let audiencePatch: { audience: NewsAudience; targetEmployeeIds: string[] | typeof Prisma.DbNull } | undefined;
    if (data.audience !== undefined || data.targetEmployeeIds !== undefined) {
        const nextAudience = data.audience ?? toNewsAudience(existing.audience);
        const nextTargets = data.targetEmployeeIds !== undefined
            ? data.targetEmployeeIds
            : parseTargetEmployeeIds(existing.targetEmployeeIds);
        const normalized = await validateAndNormalizeAudience({
            audience: nextAudience,
            targetEmployeeIds: nextTargets,
        });
        audiencePatch = {
            audience: normalized.audience,
            targetEmployeeIds: normalized.targetEmployeeIds ?? Prisma.DbNull,
        };
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
            ...(audiencePatch ? audiencePatch : {}),
        },
    });

    const targetIds = toNewsAudience(row.audience) === "SELECTED"
        ? parseTargetEmployeeIds(row.targetEmployeeIds)
        : [];
    const employeeById = targetIds.length > 0 ? await resolveTargetEmployeeMap(targetIds) : undefined;
    return mapNewsItem(row, { employeeById });
}

export async function deleteNews(id: string): Promise<boolean> {
    const existing = await prisma.newsItem.findUnique({ where: { id }, select: { mediaUrl: true } });
    if (!existing) return false;

    if (existing.mediaUrl) {
        const oldFilePath = assertInsidePublicUploads(existing.mediaUrl);
        try {
            await unlink(oldFilePath);
        } catch (error) {
            logger.warn("Old news media not found for deletion", { path: oldFilePath, error });
        }
    }

    await prisma.newsItem.delete({ where: { id } });
    return true;
}
