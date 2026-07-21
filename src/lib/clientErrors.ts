export async function getResponseErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
        const data = await response.clone().json() as {
            error?: unknown;
            message?: unknown;
            details?: unknown;
        };

        if (typeof data.error === "string" && data.error.trim()) return data.error;
        if (typeof data.message === "string" && data.message.trim()) return data.message;
        if (Array.isArray(data.details) && data.details.every((item) => typeof item === "string")) {
            return data.details.join(", ");
        }
    } catch {
        // Response may be empty or non-JSON.
    }

    return fallback;
}
