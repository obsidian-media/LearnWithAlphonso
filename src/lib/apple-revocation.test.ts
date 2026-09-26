import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appleConfigFromEnv,
  buildClientSecret,
  exchangeAuthorizationCode,
  revokeAppleGrant,
  type AppleConfig,
} from "./apple-revocation";

/** A real P-256 key, so the signature assertions verify rather than pretend. */
const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const CONFIG: AppleConfig = {
  teamId: "TEAM123456",
  keyId: "KEY1234567",
  privateKey,
  clientId: "com.obsidianmedia.learnwithalphonso",
};

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

describe("appleConfigFromEnv", () => {
  const full = {
    APPLE_TEAM_ID: "T",
    APPLE_KEY_ID: "K",
    APPLE_PRIVATE_KEY: "P",
    APPLE_CLIENT_ID: "C",
  };

  it("returns null when any single setting is missing", () => {
    for (const key of Object.keys(full)) {
      const partial = { ...full, [key]: undefined } as NodeJS.ProcessEnv;
      expect(appleConfigFromEnv(partial), `missing ${key} should disable revocation`).toBeNull();
    }
  });

  it("restores newlines flattened by a secrets store", () => {
    // The commonest deployment failure: the PEM arrives with literal \n and
    // the key silently fails to parse later, far from here.
    const config = appleConfigFromEnv({
      ...full,
      APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
    } as NodeJS.ProcessEnv);
    expect(config?.privateKey).toContain("\n");
    expect(config?.privateKey).not.toContain("\\n");
  });
});

describe("buildClientSecret", () => {
  it("produces a JWT Apple's documented claims accept", () => {
    const now = 1_790_000_000;
    const [header, payload] = buildClientSecret(CONFIG, now).split(".");
    expect(decodeSegment(header!)).toEqual({ alg: "ES256", kid: CONFIG.keyId, typ: "JWT" });
    expect(decodeSegment(payload!)).toMatchObject({
      iss: CONFIG.teamId,
      sub: CONFIG.clientId,
      aud: "https://appleid.apple.com",
      iat: now,
    });
  });

  it("expires in the future and inside Apple's 6-month ceiling", () => {
    const now = 1_790_000_000;
    const { iat, exp } = decodeSegment(buildClientSecret(CONFIG, now).split(".")[1]!) as {
      iat: number;
      exp: number;
    };
    expect(exp).toBeGreaterThan(iat);
    expect(exp - iat).toBeLessThan(60 * 60 * 24 * 180);
  });

  it("signs with a raw r||s signature, not DER", () => {
    // The failure this guards is specific and opaque: Node signs DER by
    // default, JOSE requires ieee-p1363, and Apple answers `invalid_client`
    // without saying the encoding is wrong. A P-256 JOSE signature is
    // always exactly 64 bytes; DER is variable-length and longer.
    const [h, p, sig] = buildClientSecret(CONFIG).split(".");
    expect(Buffer.from(sig!, "base64url")).toHaveLength(64);

    const verified = createVerify("SHA256")
      .update(`${h}.${p}`)
      .verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig!, "base64url"));
    expect(verified).toBe(true);
  });
});

describe("exchangeAuthorizationCode", () => {
  it("returns the refresh token Apple issues", async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ refresh_token: "rt_abc" }), { status: 200 })) as typeof fetch;
    expect(await exchangeAuthorizationCode(CONFIG, "code", fake)).toBe("rt_abc");
  });

  it("returns null when Apple rejects the code", async () => {
    const fake = (async () => new Response("{}", { status: 400 })) as typeof fetch;
    expect(await exchangeAuthorizationCode(CONFIG, "code", fake)).toBeNull();
  });

  it("returns null when the response omits a refresh token", async () => {
    // Apple can answer 200 with only an access token. Treating that as
    // success would store `undefined` and produce a revocation that silently
    // does nothing later.
    const fake = (async () =>
      new Response(JSON.stringify({ access_token: "at" }), { status: 200 })) as typeof fetch;
    expect(await exchangeAuthorizationCode(CONFIG, "code", fake)).toBeNull();
  });

  it("sends the grant Apple expects", async () => {
    let sent: URLSearchParams | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      sent = init?.body as URLSearchParams;
      return new Response(JSON.stringify({ refresh_token: "rt" }), { status: 200 });
    }) as unknown as typeof fetch;
    await exchangeAuthorizationCode(CONFIG, "the-code", fake);
    expect(sent?.get("grant_type")).toBe("authorization_code");
    expect(sent?.get("code")).toBe("the-code");
    expect(sent?.get("client_id")).toBe(CONFIG.clientId);
    expect(sent?.get("client_secret")).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });
});

describe("revokeAppleGrant", () => {
  it("reports success when Apple accepts", async () => {
    const fake = (async () => new Response("", { status: 200 })) as typeof fetch;
    expect(await revokeAppleGrant(CONFIG, "rt", fake)).toBe(true);
  });

  it("reports failure rather than throwing when Apple rejects", async () => {
    const fake = (async () => new Response("", { status: 400 })) as typeof fetch;
    expect(await revokeAppleGrant(CONFIG, "rt", fake)).toBe(false);
  });

  it("reports failure rather than throwing when the network is down", async () => {
    // The property that matters: a user's right to delete their account
    // cannot depend on Apple being reachable. This must resolve, never
    // reject, or a network blip becomes a refused deletion.
    const fake = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    await expect(revokeAppleGrant(CONFIG, "rt", fake)).resolves.toBe(false);
  });

  it("hints the token type, which Apple needs to revoke the whole grant", async () => {
    let sent: URLSearchParams | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      sent = init?.body as URLSearchParams;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    await revokeAppleGrant(CONFIG, "rt_xyz", fake);
    expect(sent?.get("token")).toBe("rt_xyz");
    expect(sent?.get("token_type_hint")).toBe("refresh_token");
  });
});
