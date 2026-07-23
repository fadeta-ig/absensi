import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
    getPrimaryRole,
    SYSTEM_ROLES,
    type PermissionCode,
    type SystemRole,
} from "@/lib/permissions";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 16) {
    throw new Error(
        "JWT_SECRET wajib diisi di .env dan minimal 16 karakter. Aplikasi tidak dapat berjalan tanpa secret yang valid."
    );
}

const SECRET = new TextEncoder().encode(JWT_SECRET);

const userAccessInclude = {
    employee: {
        select: {
            id: true,
            employeeId: true,
            name: true,
            email: true,
            departmentId: true,
            divisionId: true,
            isActive: true,
            subordinates: {
                where: { isActive: true },
                select: { employeeId: true },
            },
        },
    },
    roles: {
        include: {
            role: {
                include: {
                    permissions: { include: { permission: true } },
                },
            },
        },
    },
} as const;

type UserWithAccess = Awaited<ReturnType<typeof findUserWithAccess>>;

async function findUserWithAccess(idOrUsername: { id: string } | { username: string }) {
    return prisma.userAccount.findUnique({
        where: idOrUsername,
        include: userAccessInclude,
    });
}

export interface UserPrincipal {
    userId: string;
    username: string;
    name: string;
    email: string;
    employeeId: string | null;
    employeeRecordId: string | null;
    departmentId: string | null;
    divisionId: string | null;
    roles: SystemRole[];
    permissions: PermissionCode[];
    primaryRole: SystemRole;
    /** @deprecated Compatibility projection; authorization must use permissions. */
    role: "hr" | "ga" | "employee";
    sessionVersion: number;
    hasSubordinates: boolean;
}

/** Session payload stored in JWT. The database remains authoritative. */
export interface SessionPayload extends JWTPayload, UserPrincipal {}

function toPrincipal(user: NonNullable<UserWithAccess>): UserPrincipal | null {
    const roles = user.roles.map(({ role }) => role.code) as SystemRole[];
    const permissions = Array.from(new Set(
        user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.code))
    )) as PermissionCode[];

    if (roles.length === 0) return null;
    if (user.employee && !user.employee.isActive) return null;
    if (roles.includes(SYSTEM_ROLES.EMPLOYEE_USER) && !user.employee) return null;

    return {
        userId: user.id,
        username: user.username,
        name: user.displayName,
        email: user.email,
        employeeId: user.employee?.employeeId ?? null,
        employeeRecordId: user.employee?.id ?? null,
        departmentId: user.employee?.departmentId ?? null,
        divisionId: user.employee?.divisionId ?? null,
        roles,
        permissions,
        primaryRole: getPrimaryRole(roles),
        role: permissions.includes("hr.manage")
            ? "hr"
            : permissions.includes("ga.manage")
                ? "ga"
                : "employee",
        sessionVersion: user.sessionVersion,
        hasSubordinates: (user.employee?.subordinates.length ?? 0) > 0,
    };
}

export async function createSession(user: UserPrincipal, rememberMe = false): Promise<void> {
    const expiresIn = rememberMe ? "30d" : "8h";
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 : 8 * 60 * 60;

    const token = await new SignJWT({ ...user } satisfies UserPrincipal)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge,
        path: "/",
    });
}

export async function getSession(): Promise<SessionPayload | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, SECRET);
        if (typeof payload.userId !== "string") return null;
        return payload as SessionPayload;
    } catch {
        return null;
    }
}

/** Resolve the token against current account, roles, permissions, and employee status. */
export async function getActiveSession(): Promise<SessionPayload | null> {
    const session = await getSession();
    if (!session) return null;

    const user = await findUserWithAccess({ id: session.userId });
    const current = user?.isActive ? toPrincipal(user) : null;
    if (
        !user ||
        !current ||
        user.username !== session.username ||
        user.sessionVersion !== session.sessionVersion
    ) {
        logger.warn("Session rejected by current user state", {
            username: session.username,
            reason: !user
                ? "user_not_found"
                : !user.isActive
                    ? "user_inactive"
                    : user.sessionVersion !== session.sessionVersion
                        ? "session_revoked"
                        : "role_or_employee_state_invalid",
        });
        return null;
    }

    return { ...session, ...current } as SessionPayload;
}

export async function destroySession(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete("session");
}

/** Verify a username/password without disclosing whether the account exists. */
export async function verifyLogin(username: string, password: string): Promise<UserPrincipal | null> {
    const user = await findUserWithAccess({ username });

    if (!user) {
        await bcrypt.hash("timing-equalizer", 10);
        logger.warn("Login attempt rejected", { username, reason: "invalid_credentials" });
        return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    const principal = user.isActive ? toPrincipal(user) : null;
    if (!isValid) {
        logger.warn("Login attempt rejected", { username, reason: "invalid_credentials" });
        return null;
    }
    if (!principal) {
        logger.warn("Login attempt rejected", {
            username,
            reason: user.isActive ? "role_or_employee_state_invalid" : "user_inactive",
        });
        return null;
    }

    await prisma.userAccount.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });
    logger.info("Login successful", { username: user.username });
    return principal;
}
