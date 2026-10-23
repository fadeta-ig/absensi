import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        notificationRead: { findMany: vi.fn(), createMany: vi.fn() },
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

import { prisma } from "@/lib/prisma";
import { getReadKeys, isValidNotificationKey, markNotificationsRead } from "@/lib/services/notificationReadService";

const mocked = vi.mocked(prisma, true);

beforeEach(() => {
    vi.resetAllMocks();
});

describe("isValidNotificationKey", () => {
    it("menerima prefix yang dikenal", () => {
        expect(isValidNotificationKey("leave-abc")).toBe(true);
        expect(isValidNotificationKey("appointment-invite-xyz")).toBe(true);
        expect(isValidNotificationKey("meeting-task-ext-req-1")).toBe(true);
    });
    it("menolak key asing, kosong, dan terlalu panjang", () => {
        expect(isValidNotificationKey("xss-<img>")).toBe(false);
        expect(isValidNotificationKey("")).toBe(false);
        expect(isValidNotificationKey("a".repeat(192))).toBe(false);
        expect(isValidNotificationKey(123 as never)).toBe(false);
    });
});

describe("getReadKeys", () => {
    it("mengembalikan Set key yang sudah dibaca", async () => {
        mocked.notificationRead.findMany.mockResolvedValue([{ key: "leave-a" }, { key: "news-b" }] as never);
        const out = await getReadKeys("u-1", ["leave-a", "leave-c", "evil-<x>"]);
        expect([...out]).toEqual(["leave-a", "news-b"]);
        expect(mocked.notificationRead.findMany).toHaveBeenCalledWith({
            where: { userId: "u-1", key: { in: ["leave-a", "leave-c"] } },
            select: { key: true },
        });
    });

    it("tanpa key valid tidak query", async () => {
        const out = await getReadKeys("u-1", ["<img>"]);
        expect(out.size).toBe(0);
        expect(mocked.notificationRead.findMany).not.toHaveBeenCalled();
    });
});

describe("markNotificationsRead", () => {
    it("menyimpan batch idempoten dan membatasi 200", async () => {
        mocked.notificationRead.createMany.mockResolvedValue({ count: 2 } as never);
        const ids = ["leave-1", "leave-1", "meeting-task-t2", "junk-<b>"];
        const out = await markNotificationsRead("u-1", ids);
        expect(out).toEqual({ marked: 2 });
        expect(mocked.notificationRead.createMany).toHaveBeenCalledWith({
            data: [
                { userId: "u-1", key: "leave-1" },
                { userId: "u-1", key: "meeting-task-t2" },
            ],
            skipDuplicates: true,
        });
    });

    it("tanpa key valid tidak menulis", async () => {
        const out = await markNotificationsRead("u-1", []);
        expect(out).toEqual({ marked: 0 });
        expect(mocked.notificationRead.createMany).not.toHaveBeenCalled();
    });
});
