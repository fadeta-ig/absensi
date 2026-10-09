import { describe, expect, it } from "vitest";
import { stripGelar } from "@/lib/utils/formatters";

describe("stripGelar", () => {
    it("menghapus gelar depan dan belakang", () => {
        expect(stripGelar("Ir. Anang Siswanto, ST.,MT.,IPM., ASEAN ENG.")).toBe("Anang Siswanto");
        expect(stripGelar("Prof. Dr. Siti Rahayu, M.M., CFRM")).toBe("Siti Rahayu");
        expect(stripGelar("H. Budi Santoso, S.E.")).toBe("Budi Santoso");
        expect(stripGelar("Drs. Agus Wijaya")).toBe("Agus Wijaya");
    });
    it("mempertahankan inisial depan yang bukan gelar", () => {
        expect(stripGelar("A. Yani, S.H.")).toBe("A. Yani");
    });
    it("membatalkan stripping bila segmen koma bukan gelar", () => {
        expect(stripGelar("Budi, Anak Pak RT")).toBe("Budi, Anak Pak RT");
        expect(stripGelar("Budi, Sari")).toBe("Budi, Sari");
    });
    it("nama polos dan input kosong aman", () => {
        expect(stripGelar("Sari")).toBe("Sari");
        expect(stripGelar(null)).toBe("");
        expect(stripGelar("")).toBe("");
    });
});
