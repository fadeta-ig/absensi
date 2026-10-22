import { describe, it, expect, beforeAll } from "vitest";
import { fetchWithAuth, getAuthCookie } from "../utils/apiTestHelper";

/**
 * HTTP integration tests untuk modul appointments (E-Meeting).
 * WAJIB: jalankan `npm run dev` di terminal lain (port 3000) + `npm run db:seed:dev` sebelumnya.
 */
describe("Appointments API Endpoints", () => {
    let gaCookie: string;

    beforeAll(async () => {
        gaCookie = await getAuthCookie("ga");
    });

    describe("GET /api/appointments", () => {
        it("tanpa sesi ditolak 401", async () => {
            const res = await fetch("http://localhost:3000/api/appointments");
            expect(res.status).toBe(401);
        });

        it("WIG002 melihat daftar + envelope success", async () => {
            const res = await fetchWithAuth("/appointments?limit=5", gaCookie, { method: "GET" });
            const json = await res.json();
            expect(res.status).toBe(200);
            expect(json.success).toBe(true);
            expect(Array.isArray(json.data)).toBe(true);
            expect(typeof json.total).toBe("number");
        });
    });

    describe("POST /api/appointments", () => {
        it("tanpa ruangan ditolak 400", async () => {
            const res = await fetchWithAuth("/appointments", gaCookie, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "Tanpa ruangan", date: "2026-12-10", startTime: "10:00", endTime: "11:00" }),
            });
            expect(res.status).toBe(400);
        });

        it("tanpa sesi ditolak 401", async () => {
            const res = await fetch("http://localhost:3000/api/appointments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "X", date: "2026-12-10", startTime: "10:00", endTime: "11:00", roomId: "r1" }),
            });
            expect(res.status).toBe(401);
        });
    });

    describe("GET /api/appointments/rooms", () => {
        it("tanpa sesi ditolak 401", async () => {
            const res = await fetch("http://localhost:3000/api/appointments/rooms");
            expect(res.status).toBe(401);
        });

        it("WIG002 melihat ruangan aktif + envelope success", async () => {
            const res = await fetchWithAuth("/appointments/rooms", gaCookie, { method: "GET" });
            const json = await res.json();
            expect(res.status).toBe(200);
            expect(json.success).toBe(true);
            expect(Array.isArray(json.data)).toBe(true);
        });
    });

    describe("POST /api/appointments/[id]/invite-response", () => {
        it("tanpa sesi ditolak 401", async () => {
            const res = await fetch("http://localhost:3000/api/appointments/no-id/invite-response", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "ACCEPT" }),
            });
            expect(res.status).toBe(401);
        });
    });
});
