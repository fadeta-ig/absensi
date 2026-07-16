import { beforeAll, describe, expect, it } from "vitest";
import { fetchWithAuth, getAuthCookie } from "../utils/apiTestHelper";

describe("User Management API RBAC", () => {
    let superAdminCookie = "";
    let gaAdminCookie = "";

    beforeAll(async () => {
        superAdminCookie = await getAuthCookie("hr");
        gaAdminCookie = await getAuthCookie("ga");
    });

    it("allows the super admin to list separated admin users", async () => {
        const response = await fetchWithAuth("/users", superAdminCookie);
        const data = await response.json() as {
            users: { username: string; employeeId: string | null; roles: { code: string }[] }[];
            eligibleEmployees: unknown[];
        };
        expect(response.status).toBe(200);
        expect(data.users).toEqual(expect.arrayContaining([
            expect.objectContaining({
                username: "WIG001",
                employeeId: null,
                roles: expect.arrayContaining([expect.objectContaining({ code: "SUPER_ADMIN" })]),
            }),
            expect.objectContaining({
                username: "WIG002",
                employeeId: null,
                roles: expect.arrayContaining([expect.objectContaining({ code: "GA_ADMIN" })]),
            }),
        ]));
        expect(Array.isArray(data.eligibleEmployees)).toBe(true);
    });

    it("denies user management to GA admin", async () => {
        const response = await fetchWithAuth("/users", gaAdminCookie);
        expect(response.status).toBe(403);
    });
});
