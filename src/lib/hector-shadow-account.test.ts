import { describe, expect, it } from "vitest";
import { hectorShadowAccountConfigFromEnv, provisionShadowAccount } from "./hector-shadow-account";

describe("hectorShadowAccountConfigFromEnv", () => {
  it("returns null when either setting is missing", () => {
    expect(
      hectorShadowAccountConfigFromEnv({ HECTOR_VOICE_SHARED_SECRET: "s" } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      hectorShadowAccountConfigFromEnv({
        HECTOR_VOICE_LINK_ACCOUNT_URL: "https://x",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("returns the config when both settings are present", () => {
    const config = hectorShadowAccountConfigFromEnv({
      HECTOR_VOICE_LINK_ACCOUNT_URL: "https://voice.example/v1/link",
      HECTOR_VOICE_SHARED_SECRET: "shh",
    } as NodeJS.ProcessEnv);
    expect(config).toEqual({
      linkAccountUrl: "https://voice.example/v1/link",
      sharedSecret: "shh",
    });
  });
});

describe("provisionShadowAccount", () => {
  const CONFIG = { linkAccountUrl: "https://voice.example/v1/link", sharedSecret: "shh" };

  it("returns the session RevenueCat-gated Cloud Voice hands back", async () => {
    const fake = (async () =>
      new Response(
        JSON.stringify({ cloud_voice_user_id: "cv-1", access_token: "at", refresh_token: "rt" }),
        { status: 200 },
      )) as typeof fetch;
    expect(await provisionShadowAccount(CONFIG, "main-user-1", fake)).toEqual({
      cloudVoiceUserId: "cv-1",
      accessToken: "at",
      refreshToken: "rt",
    });
  });

  it("returns null rather than throwing when Cloud Voice refuses", async () => {
    const fake = (async () => new Response("{}", { status: 503 })) as typeof fetch;
    expect(await provisionShadowAccount(CONFIG, "main-user-1", fake)).toBeNull();
  });

  it("returns null when the response is missing a required field", async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ cloud_voice_user_id: "cv-1" }), {
        status: 200,
      })) as typeof fetch;
    expect(await provisionShadowAccount(CONFIG, "main-user-1", fake)).toBeNull();
  });

  it("returns null rather than throwing when the network is down", async () => {
    const fake = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    await expect(provisionShadowAccount(CONFIG, "main-user-1", fake)).resolves.toBeNull();
  });

  it("sends the caller's main app user id and the shared secret the contract expects", async () => {
    let sentAuth: string | null = null;
    let sentBody: string | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      sentAuth = (init?.headers as Record<string, string>)?.Authorization ?? null;
      sentBody = init?.body as string;
      return new Response(
        JSON.stringify({ cloud_voice_user_id: "cv-1", access_token: "at", refresh_token: "rt" }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await provisionShadowAccount(CONFIG, "main-user-42", fake);

    expect(sentAuth).toBe("Bearer shh");
    expect(JSON.parse(sentBody!)).toEqual({ main_app_user_id: "main-user-42" });
  });
});
