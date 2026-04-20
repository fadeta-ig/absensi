import { describe, it, expect, beforeAll } from "vitest";
import { fetchWithAuth, getAuthCookie } from "../utils/apiTestHelper";

describe("Master Data API Endpoints", () => {
    let hrCookie: string;

    beforeAll(async () => {
        hrCookie = await getAuthCookie("hr");
    });

    describe("Divisions API (/api/master/divisions)", () => {
        let divisionId: string;

        it("should create a new division", async () => {
            const res = await fetchWithAuth("/master/divisions", hrCookie, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: `Testing Division ${Date.now()}`, isActive: true }),
            });
            const data = await res.json();
            
            expect(res.status).toBe(201);
            expect(data.name).toMatch(/Testing Division/);
            divisionId = data.id;
        });

        it("should fetch divisions", async () => {
            const res = await fetchWithAuth("/master/divisions", hrCookie, { method: "GET" });
            const data = await res.json();
            
            expect(res.status).toBe(200);
            expect(data).toBeInstanceOf(Array);
        });

        it("should require authorization", async () => {
            const res = await fetchWithAuth("/master/divisions", "", { method: "GET" });
            expect(res.status).toBe(401);
        });
    });

    describe("Departments API (/api/master/departments)", () => {
        it("should fetch departments", async () => {
            const res = await fetchWithAuth("/master/departments", hrCookie, { method: "GET" });
            const data = await res.json();
            
            expect(res.status).toBe(200);
            expect(data).toBeInstanceOf(Array);
        });
    });

    describe("Positions API (/api/master/positions)", () => {
        it("should fetch positions", async () => {
            const res = await fetchWithAuth("/master/positions", hrCookie, { method: "GET" });
            const data = await res.json();
            
            expect(res.status).toBe(200);
            expect(data).toBeInstanceOf(Array);
        });
    });

    describe("Locations API (/api/master/locations)", () => {
        it("should fetch locations", async () => {
            const res = await fetchWithAuth("/master/locations", hrCookie, { method: "GET" });
            expect(res.status).toBe(200);
        });
    });
});
