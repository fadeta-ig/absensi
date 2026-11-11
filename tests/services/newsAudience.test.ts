import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    newsFindMany: vi.fn(),
    newsCreate: vi.fn(),
    newsFindUnique: vi.fn(),
    newsUpdate: vi.fn(),
    employeeFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        newsItem: {
            findMany: mocks.newsFindMany,
            create: mocks.newsCreate,
            findUnique: mocks.newsFindUnique,
            update: mocks.newsUpdate,
        },
        employee: { findMany: mocks.employeeFindMany },
    },
}));

import {
    createNews,
    getNews,
    isNewsVisibleToEmployee,
    NewsValidationError,
    parseTargetEmployeeIds,
} from "@/lib/services/newsService";
import { newsCreateSchema } from "@/lib/validations/validationSchemas";

function row(over: Record<string, unknown>) {
    return {
        id: "n1",
        title: "Judul",
        content: "Isi",
        category: "announcement",
        author: "HR",
        createdAt: new Date("2026-11-11T02:00:00.000Z"),
        isPinned: false,
        mediaName: null,
        mediaUrl: null,
        audience: "ALL",
        targetEmployeeIds: null,
        ...over,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("isNewsVisibleToEmployee", () => {
    it("berita ALL / legacy tampil untuk semua karyawan", () => {
        expect(isNewsVisibleToEmployee({ audience: "ALL" }, "EMP001")).toBe(true);
        expect(isNewsVisibleToEmployee({ audience: null }, "EMP001")).toBe(true);
        expect(isNewsVisibleToEmployee({}, null)).toBe(true);
    });

    it("berita SELECTED hanya tampil untuk penerima", () => {
        const news = { audience: "SELECTED", targetEmployeeIds: ["EMP001", "EMP002"] };
        expect(isNewsVisibleToEmployee(news, "EMP001")).toBe(true);
        expect(isNewsVisibleToEmployee(news, "EMP003")).toBe(false);
        expect(isNewsVisibleToEmployee(news, null)).toBe(false);
    });

    it("parseTargetEmployeeIds menerima array maupun string JSON", () => {
        expect(parseTargetEmployeeIds(["A", " A ", "B"])).toEqual(["A", "B"]);
        expect(parseTargetEmployeeIds('["X","Y"]')).toEqual(["X", "Y"]);
        expect(parseTargetEmployeeIds("rusak")).toEqual([]);
        expect(parseTargetEmployeeIds(null)).toEqual([]);
    });
});

describe("getNews", () => {
    it("karyawan hanya menerima berita umum + berita khusus untuk dirinya, tanpa daftar penerima", async () => {
        mocks.newsFindMany.mockResolvedValue([
            row({ id: "public" }),
            row({ id: "mine", audience: "SELECTED", targetEmployeeIds: ["EMP001", "EMP009"] }),
            row({ id: "other", audience: "SELECTED", targetEmployeeIds: ["EMP002"] }),
        ]);
        const out = await getNews({ viewerEmployeeId: "EMP001", includeAllForHr: false });
        expect(out.map((n) => n.id)).toEqual(["public", "mine"]);
        expect(out[1].audience).toBe("SELECTED");
        expect(out[1].targetEmployeeIds).toBeNull();
        expect(mocks.employeeFindMany).not.toHaveBeenCalled();
    });

    it("HR menerima semua berita lengkap dengan nama penerima", async () => {
        mocks.newsFindMany.mockResolvedValue([
            row({ id: "public" }),
            row({ id: "other", audience: "SELECTED", targetEmployeeIds: ["EMP002"] }),
        ]);
        mocks.employeeFindMany.mockResolvedValue([
            { employeeId: "EMP002", name: "Siti", departmentRel: { name: "Produksi" }, positionRel: null },
        ]);
        const out = await getNews({ includeAllForHr: true });
        expect(out).toHaveLength(2);
        expect(out[1].targetEmployees).toEqual([
            { employeeId: "EMP002", name: "Siti", department: "Produksi", position: "-" },
        ]);
    });
});

describe("createNews", () => {
    const base = {
        title: "Info",
        content: "Isi",
        category: "announcement" as const,
        author: "HR",
        createdAt: "2026-11-11T02:00:00.000Z",
        isPinned: false,
    };

    it("menolak penerima nonaktif / tidak dikenal", async () => {
        mocks.employeeFindMany.mockResolvedValue([{ employeeId: "EMP001" }]);
        await expect(
            createNews({ ...base, audience: "SELECTED", targetEmployeeIds: ["EMP001", "EMP404"] })
        ).rejects.toBeInstanceOf(NewsValidationError);
        expect(mocks.newsCreate).not.toHaveBeenCalled();
    });

    it("menyimpan target penerima unik untuk berita khusus", async () => {
        mocks.employeeFindMany
            .mockResolvedValueOnce([{ employeeId: "EMP001" }, { employeeId: "EMP002" }])
            .mockResolvedValueOnce([
                { employeeId: "EMP001", name: "Budi", departmentRel: null, positionRel: null },
                { employeeId: "EMP002", name: "Siti", departmentRel: null, positionRel: null },
            ]);
        mocks.newsCreate.mockResolvedValue(row({ audience: "SELECTED", targetEmployeeIds: ["EMP001", "EMP002"] }));
        const out = await createNews({ ...base, audience: "SELECTED", targetEmployeeIds: ["EMP001", "EMP002", "EMP001"] });
        expect(mocks.newsCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ audience: "SELECTED", targetEmployeeIds: ["EMP001", "EMP002"] }),
            })
        );
        expect(out.targetEmployees).toHaveLength(2);
    });

    it("berita ALL tidak menyimpan daftar penerima", async () => {
        mocks.newsCreate.mockResolvedValue(row({}));
        const out = await createNews({ ...base, audience: "ALL", targetEmployeeIds: ["EMP001"] });
        expect(mocks.newsCreate).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ audience: "ALL" }) })
        );
        expect(out.audience).toBe("ALL");
        expect(mocks.employeeFindMany).not.toHaveBeenCalled();
    });
});

describe("newsCreateSchema", () => {
    it("SELECTED tanpa penerima ditolak, ALL default diterima", () => {
        expect(newsCreateSchema.safeParse({ title: "A", content: "B", category: "general", audience: "SELECTED", targetEmployeeIds: [] }).success).toBe(false);
        const ok = newsCreateSchema.safeParse({ title: "A", content: "B", category: "general" });
        expect(ok.success).toBe(true);
        if (ok.success) expect(ok.data.audience).toBe("ALL");
    });
});
