// Run with `deno test supabase/functions/_shared/fcm.test.ts`. No network:
// every fetch is injected. The RSA key is generated per run so no key
// material sits in the repo.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildFcmAccessToken, sendFcmToTokens } from "./fcm.ts";

async function testPrivateKeyPem(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let binary = "";
  for (const b of pkcs8) binary += String.fromCharCode(b);
  const b64 = btoa(binary).replace(/(.{64})/g, "$1\n");
  return { pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey };
}

function decodeBase64Url(part: string): ArrayBuffer {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - part.length % 4) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

Deno.test("buildFcmAccessToken signs an RS256 JWT with the messaging scope and exchanges it", async () => {
  const { pem, publicKey } = await testPrivateKeyPem();
  let seenUrl = "";
  let seenBody = "";
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    seenUrl = String(url);
    seenBody = String(init?.body);
    return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3599 }), { status: 200 });
  }) as typeof fetch;

  const token = await buildFcmAccessToken(
    { client_email: "svc@project.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.example/token" },
    { fetch: fetchImpl, now: () => 1_758_000_000_000 },
  );
  assertEquals(token, "ya29.test");
  assertEquals(seenUrl, "https://oauth2.example/token");
  const params = new URLSearchParams(seenBody);
  assertEquals(params.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");

  const [h, c, s] = params.get("assertion")!.split(".");
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(h)));
  const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(c)));
  assertEquals(header.alg, "RS256");
  assertEquals(claims.iss, "svc@project.iam.gserviceaccount.com");
  assertEquals(claims.scope, "https://www.googleapis.com/auth/firebase.messaging");
  assertEquals(claims.aud, "https://oauth2.example/token");
  assertEquals(claims.iat, 1_758_000_000);
  assertEquals(claims.exp, 1_758_003_600);
  const verified = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    decodeBase64Url(s),
    new TextEncoder().encode(`${h}.${c}`),
  );
  assertEquals(verified, true, "the signature must verify with the account's public key");
});

Deno.test("sendFcmToTokens counts sends, marks 404 and UNREGISTERED as stale, ignores a thrown fetch", async () => {
  const responses: Record<string, () => Response | never> = {
    "tok-ok": () => new Response("{}", { status: 200 }),
    "tok-404": () => new Response(JSON.stringify({ error: { status: "NOT_FOUND" } }), { status: 404 }),
    "tok-unreg": () =>
      new Response(
        JSON.stringify({ error: { status: "INVALID_ARGUMENT", details: [{ errorCode: "UNREGISTERED" }] } }),
        { status: 400 },
      ),
    "tok-500": () => new Response("{}", { status: 500 }),
    "tok-throw": () => {
      throw new Error("network");
    },
  };
  const bodies: string[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    assertEquals(String(url), "https://fcm.googleapis.com/v1/projects/proj-1/messages:send");
    assertEquals((init?.headers as Record<string, string>)["Authorization"], "Bearer ya29.test");
    const body = String(init?.body);
    bodies.push(body);
    const token = JSON.parse(body).message.token as string;
    return responses[token]();
  }) as typeof fetch;

  const rows = ["tok-ok", "tok-404", "tok-unreg", "tok-500", "tok-throw"].map((token) => ({ id: `id-${token}`, token }));
  const result = await sendFcmToTokens(rows, "Nudged", "A friend nudged you", { type: "nudge", n: 2 }, {
    projectId: "proj-1",
    accessToken: "ya29.test",
  }, { fetch: fetchImpl, now: () => 0 });

  assertEquals(result.sent, 1);
  assertEquals(result.stale.sort(), ["id-tok-404", "id-tok-unreg"]);
  const first = JSON.parse(bodies[0]).message;
  assertEquals(first.notification, { title: "Nudged", body: "A friend nudged you" });
  assertEquals(first.data, { type: "nudge", n: "2" }, "data values are strings on the wire");
  assertStringIncludes(bodies[0], '"priority":"high"');
});
