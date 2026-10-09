import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
    type AuthenticationResponseJSON,
    type PublicKeyCredentialCreationOptionsJSON,
    type PublicKeyCredentialRequestOptionsJSON,
    type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import type { SessionPayload } from "@/lib/auth";

// ─── Error ────────────────────────────────────────────────────────

export class PasskeyError extends Error {
    constructor(message: string, public statusCode: number = 400) {
        super(message);
        this.name = "PasskeyError";
    }
}

// ─── Konfigurasi RP (turunan env, tanpa variabel baru) ────────────

function rpConfig(): { rpID: string; rpName: string; expectedOrigin: string } {
    // Override eksplisit (mis. tunnel testing dengan domain acak). Jika tidak
    // diset, turunkan dari APP_URL agar nol-konfigurasi di tiap environment.
    const envRpID = process.env.RP_ID?.trim();
    const envOrigin = process.env.RP_ORIGIN?.trim().replace(/\/$/, "");
    const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        url = new URL("http://localhost:3000");
    }
    const derivedRpID = url.hostname === "127.0.0.1" ? "localhost" : url.hostname;
    const rpID = envRpID || derivedRpID;
    const expectedOrigin = envOrigin || `${url.protocol}//${url.host}`;
    return { rpID, rpName: "WIG HRIS", expectedOrigin };
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_ACTIVE_CHALLENGES_PER_IP = 20;

// ─── Penyimpanan challenge sekali pakai (tanpa Redis) ─────────────

async function issueChallenge(
    userId: string | null,
    type: "REGISTRATION" | "AUTHENTICATION",
    clientIp: string | null
): Promise<string> {
    const { randomBytes } = await import("node:crypto");
    const challenge = randomBytes(32).toString("base64url");
    await prisma.passkeyChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
    if (clientIp) {
        const active = await prisma.passkeyChallenge.count({ where: { clientIp, expiresAt: { gt: new Date() } } }).catch(() => 0);
        if (active >= MAX_ACTIVE_CHALLENGES_PER_IP) {
            throw new PasskeyError("Terlalu banyak permintaan. Coba lagi sebentar.", 429);
        }
    }
    await prisma.passkeyChallenge.create({
        data: { userId, clientIp, type, challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
    });
    return challenge;
}

// ─── Registrasi (tambah perangkat, wajib login) ───────────────────

export async function getRegistrationOptions(
    session: SessionPayload
): Promise<{ options: PublicKeyCredentialCreationOptionsJSON }> {
    if (!session.userId || !session.username) throw new PasskeyError("Sesi tidak valid. Login ulang.", 401);
    const creds = await prisma.passkeyCredential.findMany({ where: { userId: session.userId }, select: { credentialId: true } });
    const { rpID, rpName } = rpConfig();
    const challenge = await issueChallenge(session.userId, "REGISTRATION", null);
    const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: isoUint8Array.fromUTF8String(session.userId),
        userName: session.username,
        userDisplayName: session.name,
        attestationType: "none",
        excludeCredentials: creds.map((c) => ({ id: c.credentialId })),
        authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
        timeout: 60000,
    });
    // Samakan challenge dengan yang tersimpan (single-use milik kita)
    options.challenge = challenge;
    return { options };
}

