import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeEmployeeSession, makeWig002Session } from "../fixtures/cleaning";

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => NextResponse.json({ error: "unauthorized" }, { status: 401 })),
    forbiddenResponse: vi.fn(() => NextResponse.json({ error: "forbidden" }, { status: 403 })),
    serverErrorResponse: vi.fn(() => NextResponse.json({ error: "internal" }, { status: 500 })),
    validateBody: vi.fn(async (request: NextRequest, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }) => {
        const json = await request.json();
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
            return { error: NextResponse.json({ error: "validation" }, { status: 400 }) };
        }
        return { data: parsed.data };
    }),
}));

vi.mock("@/lib/services/appSettingsService", () => {
    class AppSettingsError extends Error {
        constructor(message: string, public statusCode = 400) {
            super(message);
            this.name = "AppSettingsError";
        }
    }
    return { AppSettingsError };
});

vi.mock("@/lib/services/greetingSettingsService", () => ({
    canManageGreeting: vi.fn(),
    createGreetingRule: vi.fn(),
    deleteEmployeeGreetingQuote: vi.fn(),
    deleteGreetingRule: vi.fn(),
    getGreetingEditorInfo: vi.fn(),
    isGreetingEditor: vi.fn(),
    isWig002Session: (session: { username: string; permissions: string[] }) =>
        session.username === "WIG002" && session.permissions.includes("ga.manage"),
    listActiveGreetingQuotes: vi.fn(),
    listActiveGreetingRules: vi.fn(),
    listEmployeeGreetingQuotes: vi.fn(),
    listGreetingEditorCandidates: vi.fn(),
    listGreetingRules: vi.fn(),
    updateEmployeeGreetingQuote: vi.fn(),
    updateGreetingEditor: vi.fn(),
    updateGreetingRule: vi.fn(),
}));

import { requireAuth } from "@/lib/middleware/apiGuard";
import { AppSettingsError } from "@/lib/services/appSettingsService";
import {
    canManageGreeting,
    createGreetingRule,
    deleteEmployeeGreetingQuote,
    deleteGreetingRule,
    getGreetingEditorInfo,
    isGreetingEditor,
    listActiveGreetingQuotes,
    listActiveGreetingRules,
    listEmployeeGreetingQuotes,
    listGreetingEditorCandidates,
    listGreetingRules,
    updateEmployeeGreetingQuote,
    updateGreetingEditor,
    updateGreetingRule,
} from "@/lib/services/greetingSettingsService";
import type { GreetingRuleInput, GreetingRuleLike, GreetingRuleView } from "@/lib/greeting";
import { GET as rulesGET, POST as rulesPOST } from "@/app/api/ga/greeting-settings/route";
import { PUT as rulePUT, DELETE as ruleDELETE } from "@/app/api/ga/greeting-settings/[id]/route";
import { GET as editorGET, PUT as editorPUT } from "@/app/api/ga/greeting-settings/editor/route";
import { GET as quotesGET } from "@/app/api/ga/greeting-settings/quotes/route";
import { PATCH as quotePATCH, DELETE as quoteDELETE } from "@/app/api/ga/greeting-settings/quotes/[id]/route";
import { GET as employeeGET } from "@/app/api/employee/greeting/route";

function jsonRequest(url: string, body: unknown, method = "PUT") {
    return new NextRequest(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function ruleInput(overrides: Partial<GreetingRuleInput> = {}): GreetingRuleInput {
    return {
        name: "Sapaan Pagi",
        greeting: "Selamat Pagi!",
        subGreeting: "Awali hari dengan semangat.",
        startTime: "05:00",
        endTime: "11:00",
        repeatWeekly: true,
        daysOfWeek: [1, 2, 3, 4, 5],
        specificDate: null,
        priority: 10,
        isActive: true,
        ...overrides,
    };
}

function ruleView(overrides: Partial<GreetingRuleView> = {}): GreetingRuleView {
    return { id: "rule-1", ...ruleInput(), ...overrides };
}

function ruleLike(overrides: Partial<GreetingRuleLike> = {}): GreetingRuleLike {
    const { greeting, subGreeting, startTime, endTime, repeatWeekly, daysOfWeek, specificDate, priority } =
        ruleInput(overrides);
    return { greeting, subGreeting, startTime, endTime, repeatWeekly, daysOfWeek, specificDate, priority };
}

const idParams = { params: Promise.resolve({ id: "rule-1" }) };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listGreetingRules).mockResolvedValue([ruleView()]);
    vi.mocked(listActiveGreetingRules).mockResolvedValue([ruleLike()]);
    vi.mocked(listActiveGreetingQuotes).mockResolvedValue([
        {
            id: "q-1",
            greeting: "Good Morning",
            quote: "Semangat terus!",
            authorName: "Daffa Fakhuddin",
            slot: "PAGI",
        },
    ]);
    vi.mocked(getGreetingEditorInfo).mockResolvedValue(null);
});

