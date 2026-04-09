/**
 * Client Logger — Browser-Side
 *
 * Mode produksi:
 * - TIDAK ada output ke browser console (silent)
 * - Hanya warn & error yang dikirim ke server (/api/logs/client)
 * - info & debug di-drop sepenuhnya
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

/** Level yang dikirim ke server — hanya warn ke atas */
const SERVER_LEVELS: LogLevel[] = ["warn", "error"];

function formatTime(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 23);
}

/** Kirim ke server secara async fire-and-forget */
function sendToServer(entry: LogEntry): void {
  if (!SERVER_LEVELS.includes(entry.level)) return;

  fetch("/api/logs/client", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
    keepalive: true,
  }).catch(() => {
    // Jangan sampai log error menyebabkan infinite error loop
  });
}

function log(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): void {
  sendToServer({
    level,
    module,
    message,
    data,
    timestamp: formatTime(),
  });
}

/** Buat logger dengan nama module tertentu */
export function createClientLogger(module: string) {
  return {
    debug: (_msg: string, _data?: Record<string, unknown>) => { /* silent */ },
    info:  (_msg: string, _data?: Record<string, unknown>) => { /* silent */ },
    warn:  (msg: string, data?: Record<string, unknown>) => log("warn",  module, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log("error", module, msg, data),
  };
}

export type ClientLogger = ReturnType<typeof createClientLogger>;
