/**
 * POST /api/logs/client
 *
 * Endpoint server-side untuk menerima log dari browser (client logger).
 * Log akan ditulis ke logs/combined.log & logs/error.log via Winston.
 *
 * Body: { level, module, message, data, timestamp }
 */

import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { level, module: mod, message, data, timestamp } = body;

    if (!level || !message) {
      return NextResponse.json({ error: "Invalid log payload" }, { status: 400 });
    }

    const meta = {
      source: "client-browser",
      module: mod ?? "unknown",
      clientTimestamp: timestamp,
      ...(data ?? {}),
    };

    // Map ke winston level
    switch (level) {
      case "error": logger.error(`[CLIENT] ${message}`, meta); break;
      case "warn":  logger.warn(`[CLIENT] ${message}`, meta);  break;
      case "info":  logger.info(`[CLIENT] ${message}`, meta);  break;
      default:      logger.debug(`[CLIENT] ${message}`, meta); break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[api/logs/client] Failed to parse client log", { err });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
