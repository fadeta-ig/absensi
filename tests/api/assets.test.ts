import { describe, it, expect, beforeAll } from "vitest";
import { fetchWithAuth, getAuthCookie } from "../utils/apiTestHelper";

describe("Assets API Endpoints", () => {
    let gaCookie: string;

    beforeAll(async () => {
        gaCookie = await getAuthCookie("ga");
    });

    describe("GET /api/assets", () => {
        it("should fetch list of assets", async () => {
            const res = await fetchWithAuth("/assets", gaCookie, { method: "GET" });
            const data = await res.json();
            
            expect(res.status).toBe(200);
            expect(data).toBeDefined(); 
            // the endpoint probably returns { data: assets, meta: {...} } because index pages usually paginate
        });
    });

    describe("POST /api/assets", () => {
        it("should create a new asset", async () => {
            const body = {
                assetCode: `TEST-ASSET-${Date.now()}`,
                name: "Test Laptop",
                category: "LAPTOP",
                kondisi: "BAIK",
                status: "AVAILABLE",
                holderType: "GA_POOL"
            };

            const res = await fetchWithAuth("/assets", gaCookie, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            // If it returns 201 it means GA role is working!
            expect(res.status).toBe(201);
        });
    });
});
