/**
 * POST /api/logs/client
 *
 * Receives browser logs and writes them to the centralized Winston logger.
 * Only warn and error are accepted; client info/debug are dropped by clientLogger.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/middleware/rateLimit";
import { requireAuth, serverErrorResponse, unauthorizedResponse, validateBody } from "@/lib/middleware/apiGuard";

const clientLogSchema = z.object({
  level: z.enum(["warn", "error"]),
  module: z.string().max(120).optional(),
  message: z.string().min(1).max(500),
  data: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const rateLimited = checkRateLimit(req.headers, "client-log", 30, 60_000);
  if (rateLimited) return rateLimited;

  const session = await requireAuth();
  if (!session) return unauthorizedResponse();

  try {
    const result = await validateBody(req, clientLogSchema);
    if ("error" in result) return result.error;
    const { level, module: mod, message, data, timestamp } = result.data;

    const meta = {
      source: "client-browser",
      module: mod ?? "unknown",
      clientTimestamp: timestamp,
      userId: session.userId,
      username: session.username,
      ...(data ?? {}),
    };

    if (level === "error") {
      logger.error(`[CLIENT] ${message}`, meta);
    } else {
      logger.warn(`[CLIENT] ${message}`, meta);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverErrorResponse("ClientLogPOST", err);
  }
}
