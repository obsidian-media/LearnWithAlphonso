import {
  addSecurityHeaders,
  createCspNonce,
  requestWithCspNonce,
} from "../src/lib/security-policy";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const nonce = createCspNonce();
    const secureRequest = await requestWithCspNonce(request, nonce);
    try {
      serverEntryPromise ??= import("@tanstack/react-start/server-entry").then(
        (module) => (module.default ?? module) as ServerEntry,
      );
      const entry = await serverEntryPromise;
      return addSecurityHeaders(await entry.fetch(secureRequest, env, ctx), secureRequest, nonce);
    } catch (error) {
      console.error(error);
      return addSecurityHeaders(
        new Response(
          "<!doctype html><title>Unexpected error</title><h1>Something went wrong</h1>",
          {
            status: 500,
            headers: { "content-type": "text/html; charset=utf-8" },
          },
        ),
        secureRequest,
        nonce,
      );
    }
  },
};
