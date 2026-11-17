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
    deleteGreetingRule: vi.fn(),
    getGreetingEditorInfo: vi.fn(),
    isGreetingEditor: vi.fn(),
    isWig002Session: (session: { username: string; permissions: string[] }) =>
        session.username === "WIG002" && session.permissions.includes("ga.manage"),
    listActiveGreetingRules: vi.fn(),
    listGreetingEditorCandidates: vi.fn(),
    listGreetingRules: vi.fn(),
    updateGreetingEditor: vi.fn(),
    updateGreetingRule: vi.fn(),
}));

import { requireAuth } from "@/lib/middleware/apiGuard";
import {
    canManageGreeting,
    createGreetingRule,
    deleteGreetingRule,
    getGreetingEditorInfo,
    isGreetingEditor,
    listActiveGreetingRules,
    listGreetingEditorCandidates,
    listGreetingRules,
    updateGreetingEditor,
    updateGreetingRule,
} from "@/lib/services/greetingSettingsService";
import type { GreetingRuleInput, GreetingRuleLike, GreetingRuleView } from "@/lib/greeting";
import { GET as rulesGET, POST as rulesPOST } from "@/app/api/ga/greeting-settings/route";
import { PUT as rulePUT, DELETE as ruleDELETE } from "@/app/api/ga/greeting-settings/[id]/route";
import { GET as editorGET, PUT as editorPUT } from "@/app/api/ga/greeting-settings/editor/route";
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

    it("200 mengembalikan aturan aktif dan flag editor", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession({ employeeId: "ID-9" }));
        vi.mocked(isGreetingEditor).mockResolvedValue(true);

        const res = await employeeGET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.canEditGreeting).toBe(true);
        expect(json.data.rules[0].greeting).toBe("Selamat Pagi!");
        expect(res.headers.get("cache-control")).toBe("no-store");
    });
});
