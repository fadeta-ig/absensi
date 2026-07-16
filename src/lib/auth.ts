import { SignJWT, jwtVerify, JWTPayload } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getEmployeeByEmployeeId } from "./services/employeeService";
import { Employee } from "@/types";
import logger from "@/lib/logger";
import { toDateString } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 16) {
    throw new Error(
        "JWT_SECRET wajib diisi di .env dan minimal 16 karakter. Aplikasi tidak dapat berjalan tanpa secret yang valid."
    );
}

const SECRET = new TextEncoder().encode(JWT_SECRET);

/** Session payload stored in JWT */
export interface SessionPayload extends JWTPayload {
    id: string;
    employeeId: string;
    name: string;
    role: "employee" | "hr" | "ga";
    departmentId: string;
    divisionId?: string | null;
    sessionVersion: number;
}

/**
 * Create a new session and set the JWT token as an httpOnly cookie.
 */
export async function createSession(employee: Employee, rememberMe: boolean = false): Promise<void> {
    const expiresIn = rememberMe ? "30d" : "8h";
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 : 8 * 60 * 60;

    const token = await new SignJWT({
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        role: employee.role,
        departmentId: employee.departmentId,
        divisionId: employee.divisionId,
        sessionVersion: employee.sessionVersion,
    } satisfies SessionPayload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: maxAge,
        path: "/",
    });
}

/**
 * Retrieve and verify the current session from the cookie.
 */
export async function getSession(): Promise<SessionPayload | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, SECRET);
        return payload as SessionPayload;
    } catch {
        return null;
    }
}

/**
 * Resolve a JWT session against the current employee record.
 * The database is authoritative for active status, role, and session revocation.
 */
export async function getActiveSession(): Promise<SessionPayload | null> {
    const session = await getSession();
    if (!session) return null;

    const employee = await prisma.employee.findUnique({
        where: { id: session.id },
        select: {
            id: true,
            employeeId: true,
            name: true,
            role: true,
            departmentId: true,
            divisionId: true,
            isActive: true,
            sessionVersion: true,
        },
    });

    const tokenVersion = typeof session.sessionVersion === "number" ? session.sessionVersion : 0;
    const roleIsValid = employee?.role === "employee" || employee?.role === "hr" || employee?.role === "ga";

    if (
        !employee ||
        !employee.isActive ||
        !roleIsValid ||
        employee.employeeId !== session.employeeId ||
        employee.sessionVersion !== tokenVersion
    ) {
        logger.warn("Session rejected by current employee state", {
            employeeId: session.employeeId,
            reason: !employee
                ? "employee_not_found"
                : !employee.isActive
                    ? "employee_inactive"
                    : employee.sessionVersion !== tokenVersion
                        ? "session_revoked"
                        : "identity_or_role_invalid",
        });
        return null;
    }

    return {
        ...session,
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        role: employee.role,
        departmentId: employee.departmentId,
        divisionId: employee.divisionId,
        sessionVersion: employee.sessionVersion,
    } as SessionPayload;
}

/**
 * Destroy the current session by deleting the cookie.
 */
export async function destroySession(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete("session");
}

/**
 * Verify login credentials. Returns the employee on success, null on failure.
 * Uses constant-time comparison and does NOT leak which field was wrong.
 */
export async function verifyLogin(
    employeeId: string,
    password: string
): Promise<Employee | null> {
    const employee = await getEmployeeByEmployeeId(employeeId);

    if (!employee) {
        // Constant-time: still run bcrypt to prevent timing attacks
        await bcrypt.hash("dummy", 10);
        logger.debug("Login attempt: employee not found");
        return null;
    }

    if (!employee.isActive) {
        logger.debug("Login attempt: inactive employee");
        return null;
    }

    const isValid = await bcrypt.compare(password, employee.password);

    if (!isValid) {
        logger.debug("Login attempt: invalid credentials");
        return null;
    }

    logger.info("Login successful", { employeeId: employee.employeeId });
    return {
        ...employee,
        joinDate: toDateString(employee.joinDate),
        faceDescriptor: employee.faceDescriptor ? JSON.parse(employee.faceDescriptor) : undefined
    } as unknown as Employee;
}
