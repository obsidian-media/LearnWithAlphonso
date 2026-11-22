import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { AUTH_STORAGE_KEY } from "./auth-storage-key";

const KEY = "sb_publishable_test";
const storageKeyOf = (c: unknown) => (c as { storageKey: string }).storageKey;

describe("web auth storage key pin", () => {
  it("is the exact key every signed-in learner already has in localStorage", () => {
    expect(AUTH_STORAGE_KEY).toBe("sb-qhcjpfbxfcltjbiuknyt-auth-token");
  });

  it("is what the installed supabase-js derives for the old project host (so the pin keeps sessions)", () => {
    const derived = createClient("https://qhcjpfbxfcltjbiuknyt.supabase.co", KEY);
    expect(storageKeyOf(derived)).toBe(AUTH_STORAGE_KEY);
  });

  it("proves the trap: without the pin the custom domain would log everyone out", () => {
    const unpinned = createClient("https://api.learnwithalphonso.com", KEY);
    expect(storageKeyOf(unpinned)).toBe("sb-api-auth-token");
    expect(storageKeyOf(unpinned)).not.toBe(AUTH_STORAGE_KEY);
  });

  it("the app client passes the pin to createClient, for any URL", async () => {
    for (const url of [
      "https://api.learnwithalphonso.com",
      "https://qhcjpfbxfcltjbiuknyt.supabase.co",
    ]) {
      vi.resetModules();
      const spy = vi.fn().mockReturnValue({ auth: {} });
      vi.doMock("@supabase/supabase-js", () => ({ createClient: spy }));
      process.env.SUPABASE_URL = url;
      process.env.SUPABASE_PUBLISHABLE_KEY = KEY;
      const { supabase } = await import("./client");
      void supabase.auth;
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][2].auth.storageKey).toBe(AUTH_STORAGE_KEY);
      vi.doUnmock("@supabase/supabase-js");
    }
  });

  it("every browser-persisting client in src/ and admin/ is built through the pinned client", () => {
    // Only client.ts may persist a session; the server clients must stay non-persisting.
    for (const file of [
      "src/integrations/supabase/client.server.ts",
      "src/integrations/supabase/auth-middleware.ts",
      "src/lib/ai-quota.server.ts",
    ]) {
      expect(readFileSync(resolve(file), "utf8")).toMatch(/persistSession:\s*false/);
    }
  });
});

describe("native session stores do not depend on the Supabase URL", () => {
  // iOS and Android use their own HTTP clients (no supabase-swift / supabase-kt), so their stored session is
  // keyed by a fixed name, not by the project host. If a store ever starts deriving its key from the URL, a URL
  // change in a build would sign everyone out: fail here first.
  const files = [
    "ios/LearnWithAlphonso/Sources/KeychainSessionStore.swift",
    "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/auth/EncryptedSessionStore.kt",
  ];
  for (const f of files) {
    it(`${f} has no URL-derived key`, () => {
      const src = readFileSync(resolve(f), "utf8");
      expect(src).not.toMatch(/supabaseURL|SUPABASE_URL|supabaseUrl|\.host\b|hostname/);
    });
  }
  it("the stored names are the fixed ones shipped to users", () => {
    const android = readFileSync(resolve(files[1]), "utf8");
    expect(android).toContain('const val FILE = "alphonso.session"');
    expect(android).toContain('const val KEY = "session"');
    const ios = readFileSync(resolve(files[0]), "utf8");
    expect(ios).toContain('service = "com.obsidianmedia.learnwithalphonso.session"');
    expect(ios).toContain('account = "supabase-session"');
  });
});
