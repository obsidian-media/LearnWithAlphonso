import { describe, expect, it } from "vitest";
import { hectorRevocationConfigFromEnv, revokeHectorLink } from "./hector-revocation";

describe("hectorRevocationConfigFromEnv", () => {
  it("returns null when either setting is missing", () => {
    expect(
      hectorRevocationConfigFromEnv({ HECTOR_VOICE_SHARED_SECRET: "s" } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      hectorRevocationConfigFromEnv({ HECTOR_VOICE_REVOKE_URL: "https://x" } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(hectorRevocationConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("returns the config when both settings are present", () => {
    const config = hectorRevocationConfigFromEnv({
      HECTOR_VOICE_REVOKE_URL: "https://voice.example/v1/revoke",
      HECTOR_VOICE_SHARED_SECRET: "shh",
    } as NodeJS.ProcessEnv);
    expect(config).toEqual({ revokeUrl: "https://voice.example/v1/revoke", sharedSecret: "shh" });
  });
});

describe("revokeHectorLink", () => {
  const CONFIG = { revokeUrl: "https://voice.example/v1/revoke", sharedSecret: "shh" };

  it("reports success when the endpoint accepts", async () => {
    const fake = (async () => new Response("", { status: 200 })) as typeof fetch;
    expect(await revokeHectorLink(CONFIG, "cv-user-1", fake)).toBe(true);
  });

  it("reports failure rather than throwing when the endpoint rejects", async () => {
    const fake = (async () => new Response("", { status: 404 })) as typeof fetch;
    expect(await revokeHectorLink(CONFIG, "cv-user-1", fake)).toBe(false);
  });

  it("reports failure rather than throwing when the network is down", async () => {
    // The property that matters: a user's right to delete their account
    // cannot depend on a second product's endpoint being reachable --
    // or existing at all yet. This must resolve, never reject.
    const fake = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    await expect(revokeHectorLink(CONFIG, "cv-user-1", fake)).resolves.toBe(false);
  });

  it("sends the shared secret and the cloud voice user id the contract expects", async () => {
    let sentAuth: string | null = null;
    let sentBody: string | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      sentAuth = (init?.headers as Record<string, string>)?.Authorization ?? null;
      sentBody = init?.body as string;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    await revokeHectorLink(CONFIG, "cv-user-42", fake);

    expect(sentAuth).toBe("Bearer shh");
    expect(JSON.parse(sentBody!)).toEqual({ cloud_voice_user_id: "cv-user-42" });
  });
});