export async function verifyRegistration(
    session: SessionPayload,
    response: RegistrationResponseJSON,
    label: string | null,
    actor: { userId?: string | null; username: string }
): Promise<{ verified: boolean; credentialId: string }> {
    if (!session.userId) throw new PasskeyError("Sesi tidak valid. Login ulang.", 401);
    // Ambil + konsumsi challenge terbaru milik user (single-use, anti-replay).
    const stored = await takeStoredChallenge("REGISTRATION", session.userId);
    if (!stored) throw new PasskeyError("Sesi pendaftaran kedaluwarsa. Ulangi dari awal.", 400);
    const { expectedOrigin, rpID } = rpConfig();
    let verification;
    try {
        verification = await verifyRegistrationResponse({
            response,
            expectedChallenge: stored,
            expectedOrigin,
            expectedRPID: rpID,
            requireUserVerification: false,
        });
    } catch {
        throw new PasskeyError("Verifikasi perangkat gagal. Coba lagi.", 400);
    }
    if (!verification.verified || !verification.registrationInfo) {
        throw new PasskeyError("Verifikasi perangkat gagal. Coba lagi.", 400);
    }
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const exists = await prisma.passkeyCredential.findUnique({ where: { credentialId: credential.id } });
    if (exists) throw new PasskeyError("Perangkat ini sudah terdaftar.", 409);
    await prisma.passkeyCredential.create({
        data: {
            userId: session.userId,
            credentialId: credential.id,
            publicKey: isoBase64URL.fromBuffer(credential.publicKey),
            counter: credential.counter,
            transports: credential.transports?.join(",") || null,
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            label: label?.trim().slice(0, 100) || null,
        },
    });
    await prisma.auditLog
        .create({
            data: {
                action: "CREATE_PASSKEY",
                entity: "USER_ACCOUNT",
                entityId: session.userId,
                details: JSON.stringify({ label: label?.trim().slice(0, 100) || null }),
                actorType: "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.username,
            },
        })
        .catch((err) => logger.error("passkey audit CREATE gagal", { err }));
    return { verified: true, credentialId: credential.id };
}

// ─── Daftar & cabut (wajib login, milik sendiri) ──────────────────

export async function listCredentials(session: SessionPayload) {
    if (!session.userId) throw new PasskeyError("Sesi tidak valid. Login ulang.", 401);
    const rows = await prisma.passkeyCredential.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: "desc" },
        select: { id: true, label: true, deviceType: true, backedUp: true, lastUsedAt: true, createdAt: true },
    });
    return rows;
}

export async function revokeCredential(
    session: SessionPayload,
    credentialDbId: string,
    actor: { userId?: string | null; username: string }
): Promise<void> {
    if (!session.userId) throw new PasskeyError("Sesi tidak valid. Login ulang.", 401);
    const row = await prisma.passkeyCredential.findUnique({ where: { id: credentialDbId } });
    if (!row || row.userId !== session.userId) throw new PasskeyError("Perangkat tidak ditemukan.", 404);
    await prisma.passkeyCredential.delete({ where: { id: credentialDbId } });
    await prisma.auditLog
        .create({
            data: {
                action: "REVOKE_PASSKEY",
                entity: "USER_ACCOUNT",
                entityId: session.userId,
                details: JSON.stringify({ label: row.label }),
                actorType: "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.username,
            },
        })
        .catch((err) => logger.error("passkey audit REVOKE gagal", { err }));
}

/** Cabut semua passkey milik user (dipakai alur reset password HR agar akun kompromi bersih total). */
export async function revokeAllForUser(userId: string): Promise<number> {
    const res = await prisma.passkeyCredential.deleteMany({ where: { userId } });
    return res.count;
}

// ─── Login (publik, rate-limit ketat di route) ────────────────────

export async function getAuthenticationOptions(
    username: string | null,
    clientIp: string | null
): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; hasPasskey: boolean }> {
    const { rpID } = rpConfig();
    // Mode tanpa username (discoverable): opsi kosong + tantangan anonim.
    if (!username || !username.trim()) {
        const challenge = await issueChallenge(null, "AUTHENTICATION", clientIp);
        const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred", timeout: 60000 });
        options.challenge = challenge;
        return { options, hasPasskey: true };
    }
    const user = await prisma.userAccount.findUnique({
        where: { username: username.trim() },
        select: { id: true, isActive: true, passkeyCredentials: { select: { credentialId: true, transports: true } } },
    });
    // Anti-enumerasi: user tak ada/nonaktif/tanpa passkey → opsi generik TANPA challenge tersimpan.
    // Verify akan selalu gagal dengan pesan generik yang sama.
    if (!user || !user.isActive || user.passkeyCredentials.length === 0) {
        const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred", timeout: 60000 });
        return { options, hasPasskey: false };
    }
    const challenge = await issueChallenge(user.id, "AUTHENTICATION", clientIp);
    const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: user.passkeyCredentials.map((c) => ({
            id: c.credentialId,
            transports: (c.transports?.split(",").filter(Boolean) ?? []) as AuthenticatorTransport[],
        })),
        userVerification: "preferred",
        timeout: 60000,
    });
    options.challenge = challenge;
    return { options, hasPasskey: true };
}

