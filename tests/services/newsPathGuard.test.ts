import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Guard murni: jangan sentuh database.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { assertInsidePublicUploads } from "@/lib/services/newsService";

const PUBLIC_UPLOADS = path.resolve(process.cwd(), "public", "uploads");

describe("assertInsidePublicUploads", () => {
    it("menerima path media berita normal di dalam public/uploads", () => {
        expect(assertInsidePublicUploads("/uploads/news/foto-rapat.jpg")).toBe(
            path.join(PUBLIC_UPLOADS, "news", "foto-rapat.jpg"),
        );
    });

    it("menerima path dengan segmen .. yang tetap di dalam uploads", () => {
        expect(assertInsidePublicUploads("/uploads/news/sub/../foto.jpg")).toBe(
            path.join(PUBLIC_UPLOADS, "news", "foto.jpg"),
        );
    });

    it("menolak traversal yang keluar dari public/uploads", () => {
        expect(() => assertInsidePublicUploads("../../.env")).toThrow("Lokasi media berita tidak valid.");
        expect(() => assertInsidePublicUploads("/uploads/news/../../.env")).toThrow("Lokasi media berita tidak valid.");
        expect(() => assertInsidePublicUploads("/etc/passwd")).toThrow("Lokasi media berita tidak valid.");
        expect(() => assertInsidePublicUploads("")).toThrow("Lokasi media berita tidak valid.");
    });
});
