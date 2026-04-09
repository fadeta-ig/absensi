/**
 * POST /api/logs/client
 *
 * Menerima log dari browser dan menulis ke Winston.
 * Hanya level warn & error yang diproses — info/debug di-drop
 * agar combined.log tidak spam.
 */

import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";

const ALLOWED_LEVELS = new Set(["warn", "error"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { level, module: mod, message, data, timestamp } = body;

    // Drop info & debug — tidak perlu masuk file log
    if (!level || !message || !ALLOWED_LEVELS.has(level)) {
      return NextResponse.json({ ok: true });
    }

    const meta = {
      source: "client-browser",
      module: mod ?? "unknown",
      clientTimestamp: timestamp,
      ...(data ?? {}),
    };

    if (level === "error") {
      logger.error(`[CLIENT] ${message}`, meta);
    } else {
      logger.warn(`[CLIENT] ${message}`, meta);
    }

    return NextResponse.json({ ok: true });
  } catch {
    // Jangan log error di sini agar tidak trigger loop
    return NextResponse.json({ ok: true });
  }
}