export async function verifyAuthentication(
    username: string | null,
    response: AuthenticationResponseJSON
): Promise<{ userId: string }> {
    const failMessage = "Login passkey gagal. Coba lagi atau gunakan password.";
    // Mode tanpa username: identifikasi via credentialId → pemilik; userHandle hanya cross-check.
    if (!username || !username.trim()) {
        const row = await prisma.passkeyCredential.findUnique({
            where: { credentialId: response.id },
            select: {
                credentialId: true,
                publicKey: true,
                counter: true,
                transports: true,
                userId: true,
                user: { select: { id: true, isActive: true } },
            },
        });
        if (!row || !row.user.isActive) throw new PasskeyError(failMessage, 401);
        if (response.response.userHandle) {
            const claimed = isoUint8Array.toUTF8String(isoBase64URL.toBuffer(response.response.userHandle));
            if (claimed !== row.userId) throw new PasskeyError(failMessage, 401);
        }
        const stored = await takeStoredChallenge("AUTHENTICATION", row.userId, true);
        if (!stored) throw new PasskeyError(failMessage, 401);
        await verifyCredentialAndTouch(row, response, stored, failMessage);
        return { userId: row.userId };
    }
    const user = await prisma.userAccount.findUnique({
        where: { username: username.trim() },
        select: {
            id: true,
            isActive: true,
            passkeyCredentials: { select: { credentialId: true, publicKey: true, counter: true, transports: true } },
        },
    });
    if (!user || !user.isActive) throw new PasskeyError(failMessage, 401);
    const stored = await takeStoredChallenge("AUTHENTICATION", user.id, false);
    if (!stored) throw new PasskeyError(failMessage, 401);
    const cred = user.passkeyCredentials.find((c) => c.credentialId === response.id);
    if (!cred) throw new PasskeyError(failMessage, 401);
    await verifyCredentialAndTouch(cred, response, stored, failMessage);
    return { userId: user.id };
}

async function verifyCredentialAndTouch(
    cred: { credentialId: string; publicKey: string; counter: number; transports: string | null },
    response: AuthenticationResponseJSON,
    expectedChallenge: string,
    failMessage: string
): Promise<void> {
    const { expectedOrigin, rpID } = rpConfig();
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
        verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
            expectedOrigin,
            expectedRPID: rpID,
            credential: {
                id: cred.credentialId,
                publicKey: isoBase64URL.toBuffer(cred.publicKey),
                counter: cred.counter,
                transports: (cred.transports?.split(",").filter(Boolean) ?? []) as AuthenticatorTransport[],
            },
            requireUserVerification: false,
        });
    } catch {
        throw new PasskeyError(failMessage, 401);
    }
    if (!verification.verified) throw new PasskeyError(failMessage, 401);
    await prisma.passkeyCredential.update({
        where: { credentialId: cred.credentialId },
        data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    });
}

// ─── Internal ─────────────────────────────────────────────────────

async function takeStoredChallenge(
    type: "REGISTRATION" | "AUTHENTICATION",
    userId: string,
    allowAnonymous: boolean = false
): Promise<string | null> {
    // Challenge terbaru yang belum kedaluwarsa milik user; konsumsi (hapus) agar single-use.
    // Mode tanpa username: fallback ke tantangan anonim terbaru (dibuat via opsi discoverable).
    let row = await prisma.passkeyChallenge.findFirst({
        where: { type, userId, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
    });
    if (!row && allowAnonymous) {
        row = await prisma.passkeyChallenge.findFirst({
            where: { type, userId: null, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: "desc" },
        });
    }
    if (!row) return null;
    await prisma.passkeyChallenge.delete({ where: { id: row.id } }).catch(() => undefined);
    return row.challenge;
}
