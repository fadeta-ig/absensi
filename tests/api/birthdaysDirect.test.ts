import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock apiGuard authentication
const mockSession = {
    userId: "test-user-hr",
    username: "WIG001",
    displayName: "Admin HR",
    email: "hr@wig.co.id",
    roles: ["SUPER_ADMIN"],
    permissions: ["user.manage", "hr.manage", "ga.manage", "employee.self"],
};

vi.mock("@/lib/middleware/apiGuard", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/lib/middleware/apiGuard")>();
    return {
        ...original,
        requireAuth: vi.fn().mockImplementation(async () => mockSession),
    };
});

describe("Birthday Management API Handlers (Direct)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("GET /api/birthdays returns overview data for HR", async () => {
        const { GET } = await import("@/app/api/birthdays/route");

        const req = new NextRequest("http://localhost:3000/api/birthdays?month=9&year=2026");
        const res = await GET(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.data).toHaveProperty("currentMonth");
        expect(json.data).toHaveProperty("upcoming");
        expect(json.data).toHaveProperty("summary");
    });

    it("GET & POST /api/birthdays/statuses handles status management", async () => {
        const { GET, POST } = await import("@/app/api/birthdays/statuses/route");

        // 1. GET
        const resGet = await GET();
        const jsonGet = await resGet.json();
        expect(resGet.status).toBe(200);
        expect(jsonGet.success).toBe(true);
        expect(Array.isArray(jsonGet.data)).toBe(true);

        // 2. POST new status
        const uniqueName = `Hadiah Khusus ${Date.now()}`;
        const reqPost = new NextRequest("http://localhost:3000/api/birthdays/statuses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: uniqueName,
                color: "#ec4899",
                order: 10,
            }),
        });

        const resPost = await POST(reqPost);
        const jsonPost = await resPost.json();
        expect(resPost.status).toBe(200);
        expect(jsonPost.success).toBe(true);
        expect(jsonPost.data.name).toBe(uniqueName);
    });

    it("PUT /api/birthdays/preparation saves preparation status and notes", async () => {
        const { PUT } = await import("@/app/api/birthdays/preparation/route");

        const req = new NextRequest("http://localhost:3000/api/birthdays/preparation", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                employeeId: "ID25999999",
                year: 2026,
                statusId: "status-kue-dipesan",
                notes: "Kue dipesan di bakery A",
            }),
        });

        const res = await PUT(req);
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.data.employeeId).toBe("ID25999999");
        expect(json.data.notes).toBe("Kue dipesan di bakery A");
    });

    it("GET & PUT /api/birthdays/settings updates email reminder settings", async () => {
        const { GET, PUT } = await import("@/app/api/birthdays/settings/route");

        const reqPut = new NextRequest("http://localhost:3000/api/birthdays/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                isEmailEnabled: true,
                recipientEmails: "admin@wig.co.id, hr@wig.co.id",
                reminderDays: "30,14,7",
            }),
        });

        const resPut = await PUT(reqPut);
        const jsonPut = await resPut.json();
        expect(resPut.status).toBe(200);
        expect(jsonPut.success).toBe(true);
        expect(jsonPut.data.isEmailEnabled).toBe(true);

        const resGet = await GET();
        const jsonGet = await resGet.json();
        expect(resGet.status).toBe(200);
        expect(jsonGet.success).toBe(true);
        expect(jsonGet.data.recipientEmails).toBe("admin@wig.co.id, hr@wig.co.id");
    });
});
