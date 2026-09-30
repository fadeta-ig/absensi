import { describe, expect, it } from "vitest";
import { avatarUrlSchema } from "@/lib/validations/validationSchemas";

// Skema avatar diuji murni (tanpa handler/DB): handler PUT memakai skema
// yang sama via profileUpdateSchema, dan sanitize tidak mengubah nilainya.
describe("avatarUrlSchema", () => {
    it("menerima URL https:// normal", () => {
        expect(avatarUrlSchema.safeParse("https://cdn.contoh.id/avatar/karyawan-1.png").success).toBe(true);
    });

    it("menerima gambar base64 jpeg/png/webp", () => {
        const payload = Buffer.from("contoh-bytes-gambar").toString("base64");
        for (const mime of ["jpeg", "png", "webp"] as const) {
            expect(avatarUrlSchema.safeParse(`data:image/${mime};base64,${payload}`).success).toBe(true);
        }
    });

    it("menolak javascript:, data:text/html, svg, http://, dan string kosong", () => {
        const payload = Buffer.from("contoh-bytes-gambar").toString("base64");
        const rejected = [
            "javascript:alert(1)",
            `data:text/html;base64,${payload}`,
            `data:image/svg+xml;base64,${payload}`,
            "http://cdn.contoh.id/avatar.png",
            "",
        ];
        for (const avatarUrl of rejected) {
            expect(avatarUrlSchema.safeParse(avatarUrl).success).toBe(false);
        }
    });

    it("menolak URL https:// lebih dari 1000 karakter dan base64 raksasa", () => {
        const longHttps = `https://cdn.contoh.id/${"a".repeat(1000)}.png`;
        expect(longHttps.length).toBeGreaterThan(1000);
        expect(avatarUrlSchema.safeParse(longHttps).success).toBe(false);
        expect(avatarUrlSchema.safeParse(`data:image/png;base64,${"A".repeat(2_800_000)}`).success).toBe(false);
    });
});
