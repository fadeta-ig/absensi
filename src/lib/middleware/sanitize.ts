/**
 * Strip HTML tags from a string to prevent XSS.
 */
export function sanitizeString(input: string): string {
    return input
        .replace(/<[^>]*>/g, "")
        .trim();
}

/**
 * Recursively sanitize all string values in an object or array.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeObject<T>(obj: T): T {
    if (Array.isArray(obj)) {
        return obj.map((item) => typeof item === "string" ? sanitizeString(item) : sanitizeObject(item)) as unknown as T;
    }
    
    if (obj !== null && typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(obj as Record<string, unknown>)) {
            const value = (obj as Record<string, unknown>)[key];
            if (typeof value === "string") {
                result[key] = sanitizeString(value);
            } else if (value !== null && typeof value === "object") {
                result[key] = sanitizeObject(value);
            } else {
                result[key] = value;
            }
        }
        return result as T;
    }
    
    return obj;
}
