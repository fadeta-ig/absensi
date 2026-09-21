import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";

const joseMocks = vi.hoisted(() => ({ jwtVerify: vi.fn() }));
vi.mock("jose", () => ({ jwtVerify: joseMocks.jwtVerify }));

import { proxy } from "@/proxy";

function request(path: string, withCookie = true) {
    return new NextRequest(`https://example.test${path}`, {
        headers: withCookie ? { cookie: "session=test-token" } : undefined,
    });
}

function payload(overrides: Record<string, unknown> = {}) {
    return {
        userId: CLEANING_IDS.workerUser,
        username: "CLEANING_TEST_WORKER",
        employeeId: null,
        name: "Cleaning Test Worker",
        roles: [SYSTEM_ROLES.CLEANING_WORKER],
        permissions: [PERMISSIONS.CLEANING_EXECUTE],
        ...overrides,
    };
}

import { CLEANING_IDS } from "../fixtures/cleaning";

describe("cleaning proxy authorization", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        process.env.JWT_SECRET = "test-secret-at-least-sixteen-characters";
    });

    it("AC-8 redirects an unauthenticated cleaning request to login with its path", async () => {
        const result = await proxy(request("/cleaning", false));

        expect(result.status).toBe(307);
        expect(result.headers.get("location")).toBe("https://example.test/?redirect=%2Fcleaning");
    });

    it("AC-8 allows cleaning.execute through the worker surface", async () => {
        joseMocks.jwtVerify.mockResolvedValue({ payload: payload() });

        const result = await proxy(request("/cleaning"));

        expect(result.status).toBe(200);
        expect(result.headers.get("location")).toBeNull();
    });

    it("AC-8 redirects a valid user without cleaning.execute to their own portal", async () => {
        joseMocks.jwtVerify.mockResolvedValue({
            payload: payload({
                employeeId: "employee-test",
                permissions: [PERMISSIONS.EMPLOYEE_SELF],
            }),
        });

        const result = await proxy(request("/cleaning"));

        expect(result.status).toBe(307);
        expect(result.headers.get("location")).toBe("https://example.test/employee");
    });

    it("AC-8 rejects cleaning.execute without the Cleaning Worker role", async () => {
        joseMocks.jwtVerify.mockResolvedValue({ payload: payload({ roles: [] }) });

        const result = await proxy(request("/cleaning"));

        expect(result.status).toBe(307);
        expect(result.headers.get("location")).toBe("https://example.test/");
    });

    it("AC-8 redirects an authenticated cleaning worker from login to cleaning", async () => {
        joseMocks.jwtVerify.mockResolvedValue({ payload: payload() });

        const result = await proxy(request("/"));

        expect(result.status).toBe(307);
        expect(result.headers.get("location")).toBe("https://example.test/cleaning");
    });

    it("AC-8 rejects a tampered token as unauthenticated", async () => {
        joseMocks.jwtVerify.mockRejectedValue(new Error("invalid signature"));

        const result = await proxy(request("/cleaning"));

        expect(result.status).toBe(307);
        expect(result.headers.get("location")).toBe("https://example.test/?redirect=%2Fcleaning");
    });
});
