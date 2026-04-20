

export const API_BASE_URL = "http://localhost:3000/api";

type Role = "hr" | "ga" | "employee";



/**
 * Logs in and returns the raw cookie string that can be used in the fetch 'Cookie' header.
 */
export async function getAuthCookie(role: Role): Promise<string> {
    const employeeId = role === "hr" ? "WIG001" : role === "ga" ? "WIG002" : "ID25000000"; // Assuming dev seed doesn't have an employee by default except we use db:seed:employee, but let's stick to hr and ga for most tests.
    
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, password: "123" }),
    });

    if (!res.ok) {
        throw new Error(`Failed to login as ${role}: ${res.status} ${res.statusText}`);
    }

    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) {
        throw new Error(`No set-cookie returned mapped for ${role}`);
    }

    // Extract just the session=... part
    const match = setCookie.match(/session=([^;]+)/);
    if (match) {
        return `session=${match[1]}`;
    }

    return setCookie; // fallback raw
}

/**
 * Helper to perform authenticated fetch calls.
 */
export async function fetchWithAuth(
    path: string, 
    cookie: string, 
    options: RequestInit = {}
): Promise<Response> {
    const headers = new Headers(options.headers || {});
    headers.set("Cookie", cookie);

    return fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
    });
}
