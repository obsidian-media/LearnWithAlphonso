const CSP_NONCE_HEADER = "x-app-csp-nonce";

export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function readCspNonce(request: Request): string | undefined {
  return request.headers.get(CSP_NONCE_HEADER) ?? undefined;
}

export async function requestWithCspNonce(request: Request, nonce: string): Promise<Request> {
  const headers = new Headers(request.headers);
  // Always replace a caller-provided value: the nonce is server-generated.
  headers.set(CSP_NONCE_HEADER, nonce);
  // Rebuild from bytes: Nitro can supply a Request whose body/signal are from
  // another runtime realm and cannot be passed to Node's undici constructor.
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : new Uint8Array(await request.arrayBuffer());
  return new Request(request.url, {
    method: request.method,
    headers,
    body,
  });
}

export function contentSecurityPolicy(nonce: string, supabaseUrl?: string): string {
  let supabaseOrigin: string | undefined;
  try {
    if (supabaseUrl) {
      const parsedUrl = new URL(supabaseUrl);
      // Never permit a production CSP to authorize plaintext Supabase traffic.
      if (parsedUrl.protocol === "https:") supabaseOrigin = parsedUrl.origin;
    }
  } catch {
    // Invalid/missing configuration must not broaden the policy.
  }
  const realtimeOrigin = supabaseOrigin?.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  const connect = ["'self'", supabaseOrigin, realtimeOrigin].filter(Boolean).join(" ");
  const images = ["'self'", "data:", "blob:", supabaseOrigin].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Existing React and motion components use style attributes/inline styles.
    // Script execution remains nonce-only; style tightening is a separate migration.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${images}`,
    `media-src 'self' blob: ${supabaseOrigin ?? ""}`.trim(),
    `connect-src ${connect}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function addSecurityHeaders(response: Response, request: Request, nonce: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set(
    "permissions-policy",
    "camera=(), geolocation=(), microphone=(self), payment=(), usb=()",
  );
  if (process.env.NODE_ENV === "production") {
    headers.set("content-security-policy", contentSecurityPolicy(nonce, process.env.SUPABASE_URL));
    if (new URL(request.url).protocol === "https:") {
      // Deliberately omit includeSubDomains until every sibling host is confirmed HTTPS-only.
      headers.set("strict-transport-security", "max-age=31536000");
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
