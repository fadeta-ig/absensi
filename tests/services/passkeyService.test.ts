import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        userAccount: { findUnique: vi.fn() },
        passkeyCredential: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            delete: vi.fn(),
            deleteMany: vi.fn(),
            update: vi.fn(),
        },
        passkeyChallenge: {
            create: vi.fn(),
            deleteMany: vi.fn(),
            findFirst: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
        },
        auditLog: { create: vi.fn() },
    },
}));

vi.mock("@simplewebauthn/server", () => ({
    generateRegistrationOptions: vi.fn(async () => ({ challenge: "server-challenge" })),
    generateAuthenticationOptions: vi.fn(async () => ({ challenge: "server-challenge" })),
    verifyRegistrationResponse: vi.fn(),
    verifyAuthenticationResponse: vi.fn(),
    isoBase64URL: {
        fromBuffer: vi.fn((b: Uint8Array) => `b64:${b.length}`),
        toBuffer: vi.fn((s: string) => new Uint8Array([s.length])),
    },
    isoUint8Array: {
        fromUTF8String: vi.fn((s: string) => new TextEncoder().encode(s)),
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

import { prisma } from "@/lib/prisma";
import {
    PasskeyError,
    getAuthenticationOptions,
    getRegistrationOptions,
    listCredentials,
    revokeAllForUser,
    revokeCredential,
    verifyAuthentication,
    verifyRegistration,
} from "@/lib/services/passkeyService";
import {
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
} from "@simplewebauthn/server";

const mocked = vi.mocked(prisma, true);

function empSession(over: Record<string, unknown> = {}) {
    return {
        userId: "u-1",
        username: "ID-001",
        name: "Pegawai",
        employeeId: "ID-001",
        ...over,
    } as never;
}

const actor = { userId: "u-1", username: "ID-001" };

beforeEach(() => {
    vi.resetAllMocks();
    mocked.auditLog.create.mockResolvedValue({} as never);
    mocked.passkeyChallenge.deleteMany.mockResolvedValue({ count: 0 } as never);
});

describe("PasskeyError", () => {
    it("membawa statusCode", () => {
        expect(new PasskeyError("x", 422).statusCode).toBe(422);
    });
});

describe("getRegistrationOptions", () => {
    it("tanpa userId ditolak 401", async () => {
        await expect(getRegistrationOptions(empSession({ userId: null }))).rejects.toMatchObject({ statusCode: 401 });
    });
});

describe("verifyRegistration", () => {
    it("tanpa challenge tersimpan = 400", async () => {
        mocked.passkeyChallenge.findFirst.mockResolvedValue(null);
        await expect(verifyRegistration(empSession(), { id: "x", rawId: "x", type: "public-key", response: {} } as never, null, actor)).rejects.toMatchObject({ statusCode: 400 });
    });
    it("perangkat duplikat = 409", async () => {
        mocked.passkeyChallenge.findFirst.mockResolvedValue({ id: "c1", challenge: "ch", expiresAt: new Date(Date.now() + 60000) } as never);
        mocked.passkeyChallenge.delete.mockResolvedValue({} as never);
        vi.mocked(verifyRegistrationResponse).mockResolvedValue({
            verified: true,
            registrationInfo: { credential: { id: "cred-1", publicKey: new Uint8Array([1]), counter: 0 }, credentialDeviceType: "singleDevice", credentialBackedUp: false },
        } as never);
        mocked.passkeyCredential.findUnique.mockResolvedValue({ id: "old" } as never);
        await expect(
            verifyRegistration(empSession(), { id: "x", rawId: "x", type: "public-key", response: {} } as never, null, actor)
        ).rejects.toMatchObject({ statusCode: 409 });
    });
});

describe("listCredentials & revoke", () => {
    it("tanpa userId ditolak 401", async () => {
        await expect(listCredentials(empSession({ userId: null }))).rejects.toMatchObject({ statusCode: 401 });
        await expect(revokeCredential(empSession({ userId: null }), "c1", actor)).rejects.toMatchObject({ statusCode: 401 });
    });
    it("revoke milik orang lain = 404", async () => {
        mocked.passkeyCredential.findUnique.mockResolvedValue({ id: "c1", userId: "u-2", label: null } as never);
        await expect(revokeCredential(empSession(), "c1", actor)).rejects.toMatchObject({ statusCode: 404 });
    });
    it("revokeAllForUser mengembalikan count", async () => {
        mocked.passkeyCredential.deleteMany.mockResolvedValue({ count: 2 } as never);
        await expect(revokeAllForUser("u-1")).resolves.toBe(2);
    });
});

describe("getAuthenticationOptions anti-enumerasi", () => {
    it("user tak ada tetap kembalikan opsi (tanpa challenge tersimpan)", async () => {
        mocked.userAccount.findUnique.mockResolvedValue(null);
        const out = await getAuthenticationOptions("ID-XXX", null);
        expect(out.hasPasskey).toBe(false);
        expect(mocked.passkeyChallenge.create).not.toHaveBeenCalled();
    });
    it("user tanpa passkey sama perlakuannya", async () => {
        mocked.userAccount.findUnique.mockResolvedValue({ id: "u-9", isActive: true, passkeyCredentials: [] } as never);
        const out = await getAuthenticationOptions("ID-009", null);
        expect(out.hasPasskey).toBe(false);
    });
    it("tanpa username: opsi discoverable + tantangan anonim", async () => {
        const { getAuthenticationOptions: getOpts } = await import("@/lib/services/passkeyService");
        mocked.passkeyChallenge.deleteMany.mockResolvedValue({ count: 0 } as never);
        mocked.passkeyChallenge.count.mockResolvedValue(0 as never);
        mocked.passkeyChallenge.create.mockResolvedValue({} as never);
        const out = await getOpts(null, "1.2.3.4");
        expect(out.hasPasskey).toBe(true);
        expect(mocked.passkeyChallenge.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ userId: null }) })
        );
        expect(mocked.userAccount.findUnique).not.toHaveBeenCalled();
    });
    it("spam challenge per IP dibatasi", async () => {
        const { getAuthenticationOptions: getOpts } = await import("@/lib/services/passkeyService");
        mocked.passkeyChallenge.deleteMany.mockResolvedValue({ count: 0 } as never);
        mocked.passkeyChallenge.count.mockResolvedValue(20 as never);
        await expect(getOpts(null, "9.9.9.9")).rejects.toMatchObject({ statusCode: 429 });
    });
});

