/**
 * Client Logger — Browser-Side
 *
 * Fungsi:
 * 1. Log ke browser console dengan format berwarna & terstruktur
 * 2. Kirim log ke server (/api/logs/client) agar tercatat di logs/combined.log
 *
 * Digunakan khusus untuk komponen browser (camera, face recognition, GPS).
 * JANGAN import winston di sini — ini client-side only.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

const IS_DEV = process.env.NODE_ENV !== "production";

// Style console per level
const STYLE: Record<LogLevel, string> = {
  debug: "color:#6b7280;font-weight:normal",
  info:  "color:#2563eb;font-weight:bold",
  warn:  "color:#d97706;font-weight:bold",
  error: "color:#dc2626;font-weight:bold",
};

const EMOJI: Record<LogLevel, string> = {
  debug: "🔍",
  info:  "ℹ️",
  warn:  "⚠️",
  error: "🔴",
};

function formatTime(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 23);
}

function printConsole(entry: LogEntry): void {
  const { level, module, message, data } = entry;
  const prefix = `${EMOJI[level]} [${module}]`;

  if (data && Object.keys(data).length > 0) {
    console.groupCollapsed(
      `%c${prefix} ${message}`,
      STYLE[level]
    );
    console.log("timestamp:", entry.timestamp);
    console.log("data:", data);
    console.groupEnd();
  } else {
    console.log(`%c${prefix} ${message}`, STYLE[level]);
  }
}

/** Kirim log ke server secara async (fire-and-forget, tidak blokir UI) */
function sendToServer(entry: LogEntry): void {
  // Hanya kirim warn & error ke server untuk mengurangi traffic
  if (entry.level === "debug" && !IS_DEV) return;

  fetch("/api/logs/client", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
    // keepalive agar log terkirim meski halaman ditutup
    keepalive: true,
  }).catch(() => {
    // Jangan sampai log error menyebabkan infinite error loop
  });
}

function log(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    module,
    message,
    data,
    timestamp: formatTime(),
  };

  printConsole(entry);
  sendToServer(entry);
}

/** Buat logger dengan nama module tertentu */
export function createClientLogger(module: string) {
  return {
    debug: (msg: string, data?: Record<string, unknown>) => log("debug", module, msg, data),
    info:  (msg: string, data?: Record<string, unknown>) => log("info",  module, msg, data),
    warn:  (msg: string, data?: Record<string, unknown>) => log("warn",  module, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log("error", module, msg, data),
  };
}

export type ClientLogger = ReturnType<typeof createClientLogger>;
