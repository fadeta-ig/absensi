import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getNews, createNews, updateNews, deleteNews, NewsValidationError } from "@/lib/services/newsService";
import { newsCreateSchema, newsUpdateSchema } from "@/lib/validations/validationSchemas";
import { canManageHr } from "@/lib/permissions";
import logger from "@/lib/logger";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const isHr = canManageHr(session) || session.role === "hr";
        const news = await getNews({
            includeAllForHr: isHr,
            viewerEmployeeId: session.employeeId,
        });
        return NextResponse.json(news);
    } catch (err) {
        return serverErrorResponse("NewsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session) && session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, newsCreateSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        const news = await createNews({
            ...body,
            author: session.name,
            createdAt: new Date().toISOString(),
        });

        logger.info("News item created", {
            newsId: news.id,
            author: session.username,
            audience: news.audience,
            targetCount: news.targetEmployeeIds?.length ?? 0,
        });
        return NextResponse.json(news, { status: 201 });
    } catch (err) {
        if (err instanceof NewsValidationError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("NewsPOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session) && session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, newsUpdateSchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;

        const updated = await updateNews(id, data);
        if (!updated) {
            return NextResponse.json({ error: "Pengumuman tidak ditemukan." }, { status: 404 });
        }

        logger.info("News item updated", { newsId: id, updatedBy: session.username });
        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof NewsValidationError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("NewsPUT", err);
    }
}

export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session) && session.role !== "hr") return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "ID pengumuman diperlukan." }, { status: 400 });
        }

        const success = await deleteNews(id);
        if (!success) {
            return NextResponse.json({ error: "Pengumuman tidak ditemukan." }, { status: 404 });
        }

        logger.info("News item deleted", { newsId: id, deletedBy: session.username });
        return NextResponse.json({ success: true, message: "Pengumuman berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("NewsDELETE", err);
    }
}
