import { z } from "zod";

/**
 * Runtime environment validation.
 * Fail-fast if required variables are missing.
 */
const envSchema = z.object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL wajib diisi di .env"),
    JWT_SECRET: z.string().min(16, "JWT_SECRET wajib diisi dan minimal 16 karakter"),
    // Optional during migration. Set a stable, random 32+ character value in production.
    // JWT_SECRET is used with domain separation as a backwards-compatible fallback.
    PII_ENCRYPTION_KEY: z.string().min(32, "PII_ENCRYPTION_KEY minimal 32 karakter").optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // SMTP (optional — gracefully degrades if not set)
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const formatted = result.error.issues
            .map((issue) => `  ✗ ${issue.path.join(".")}: ${issue.message}`)
            .join("\n");

        console.error(
            "\n╔══════════════════════════════════════╗\n" +
            "║  ⚠ ENVIRONMENT VALIDATION FAILED     ║\n" +
            "╚══════════════════════════════════════╝\n\n" +
            formatted + "\n"
        );
        throw new Error("Environment validation failed. Fix .env and restart.");
    }

    return result.data;
}

export const env = validateEnv();