describe("verifyAuthentication", () => {
    it("user tak dikenal = 401 generik", async () => {
        mocked.userAccount.findUnique.mockResolvedValue(null);
        mocked.passkeyChallenge.findFirst.mockResolvedValue(null);
        await expect(verifyAuthentication("ID-XXX", { id: "cred-1" } as never)).rejects.toMatchObject({ statusCode: 401 });
    });
    it("tanpa username: kredensial tak dikenal = 401", async () => {
        mocked.passkeyCredential.findUnique.mockResolvedValue(null);
        await expect(verifyAuthentication(null, { id: "cred-x" } as never)).rejects.toMatchObject({ statusCode: 401 });
    });
    it("tanpa username: userHandle konflik ditolak", async () => {
        mocked.passkeyCredential.findUnique.mockResolvedValue({
            credentialId: "cred-1",
            publicKey: "cA",
            counter: 1,
            transports: null,
            userId: "u-1",
            user: { id: "u-1", isActive: true },
        } as never);
        await expect(
            verifyAuthentication(null, { id: "cred-1", response: { userHandle: "dS0y" } } as never)
        ).rejects.toMatchObject({ statusCode: 401 });
    });
    it("tanpa username: sukses milik benar", async () => {
        const { isoBase64URL, isoUint8Array } = await import("@simplewebauthn/server/helpers");
        const handle = isoBase64URL.fromBuffer(isoUint8Array.fromUTF8String("u-1"));
        mocked.passkeyCredential.findUnique.mockResolvedValue({
            credentialId: "cred-1",
            publicKey: "cA",
            counter: 1,
            transports: null,
            userId: "u-1",
            user: { id: "u-1", isActive: true },
        } as never);
        mocked.passkeyChallenge.findFirst.mockResolvedValue({ id: "c1", challenge: "ch", expiresAt: new Date(Date.now() + 60000) } as never);
        mocked.passkeyChallenge.delete.mockResolvedValue({} as never);
        vi.mocked(verifyAuthenticationResponse).mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 2 } } as never);
        mocked.passkeyCredential.update.mockResolvedValue({} as never);
        const out = await verifyAuthentication(null, { id: "cred-1", response: { userHandle: handle } } as never);
        expect(out.userId).toBe("u-1");
    });
    it("sukses memperbarui counter + lastUsedAt", async () => {
        mocked.userAccount.findUnique.mockResolvedValue({
            id: "u-1",
            isActive: true,
            passkeyCredentials: [{ credentialId: "cred-1", publicKey: "cA", counter: 5, transports: "internal" }],
        } as never);
        mocked.passkeyChallenge.findFirst.mockResolvedValue({ id: "c1", challenge: "ch", expiresAt: new Date(Date.now() + 60000) } as never);
        mocked.passkeyChallenge.delete.mockResolvedValue({} as never);
        vi.mocked(verifyAuthenticationResponse).mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 6 } } as never);
        mocked.passkeyCredential.update.mockResolvedValue({} as never);
        const out = await verifyAuthentication("ID-001", { id: "cred-1" } as never);
        expect(out.userId).toBe("u-1");
        expect(mocked.passkeyCredential.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { credentialId: "cred-1" } })
        );
    });
});
