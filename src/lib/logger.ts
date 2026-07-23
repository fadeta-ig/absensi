/**
 * Logger Terpusat — Winston
 *
 * Transport:
 * - Console: selalu aktif (development & production)
 * - File: hanya production (logs/error.log + logs/combined.log)
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
    defaultMeta: { service: "absensi-hris" },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
                    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
                    return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
                })
            ),
        }),
    ],
});

// File transports hanya di production
if (IS_PRODUCTION) {
    logger.add(
        new winston.transports.File({
            filename: "logs/error.log",
            level: "error",
            maxsize: 5_242_880, // 5MB
            maxFiles: 5,
        })
    );
    logger.add(
        new winston.transports.File({
            filename: "logs/combined.log",
            maxsize: 10_485_760, // 10MB
            maxFiles: 5,
        })
    );
}

export default logger;