describe("Aturan sapaan — guard akses", () => {
    it("401 tanpa sesi pada endpoint baca", async () => {
        vi.mocked(requireAuth).mockResolvedValue(null);
        expect((await rulesGET()).status).toBe(401);
        expect((await editorGET()).status).toBe(401);
        expect((await employeeGET()).status).toBe(401);
    });

    it("GET aturan 403 bila bukan WIG002 dan bukan editor terpilih", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession({ employeeId: "ID-9" }));
        vi.mocked(canManageGreeting).mockResolvedValue(false);
        expect((await rulesGET()).status).toBe(403);
    });

    it("GET aturan 200 untuk WIG002 maupun editor terpilih", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(canManageGreeting).mockResolvedValue(true);

        const res = await rulesGET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.rules).toHaveLength(1);
        expect(json.data.rules[0].name).toBe("Sapaan Pagi");
    });
});

describe("Aturan sapaan — CRUD", () => {
    it("POST 403 bila bukan pengelola", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession({ employeeId: "ID-9" }));
        vi.mocked(canManageGreeting).mockResolvedValue(false);

        const res = await rulesPOST(jsonRequest("http://localhost/api/ga/greeting-settings", ruleInput(), "POST"));
        expect(res.status).toBe(403);
        expect(createGreetingRule).not.toHaveBeenCalled();
    });

    it("POST 400 bila body tidak lengkap", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(canManageGreeting).mockResolvedValue(true);

        const res = await rulesPOST(
            jsonRequest("http://localhost/api/ga/greeting-settings", { name: "Hanya nama" }, "POST")
        );
        expect(res.status).toBe(400);
        expect(createGreetingRule).not.toHaveBeenCalled();
    });

    it("POST 201 meneruskan aturan ke service", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(canManageGreeting).mockResolvedValue(true);
        vi.mocked(createGreetingRule).mockResolvedValue(ruleView());

        const res = await rulesPOST(
            jsonRequest("http://localhost/api/ga/greeting-settings", ruleInput(), "POST")
        );
        expect(res.status).toBe(201);
        expect(createGreetingRule).toHaveBeenCalledWith(expect.objectContaining({ name: "Sapaan Pagi" }), expect.any(String));
    });

    it("PUT 200 meneruskan id dan aturan", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(canManageGreeting).mockResolvedValue(true);
        vi.mocked(updateGreetingRule).mockResolvedValue(ruleView({ name: "Diubah" }));

        const res = await rulePUT(
            jsonRequest("http://localhost/api/ga/greeting-settings/rule-1", ruleInput({ name: "Diubah" })),
            idParams
        );
        expect(res.status).toBe(200);
        expect(updateGreetingRule).toHaveBeenCalledWith("rule-1", expect.objectContaining({ name: "Diubah" }), expect.any(String));
    });

    it("PUT/DELETE 403 bila bukan pengelola", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession({ employeeId: "ID-9" }));
        vi.mocked(canManageGreeting).mockResolvedValue(false);

        expect(
            (await rulePUT(jsonRequest("http://localhost/api/ga/greeting-settings/rule-1", ruleInput()), idParams)).status
        ).toBe(403);
        expect(
            (await ruleDELETE(jsonRequest("http://localhost/api/ga/greeting-settings/rule-1", {}, "DELETE"), idParams)).status
        ).toBe(403);
    });

    it("DELETE 200 menghapus aturan", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(canManageGreeting).mockResolvedValue(true);
        vi.mocked(deleteGreetingRule).mockResolvedValue(undefined);

        const res = await ruleDELETE(
            jsonRequest("http://localhost/api/ga/greeting-settings/rule-1", {}, "DELETE"),
            idParams
        );
        expect(res.status).toBe(200);
        expect(deleteGreetingRule).toHaveBeenCalledWith("rule-1");
    });
});

describe("Penunjukan editor", () => {
    it("GET/PUT editor 403 untuk karyawan biasa", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession({ employeeId: "ID-9" }));
        expect((await editorGET()).status).toBe(403);
        expect(
            (await editorPUT(jsonRequest("http://localhost/api/ga/greeting-settings/editor", { employeeId: "ID-9" }))).status
        ).toBe(403);
    });

    it("GET editor 200 untuk WIG002 beserta kandidat", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(getGreetingEditorInfo).mockResolvedValue({ employeeId: "ID-1", name: "Ani", isActive: true });
        vi.mocked(listGreetingEditorCandidates).mockResolvedValue([{ employeeId: "ID-1", name: "Ani" }]);

        const res = await editorGET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.editor.employeeId).toBe("ID-1");
        expect(json.data.options).toHaveLength(1);
    });

    it("PUT editor 200 menyimpan pilihan WIG002", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(updateGreetingEditor).mockResolvedValue("ID-1");
        vi.mocked(getGreetingEditorInfo).mockResolvedValue({ employeeId: "ID-1", name: "Ani", isActive: true });

        const res = await editorPUT(
            jsonRequest("http://localhost/api/ga/greeting-settings/editor", { employeeId: "ID-1" })
        );
        expect(res.status).toBe(200);
        expect(updateGreetingEditor).toHaveBeenCalledWith("ID-1", expect.any(String));
    });
});

