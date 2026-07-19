import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "test-jwt-secret-at-least-sixteen", PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough" } }));
import { decryptPii, encryptPii, hashPii, maskPii, normalizeEmployeeId } from "@/lib/security/pii";

describe("PII security helpers", () => {
    it("encrypts with authenticated encryption and decrypts losslessly", () => {
        const value = "0012345678901234";
        const first = encryptPii(value);
        const second = encryptPii(value);
        expect(first).toMatch(/^enc:v1:/);
        expect(second).not.toBe(first);
        expect(first).not.toContain(value);
        expect(decryptPii(first)).toBe(value);
        expect(decryptPii(second)).toBe(value);
    });

    it("creates stable keyed hashes without losing leading zeroes", () => {
        expect(hashPii(" 0012 3456 ")).toBe(hashPii("00123456"));
        expect(hashPii("00123456")).not.toBe(hashPii("123456"));
    });

    it("masks sensitive values and normalizes NIP formatting", () => {
        expect(maskPii("0012345678901234")).toBe("************1234");
        expect(normalizeEmployeeId(" id-2502 0044 ")).toBe("ID25020044");
    });
});
