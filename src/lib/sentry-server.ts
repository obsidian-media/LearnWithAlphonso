import { sentryDsnFor } from "./sentry-config";
import { scrubEvent } from "./sentry-scrub";

/**
 * Server-side error capture. Posts one event envelope straight to Sentry's
 * ingest endpoint with fetch: the Node SDK's OpenTelemetry auto-instrumentation
 * does not fit the Nitro/Vercel runtime, and a handled 500 only needs the
 * error, its stack and the route. Enabled only when NODE_ENV=production.
 */

type Frame = { function?: string; filename?: string; lineno?: number; colno?: number };

function parseFrames(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n")) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (m)
      frames.push({ function: m[1], filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) });
  }
  // Sentry wants oldest call first.
  return frames.reverse();
}

export function buildServerEvent(error: unknown, context: Record<string, unknown> = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    environment: "production",
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: { frames: parseFrames(err.stack) },
          mechanism: { type: "generic", handled: true },
        },
      ],
    },
    tags: { runtime: "server" },
    extra: context,
  };
  return scrubEvent(event);
}

export async function reportServerError(
  error: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const dsn = sentryDsnFor({
    production: process.env.NODE_ENV === "production",
    override: process.env.SENTRY_DSN,
  });
  if (!dsn) return;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    const event = buildServerEvent(error, context);
    const body =
      JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn }) +
      "\n" +
      JSON.stringify({ type: "event" }) +
      "\n" +
      JSON.stringify(event);
    await fetch(
      `${url.origin}/api/${projectId}/envelope/?sentry_key=${url.username}&sentry_version=7`,
      {
        method: "POST",
        headers: { "content-type": "application/x-sentry-envelope" },
        body,
        signal: AbortSignal.timeout(2000),
      },
    );
  } catch {
    // Reporting must never turn a handled error into a second failure.
  }
}
