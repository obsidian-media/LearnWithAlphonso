import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn().mockReturnValue({ from: vi.fn() });
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  createClient.mockClear();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("supabaseAdmin", () => {
  it("lazily creates a real client on first property access", async () => {
    const { supabaseAdmin } = await import("./client.server");
    expect(createClient).not.toHaveBeenCalled();
    void supabaseAdmin.from;
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-key",
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }),
    );
  });

  it("reuses the same client across multiple accesses", async () => {
    const { supabaseAdmin } = await import("./client.server");
    void supabaseAdmin.from;
    void supabaseAdmin.from;
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("throws with a descriptive message when SUPABASE_URL is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.SUPABASE_URL;
    const { supabaseAdmin } = await import("./client.server");
    expect(() => supabaseAdmin.from).toThrow(/SUPABASE_URL/);
  });

  it("throws with a descriptive message when the service role key is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { supabaseAdmin } = await import("./client.server");
    expect(() => supabaseAdmin.from).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
