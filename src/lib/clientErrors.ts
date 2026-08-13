import { createClientLogger } from "@/lib/clientLogger";

const fetchLog = createClientLogger("ClientFetch");

function serializeClientError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }
    return { message: String(error) };
}

function redactUrl(rawUrl: string): string {
    try {
        const url = new URL(rawUrl, window.location.origin);
        url.searchParams.forEach((_, key) => {
            if (/token|password|secret|key/i.test(key)) {
                url.searchParams.set(key, "[redacted]");
            }
        });
        return `${url.pathname}${url.search}`;
    } catch {
        return rawUrl;
    }
}

export function reportClientError(
    module: string,
    message: string,
    error: unknown,
    data: Record<string, unknown> = {}
): void {
    createClientLogger(module).error(message, {
        ...data,
        error: serializeClientError(error),
    });
}

export async function getResponseErrorMessage(response: Response, fallback: string): Promise<string> {
    let parsedMessage: string | null = null;
    let parseError: unknown = null;

    try {
        const data = await response.clone().json() as {
            error?: unknown;
            message?: unknown;
            details?: unknown;
        };

        if (typeof data.error === "string" && data.error.trim()) parsedMessage = data.error;
        if (!parsedMessage && typeof data.message === "string" && data.message.trim()) parsedMessage = data.message;
        if (Array.isArray(data.details) && data.details.every((item) => typeof item === "string")) {
            parsedMessage = data.details.join(", ");
        }
    } catch (error) {
        parseError = error;
        // Response may be empty or non-JSON.
    }

    const message = parsedMessage ?? fallback;
    const payload = {
        status: response.status,
        statusText: response.statusText,
        url: redactUrl(response.url),
        fallback,
        message,
        ...(parseError ? { parseError: serializeClientError(parseError) } : {}),
    };

    if (response.status >= 500) {
        fetchLog.error("Fetch response returned server error", payload);
    } else {
        fetchLog.warn("Fetch response returned non-success status", payload);
    }

    return message;
}
