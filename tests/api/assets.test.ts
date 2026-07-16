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
            const suffix = Date.now().toString().slice(-4);
            const categoryRes = await fetchWithAuth("/assets/categories", gaCookie, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: `Test Category ${suffix}`, prefix: `T${suffix}` }),
            });
            const category = await categoryRes.json() as { id: string };
            expect(categoryRes.status).toBe(201);

            const body = {
                name: "Test Laptop",
                categoryId: category.id,
                kondisi: "BAIK",
                holderType: "GA_POOL"
            };

            const res = await fetchWithAuth("/assets", gaCookie, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            expect(res.status).toBe(201);
            const created = await res.json() as { id: string };
            const cleanup = await fetchWithAuth(`/assets/${created.id}`, gaCookie, { method: "DELETE" });
            expect(cleanup.status).toBe(200);
            const categoryCleanup = await fetchWithAuth(`/assets/categories/${category.id}`, gaCookie, { method: "DELETE" });
            expect(categoryCleanup.status).toBe(200);
        }, 15_000);
    });
});
