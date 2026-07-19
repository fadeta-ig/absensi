import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
import { env } from "@/lib/env";

const ENCRYPTION_PREFIX = "enc:v1";

function keyMaterial(): Buffer {
    const source = env.PII_ENCRYPTION_KEY ?? env.JWT_SECRET;
    return createHash("sha256").update(`hris-pii-encryption:v1:${source}`).digest();
}

export function encryptPii(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    if (!normalized) return null;

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
    const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [ENCRYPTION_PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptPii(value: string | null | undefined): string | null {
    if (!value) return null;
    if (!value.startsWith(`${ENCRYPTION_PREFIX}:`)) return value;

    const parts = value.split(":");
    if (parts.length !== 5) throw new Error("Format data privat tidak valid.");

    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const encrypted = Buffer.from(parts[4], "base64url");
    const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function hashPii(value: string | null | undefined): string | null {
    const normalized = value?.trim().replace(/\s+/g, "").toUpperCase();
    if (!normalized) return null;
    return createHmac("sha256", keyMaterial()).update(normalized).digest("hex");
}

export function maskPii(value: string | null | undefined, visibleSuffix = 4): string | null {
    if (!value) return null;
    if (value.length <= visibleSuffix) return "*".repeat(value.length);
    return `${"*".repeat(Math.min(12, value.length - visibleSuffix))}${value.slice(-visibleSuffix)}`;
}

export function normalizeEmployeeId(value: string): string {
    return value.trim().replace(/[\s-]+/g, "").toUpperCase();
}
