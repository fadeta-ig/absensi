import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getEmployeeByEmployeeId } from "./services/employeeService";
import { Employee } from "@/types";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "wig-attendance-secret-key-2026"
);

export async function createSession(employee: Employee) {
    const token = await new SignJWT({
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        role: employee.role,
    })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("8h")
        .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 8 * 60 * 60,
        path: "/",
    });

    return token;
}

export async function getSession(): Promise<{
    id: string;
    employeeId: string;
    name: string;
    role: "employee" | "hr";
} | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, SECRET);
        return payload as {
            id: string;
            employeeId: string;
            name: string;
            role: "employee" | "hr";
        };
    } catch {
        return null;
    }
}

export async function destroySession() {
    const cookieStore = await cookies();
    cookieStore.delete("session");
}

export async function verifyLogin(
    employeeId: string,
    password: string
): Promise<Employee | null> {
    console.log("[Auth] Verifying login for:", employeeId);
    const employee = await getEmployeeByEmployeeId(employeeId);

    if (!employee) {
        console.log("[Auth] Employee not found:", employeeId);
        return null;
    }

    if (!employee.isActive) {
        console.log("[Auth] Employee is inactive:", employeeId);
        return null;
    }

    const isValid = await bcrypt.compare(password, employee.password);
    console.log("[Auth] Password valid:", isValid);

    if (isValid) {
        return employee;
    }
    return null;
}
