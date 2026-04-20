import { describe, it, expect, beforeAll } from "vitest";
import { fetchWithAuth, API_BASE_URL } from "../utils/apiTestHelper";

describe("Auth API Endpoints", () => {
    let hrCookie: string;

    beforeAll(async () => {
        const resLogin = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeId: "WIG001", password: "123" }),
        });
        const setCookie = resLogin.headers.get("set-cookie");
        if (setCookie) {
            const match = setCookie.match(/session=([^;]+)/);
            if (match) hrCookie = `session=${match[1]}`;
        }
    });

    describe("POST /api/auth/login", () => {
        it("should successfully log in HR Admin and return session cookie", async () => {
            const res = await fetch(`${API_BASE_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId: "WIG001", password: "123" }),
            });
            const data = await res.json();
            
            expect(res.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.role).toBe("hr");
            expect(res.headers.get("set-cookie")).toContain("session=");
        });

        it("should reject invalid credentials", async () => {
            const res = await fetch(`${API_BASE_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId: "WIG001", password: "wrong_password" }),
            });
            expect([401, 429]).toContain(res.status);
            // Typically 400 or 401. Zod errors are 400.
        });
    });

    describe("GET /api/auth/me", () => {
        it("should get details of currently logged in user", async () => {
            const res = await fetchWithAuth("/auth/me", hrCookie, { method: "GET" });
            const data = await res.json();
            expect(res.status).toBe(200);
            expect(data.employeeId).toBe("WIG001");
        });

        it("should return 401 if not logged in", async () => {
            const res = await fetchWithAuth("/auth/me", "", { method: "GET" });
            expect(res.status).toBe(401);
        });
    });
});
