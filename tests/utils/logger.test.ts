import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import winston from "winston";

describe("logger & serializeError", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("serializes Error instances, extra properties, Dates, and circular references safely", async () => {
        const { serializeError } = await import("@/lib/logger");

        const cause = new Error("Root cause");
        const err = Object.assign(new Error("Database failure"), {
            code: "P2002",
            status: 409,
            clientVersion: "6.19.2",
            meta: { target: ["nip"], occurredAt: new Date("2026-11-14T00:00:00.000Z") },
            cause,
        });

        const serialized = serializeError(err);
        expect(serialized).toMatchObject({
            name: "Error",
            message: "Database failure",
            code: "P2002",
            status: 409,
            clientVersion: "6.19.2",
            meta: {
                target: ["nip"],
                occurredAt: "2026-11-14T00:00:00.000Z",
            },
            cause: {
                name: "Error",
                message: "Root cause",
            },
        });
        expect(typeof serialized.stack).toBe("string");

        const circular: Record<string, unknown> = { label: "node" };
        circular.self = circular;
        expect(serializeError(circular)).toEqual({
            label: "node",
            self: "[Circular]",
        });
    });

    it("uses Console transport only (no File transport) and outputs single-line non-ANSI JSON to stdout/stderr in production", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.resetModules();

        const stdoutChunks: string[] = [];
        const stderrChunks: string[] = [];

        const rawConsole = console as Console & {
            _stdout?: { write: (chunk: unknown) => boolean };
            _stderr?: { write: (chunk: unknown) => boolean };
        };

        if (rawConsole._stdout) {
            vi.spyOn(rawConsole._stdout, "write").mockImplementation((chunk: unknown) => {
                stdoutChunks.push(String(chunk));
                return true;
            });
        }
        if (rawConsole._stderr) {
            vi.spyOn(rawConsole._stderr, "write").mockImplementation((chunk: unknown) => {
                stderrChunks.push(String(chunk));
                return true;
            });
        }
        vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
            stdoutChunks.push(args.map(String).join(" "));
        });
        vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
            stderrChunks.push(args.map(String).join(" "));
        });

        const { default: prodLogger } = await import("@/lib/logger");

        expect(prodLogger.transports).toHaveLength(1);
        expect(prodLogger.transports[0]).toBeInstanceOf(winston.transports.Console);
        expect(prodLogger.transports.some((t) => t instanceof winston.transports.File)).toBe(false);

        prodLogger.info("Cron job finished", { job: "daily-recap", count: 3 });
        prodLogger.error("Task notification failed", {
            err: new Error("SMTP timeout"),
            context: "MeetingTask",
        });

        expect(stdoutChunks).toHaveLength(1);
        expect(stderrChunks).toHaveLength(1);

        const infoLine = stdoutChunks[0].trim();
        const errorLine = stderrChunks[0].trim();

        expect(infoLine).not.toContain("\u001b[");
        expect(errorLine).not.toContain("\u001b[");

        const parsedInfo = JSON.parse(infoLine) as Record<string, unknown>;
        expect(parsedInfo).toMatchObject({
            level: "info",
            message: "Cron job finished",
            service: "wits",
            job: "daily-recap",
            count: 3,
        });

        const parsedError = JSON.parse(errorLine) as Record<string, unknown>;
        expect(parsedError).toMatchObject({
            level: "error",
            message: "Task notification failed",
            service: "wits",
            context: "MeetingTask",
            err: {
                name: "Error",
                message: "SMTP timeout",
            },
        });
        expect(typeof (parsedError.err as Record<string, unknown>).stack).toBe("string");
        expect(fs.existsSync(path.resolve(process.cwd(), "logs"))).toBe(false);
    });

    it("routes serverErrorResponse through logger.error to stderr as structured JSON without creating /logs/", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.resetModules();

        const stderrChunks: string[] = [];
        const rawConsole = console as Console & {
            _stderr?: { write: (chunk: unknown) => boolean };
        };
        if (rawConsole._stderr) {
            vi.spyOn(rawConsole._stderr, "write").mockImplementation((chunk: unknown) => {
                stderrChunks.push(String(chunk));
                return true;
            });
        }
        vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
            stderrChunks.push(args.map(String).join(" "));
        });

        const { serverErrorResponse } = await import("@/lib/middleware/apiGuard");
        const res = serverErrorResponse("TestEndpointGET", new Error("Query timeout"), {
            employeeId: "EMP001",
        });

        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body).toEqual({
            error: "Terjadi kesalahan pada server. Silakan coba lagi.",
        });

        expect(stderrChunks).toHaveLength(1);
        const errorLine = stderrChunks[0].trim();
        expect(errorLine).not.toContain("\u001b[");
        const parsed = JSON.parse(errorLine) as Record<string, unknown>;
        expect(parsed).toMatchObject({
            level: "error",
            message: "[TestEndpointGET] Server error",
            service: "wits",
            employeeId: "EMP001",
            error: {
                name: "Error",
                message: "Query timeout",
            },
        });
        expect(fs.existsSync(path.resolve(process.cwd(), "logs"))).toBe(false);
    });

    it("forwards POST /api/logs/client and /api/cron/* events to structured stdout/stderr in production", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("CRON_SECRET", "test-cron-secret-value");
        vi.resetModules();

        const stdoutChunks: string[] = [];
        const stderrChunks: string[] = [];

        const rawConsole = console as Console & {
            _stdout?: { write: (chunk: unknown) => boolean };
            _stderr?: { write: (chunk: unknown) => boolean };
        };
        if (rawConsole._stdout) {
            vi.spyOn(rawConsole._stdout, "write").mockImplementation((chunk: unknown) => {
                stdoutChunks.push(String(chunk));
                return true;
            });
        }
        if (rawConsole._stderr) {
            vi.spyOn(rawConsole._stderr, "write").mockImplementation((chunk: unknown) => {
                stderrChunks.push(String(chunk));
                return true;
            });
        }
        vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
            stdoutChunks.push(args.map(String).join(" "));
        });
        vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
            stderrChunks.push(args.map(String).join(" "));
        });

        vi.doMock("@/lib/auth", () => ({
            getActiveSession: vi.fn().mockResolvedValue({
                userId: "usr-1",
                username: "WIG001",
                role: "SUPER_ADMIN",
                roles: ["SUPER_ADMIN"],
                permissions: ["hr.manage"],
                sessionVersion: 1,
            }),
        }));

        const { POST: clientLogPost } = await import("@/app/api/logs/client/route");
        const clientReq = new Request("http://localhost:3000/api/logs/client", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-forwarded-for": "127.0.0.1",
            },
            body: JSON.stringify({
                level: "error",
                module: "DashboardBirthdays",
                message: "Failed to fetch auxiliary birthday data",
                data: { error: { name: "Error", message: "Network error" } },
                timestamp: "2026-11-14 15:40:00.000",
            }),
        });

        const clientRes = await clientLogPost(clientReq as never);
        expect(clientRes.status).toBe(200);
        expect(stderrChunks).toHaveLength(1);
        const clientErrJson = JSON.parse(stderrChunks[0].trim()) as Record<string, unknown>;
        expect(clientErrJson).toMatchObject({
            level: "error",
            message: "[CLIENT] Failed to fetch auxiliary birthday data",
            source: "client-browser",
            module: "DashboardBirthdays",
            username: "WIG001",
        });

        const { POST: dailyRecapPost } = await import("@/app/api/cron/daily-recap/route");
        const cronReq = new Request("http://localhost:3000/api/cron/daily-recap", {
            method: "POST",
            headers: {
                authorization: "Bearer invalid-secret",
            },
        });
        const cronRes = await dailyRecapPost(cronReq as never);
        expect(cronRes.status).toBe(401);
        expect(stdoutChunks).toHaveLength(1);
        const cronWarnJson = JSON.parse(stdoutChunks[0].trim()) as Record<string, unknown>;
        expect(cronWarnJson).toMatchObject({
            level: "warn",
            message: "Unauthorized daily-recap cron attempt",
            service: "wits",
        });
        expect(fs.existsSync(path.resolve(process.cwd(), "logs"))).toBe(false);
    });
});
