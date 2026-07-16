import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    forbiddenResponse,
    requireAuth,
    serverErrorResponse,
    unauthorizedResponse,
    validateBody,
} from "@/lib/middleware/apiGuard";
import { checkApiRateLimit, checkSensitiveRateLimit } from "@/lib/middleware/rateLimit";
import { canManageUsers, SYSTEM_ROLES } from "@/lib/permissions";
import { actorFromSession, logAction } from "@/lib/services/auditService";
import { sendPasswordEmail } from "@/lib/services/emailService";
import {
    createAdminUser,
    listAdministrativeUsers,
    listEligibleAdminEmployees,
    resetAdminUserPassword,
    updateAdminUser,
    UserManagementError,
} from "@/lib/services/userService";

const manageableRoleSchema = z.enum([SYSTEM_ROLES.HR_ADMIN, SYSTEM_ROLES.GA_ADMIN]);

const createUserSchema = z.object({
    source: z.enum(["standalone", "employee"]),
    username: z.string().trim().min(3).max(100).regex(/^[A-Za-z0-9._-]+$/, "Username hanya boleh berisi huruf, angka, titik, garis bawah, atau strip").optional(),
    displayName: z.string().trim().min(2).max(150).optional(),
    email: z.string().email().optional(),
    employeeId: z.string().trim().min(1).optional(),
    roleCode: manageableRoleSchema,
}).superRefine((value, ctx) => {
    if (value.source === "standalone") {
        if (!value.username) ctx.addIssue({ code: "custom", path: ["username"], message: "Username wajib diisi" });
        if (!value.displayName) ctx.addIssue({ code: "custom", path: ["displayName"], message: "Nama wajib diisi" });
        if (!value.email) ctx.addIssue({ code: "custom", path: ["email"], message: "Email wajib diisi" });
    } else if (!value.employeeId) {
        ctx.addIssue({ code: "custom", path: ["employeeId"], message: "Karyawan wajib dipilih" });
    }
});

const updateUserSchema = z.object({
    id: z.string().uuid(),
    action: z.enum(["update", "reset_password"]),
    displayName: z.string().trim().min(2).max(150).optional(),
    email: z.string().email().optional(),
    roleCode: manageableRoleSchema.optional(),
    isActive: z.boolean().optional(),
});

function generatePassword(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
    const bytes = randomBytes(14);
    return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

function serializeUser(user: Awaited<ReturnType<typeof listAdministrativeUsers>>[number]) {
    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        isActive: user.isActive,
        employeeId: user.employeeId,
        employee: user.employee,
        roles: user.roles.map(({ role }) => role),
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        creator: user.creator,
    };
}

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageUsers(session)) return forbiddenResponse();

    try {
        const [users, eligibleEmployees] = await Promise.all([
            listAdministrativeUsers(),
            listEligibleAdminEmployees(),
        ]);
        return NextResponse.json({ users: users.map(serializeUser), eligibleEmployees });
    } catch (error) {
        return serverErrorResponse("UsersGET", error);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkSensitiveRateLimit(request.headers);
    if (rateLimited) return rateLimited;
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageUsers(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, createUserSchema);
        if ("error" in result) return result.error;
        const plainPassword = generatePassword();
        const passwordHash = await bcrypt.hash(plainPassword, 12);
        const user = await createAdminUser({
            username: result.data.username ?? result.data.employeeId ?? "",
            displayName: result.data.displayName ?? "",
            email: result.data.email ?? "",
            employeeId: result.data.source === "employee" ? result.data.employeeId : null,
            roleCode: result.data.roleCode,
            passwordHash,
            actorUserId: session.userId,
        });

        let emailSent = true;
        const wasExistingEmployeeAccount = result.data.source === "employee";
        if (!wasExistingEmployeeAccount) {
            emailSent = await sendPasswordEmail(user.email, user.displayName, plainPassword);
        }

        await logAction("CREATE_ADMIN_USER", "USER_ACCOUNT", actorFromSession(session), user.id, {
            username: user.username,
            roleCode: result.data.roleCode,
            employeeId: user.employeeId,
            emailSent: wasExistingEmployeeAccount ? "existing_credentials_preserved" : emailSent,
        });

        return NextResponse.json({
            user: serializeUser(user),
            emailSent,
            message: wasExistingEmployeeAccount
                ? "Akses admin berhasil diberikan. Password akun karyawan tetap digunakan."
                : emailSent
                    ? "User admin berhasil dibuat dan password dikirim melalui email."
                    : "User admin berhasil dibuat, tetapi email password gagal dikirim.",
        }, { status: 201 });
    } catch (error) {
        if (error instanceof UserManagementError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        if ((error as { code?: string })?.code === "P2002") {
            return NextResponse.json({ error: "Username atau email sudah digunakan." }, { status: 409 });
        }
        return serverErrorResponse("UsersPOST", error);
    }
}

export async function PATCH(request: NextRequest) {
    const rateLimited = checkSensitiveRateLimit(request.headers);
    if (rateLimited) return rateLimited;
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageUsers(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, updateUserSchema);
        if ("error" in result) return result.error;

        if (result.data.action === "reset_password") {
            const plainPassword = generatePassword();
            const passwordHash = await bcrypt.hash(plainPassword, 12);
            const user = await resetAdminUserPassword(result.data.id, session.userId, passwordHash);
            const emailSent = await sendPasswordEmail(user.email, user.displayName, plainPassword);
            await logAction("RESET_ADMIN_PASSWORD", "USER_ACCOUNT", actorFromSession(session), user.id, {
                username: user.username,
                emailSent,
            });
            return NextResponse.json({
                success: true,
                emailSent,
                message: emailSent
                    ? "Password baru berhasil dikirim melalui email."
                    : "Password berhasil direset, tetapi email gagal dikirim.",
            });
        }

        const user = await updateAdminUser({
            id: result.data.id,
            actorUserId: session.userId,
            displayName: result.data.displayName,
            email: result.data.email,
            roleCode: result.data.roleCode,
            isActive: result.data.isActive,
        });
        await logAction("UPDATE_ADMIN_USER", "USER_ACCOUNT", actorFromSession(session), user.id, {
            username: user.username,
            roleCode: result.data.roleCode,
            isActive: result.data.isActive,
        });
        return NextResponse.json({ user: serializeUser(user), message: "User berhasil diperbarui." });
    } catch (error) {
        if (error instanceof UserManagementError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        if ((error as { code?: string })?.code === "P2002") {
            return NextResponse.json({ error: "Email sudah digunakan oleh user lain." }, { status: 409 });
        }
        return serverErrorResponse("UsersPATCH", error);
    }
}
