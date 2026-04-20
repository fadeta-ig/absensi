import { describe, it, expect, beforeAll } from "vitest";
import { fetchWithAuth, getAuthCookie } from "../utils/apiTestHelper";

describe("Attendance API Endpoints", () => {
    let hrCookie: string;

    beforeAll(async () => {
        hrCookie = await getAuthCookie("hr");
    });

    describe("GET /api/attendance", () => {
        it("should fetch list of attendances", async () => {
            const res = await fetchWithAuth("/attendance", hrCookie, { method: "GET" });
            const data = await res.json();
            
            expect(res.status).toBe(200);
            expect(data).toBeDefined();
        });
    });
});