describe("Endpoint karyawan", () => {
    it("403 bila sesi tidak punya employeeId", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        expect((await employeeGET()).status).toBe(403);
    });

    it("200 mengembalikan aturan aktif, quotes disetujui, dan flag editor", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession({ employeeId: "ID-9" }));
        vi.mocked(isGreetingEditor).mockResolvedValue(true);

        const res = await employeeGET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.canEditGreeting).toBe(true);
        expect(json.data.rules[0].greeting).toBe("Selamat Pagi!");
        expect(json.data.quotes).toHaveLength(1);
        expect(json.data.quotes[0].authorName).toBe("Daffa Fakhuddin");
        expect(res.headers.get("cache-control")).toBe("no-store");
    });
});

describe("Kurasi quotes karyawan (WIG001, WIG002, editor)", () => {
    const quoteParams = { params: Promise.resolve({ id: "q-1" }) };

    it("GET quotes 401 tanpa sesi dan 403 untuk karyawan biasa", async () => {
        vi.mocked(requireAuth).mockResolvedValue(null);
        expect((await quotesGET(new NextRequest("http://localhost/api/ga/greeting-settings/quotes"))).status).toBe(401);

        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession({ employeeId: "ID-9" }));
        vi.mocked(canManageGreeting).mockResolvedValue(false);
        expect((await quotesGET(new NextRequest("http://localhost/api/ga/greeting-settings/quotes"))).status).toBe(403);
    });

    it("GET quotes 200 meneruskan filter ke service dengan Cache-Control private, no-store", async () => {
        vi.mocked(requireAuth).mockResolvedValue({
            ...makeWig002Session(),
            username: "WIG001",
            permissions: ["hr.manage", "ga.manage"],
        });
        vi.mocked(canManageGreeting).mockResolvedValue(true);
        vi.mocked(listEmployeeGreetingQuotes).mockResolvedValue({
            items: [],
            counts: { ALL: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 },
            pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
        });

        const res = await quotesGET(
            new NextRequest("http://localhost/api/ga/greeting-settings/quotes?status=PENDING&slot=PAGI&search=daffa&page=2")
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("private, no-store");
        expect(listEmployeeGreetingQuotes).toHaveBeenCalledWith({
            status: "PENDING",
            slot: "PAGI",
            search: "daffa",
            page: 2,
            limit: 15,
        });
    });

    it("PATCH/DELETE quotes menegakkan akses, validasi body, dan 404 P2025", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession({ employeeId: "ID-9" }));
        vi.mocked(canManageGreeting).mockResolvedValue(false);
        expect(
            (
                await quotePATCH(
                    jsonRequest("http://localhost/api/ga/greeting-settings/quotes/q-1", {
                        quote: "Semangat!",
                        slot: "PAGI",
                        status: "APPROVED",
                    }, "PATCH"),
                    quoteParams
                )
            ).status
        ).toBe(403);

        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(canManageGreeting).mockResolvedValue(true);
        expect(
            (
                await quotePATCH(
                    jsonRequest("http://localhost/api/ga/greeting-settings/quotes/q-1", {
                        quote: "",
                        slot: "PAGI",
                        status: "APPROVED",
                    }, "PATCH"),
                    quoteParams
                )
            ).status
        ).toBe(400);

        vi.mocked(updateEmployeeGreetingQuote).mockRejectedValueOnce(
            new AppSettingsError("Quotes karyawan tidak ditemukan.", 404)
        );
        expect(
            (
                await quotePATCH(
                    jsonRequest("http://localhost/api/ga/greeting-settings/quotes/q-1", {
                        quote: "Semangat!",
                        greeting: "Good Morning",
                        authorName: "Daffa Fakhuddin",
                        slot: "PAGI",
                        status: "APPROVED",
                    }, "PATCH"),
                    quoteParams
                )
            ).status
        ).toBe(404);

        vi.mocked(deleteEmployeeGreetingQuote).mockResolvedValueOnce(undefined);
        const delRes = await quoteDELETE(
            new NextRequest("http://localhost/api/ga/greeting-settings/quotes/q-1", { method: "DELETE" }),
            quoteParams
        );
        expect(delRes.status).toBe(200);
        expect(deleteEmployeeGreetingQuote).toHaveBeenCalledWith("q-1");
    });

    it("GET/PUT editor tetap 403 untuk WIG001 (penunjukan editor khusus WIG002)", async () => {
        vi.mocked(requireAuth).mockResolvedValue({
            ...makeWig002Session(),
            username: "WIG001",
            permissions: ["hr.manage", "ga.manage"],
        });
        expect((await editorGET()).status).toBe(403);
        expect(
            (await editorPUT(jsonRequest("http://localhost/api/ga/greeting-settings/editor", { employeeId: "ID-1" }))).status
        ).toBe(403);
    });
});
