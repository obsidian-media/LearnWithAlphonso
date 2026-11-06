import { afterEach, describe, expect, it } from "vitest";
import {
  ANDROID_STORE_URL_DEFAULT,
  appUpdateConfigFromEnv,
  needsUpdate,
  parseMinBuild,
} from "./app-update-gate";

describe("the app update gate", () => {
  it("is off by default: no minimum for either platform", () => {
    expect(appUpdateConfigFromEnv({})).toEqual({
      ios: { minBuild: null, storeUrl: null },
      android: { minBuild: null, storeUrl: ANDROID_STORE_URL_DEFAULT },
    });
  });

  it("reads only positive whole numbers as a minimum; anything else leaves the gate off", () => {
    expect(parseMinBuild("59")).toBe(59);
    expect(parseMinBuild(" 59 ")).toBe(59);
    for (const bad of [undefined, "", "0", "-3", "59.5", "abc", "1e3", "99999999999999999999"]) {
      expect(parseMinBuild(bad), String(bad)).toBeNull();
    }
  });

  it("takes the store links only as https", () => {
    const c = appUpdateConfigFromEnv({
      APP_MIN_IOS_BUILD: "59",
      APP_IOS_STORE_URL: "https://apps.apple.com/app/id1",
      APP_MIN_ANDROID_VERSION_CODE: "12",
      APP_ANDROID_STORE_URL: "javascript:alert(1)",
    });
    expect(c.ios).toEqual({ minBuild: 59, storeUrl: "https://apps.apple.com/app/id1" });
    expect(c.android).toEqual({ minBuild: 12, storeUrl: ANDROID_STORE_URL_DEFAULT });
  });

  it("blocks only a known build strictly below the minimum", () => {
    expect(needsUpdate(58, 59)).toBe(true);
    expect(needsUpdate(59, 59)).toBe(false);
    expect(needsUpdate(60, 59)).toBe(false);
    expect(needsUpdate(1, null)).toBe(false);
    expect(needsUpdate(null, 59)).toBe(false);
  });
});

describe("GET /api/app-config", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("serves the configured gate publicly, without a session", async () => {
    process.env.APP_MIN_IOS_BUILD = "59";
    delete process.env.APP_MIN_ANDROID_VERSION_CODE;
    const { Route } = await import("../routes/api/app-config");
    const GET = (Route.options.server!.handlers as unknown as { GET: () => Promise<Response> }).GET;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ios: { minBuild: number }; android: { minBuild: null } };
    expect(body.ios.minBuild).toBe(59);
    expect(body.android.minBuild).toBeNull();
  });
});
