/**
 * Logger Terpusat — Winston
 *
 * Transport:
 * - Console: selalu aktif di semua environment (stdout untuk info/warn/debug, stderr untuk error via stderrLevels).
 *   - Production: single-line JSON terstruktur tanpa ANSI colorize (ditangkap PM2 ke hris-out.log & hris-error.log).
 *   - Development / Test: format readable berwarna.
 */

import winston from "winston";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SPLAT = Symbol.for("splat");

type PlainMeta = Record<string, unknown>;

export function serializeError(error: unknown, seen = new WeakSet<object>()): PlainMeta {
    if (error instanceof Error) {
        if (seen.has(error)) return { message: "[Circular Error]" };
        seen.add(error);

        const details: PlainMeta = {
            name: error.name,
            message: error.message,
        };
        if (error.stack) details.stack = error.stack;

        const withExtras = error as Error & {
            code?: unknown;
            status?: unknown;
            cause?: unknown;
            clientVersion?: unknown;
            meta?: unknown;
        };
        if (withExtras.code !== undefined) details.code = withExtras.code;
        if (withExtras.status !== undefined) details.status = withExtras.status;
        if (withExtras.clientVersion !== undefined) details.clientVersion = withExtras.clientVersion;
        if (withExtras.meta !== undefined) details.meta = normalizeLogValue(withExtras.meta, seen);
        if (withExtras.cause !== undefined) details.cause = normalizeLogValue(withExtras.cause, seen);
        return details;
    }

    if (error && typeof error === "object") {
        return normalizeLogValue(error, seen) as PlainMeta;
    }

    return { message: String(error) };
}

function normalizeLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
    if (value instanceof Error) return serializeError(value, seen);
    if (value instanceof Date) return value.toISOString();
    if (!value || typeof value !== "object") return value;

    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    if (Array.isArray(value)) {
        return value.map((item) => normalizeLogValue(item, seen));
    }

    const output: PlainMeta = {};
    for (const [key, item] of Object.entries(value as PlainMeta)) {
        output[key] = normalizeLogValue(item, seen);
    }
    return output;
}

const normalizeErrorMetadata = winston.format((info) => {
    for (const key of Object.keys(info)) {
        info[key] = normalizeLogValue(info[key]);
    }

    const splat = (info as Record<symbol, unknown>)[SPLAT];
    if (Array.isArray(splat)) {
        (info as Record<symbol, unknown>)[SPLAT] = splat.map((item) => normalizeLogValue(item));
    }

    return info;
});

const logger = winston.createLogger({
    level: IS_PRODUCTION ? "info" : "debug",
    format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        normalizeErrorMetadata(),
        winston.format.json()
    ),
    defaultMeta: { service: "presensi-hris" },
    transports: [
        new winston.transports.Console({
            stderrLevels: ["error"],
            format: IS_PRODUCTION
                ? undefined
                : winston.format.combine(
                      winston.format.colorize(),
                      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
                          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
                          return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
                      })
                  ),
        }),
    ],
});

export default logger;
