import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const ESCAPED_NUL = new TextEncoder().encode("\\u0000");

/**
 * TanStack Router's dehydration <script> embeds match ids like "\0terms\0terms"
 * as raw 0x00 bytes. Browsers cope, but grep, many crawlers and fetch tools
 * treat a document containing NUL as binary, so an SSR page "has no text"
 * to them (such a tool reports only the <title>). Inside a JS string
 * literal the six characters \u0000 are the same character, so replacing
 * each 0x00 byte with them leaves every parsed value identical. 0x00 never
 * occurs inside a multi-byte UTF-8 sequence, so this is safe per chunk.
 */
export function escapeHtmlNulBytes(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") || !response.body) return response;

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (!chunk.includes(0)) {
        controller.enqueue(chunk);
        return;
      }
      let nulCount = 0;
      for (const byte of chunk) if (byte === 0) nulCount++;
      const out = new Uint8Array(chunk.length + nulCount * (ESCAPED_NUL.length - 1));
      let j = 0;
      for (const byte of chunk) {
        if (byte === 0) {
          out.set(ESCAPED_NUL, j);
          j += ESCAPED_NUL.length;
        } else {
          out[j++] = byte;
        }
      }
      controller.enqueue(out);
    },
  });

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(response.body.pipeThrough(transform), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return escapeHtmlNulBytes(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
