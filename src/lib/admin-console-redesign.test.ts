import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asTestFns, chainable } from "./__testutils__/supabase-mock";
import { setStaff } from "./__testutils__/staff-harness";

vi.mock(
  "./staff-middleware",
  async () => (await import("./__testutils__/staff-harness")).staffMiddlewareMock,
);
vi.mock(
  "@tanstack/react-start",
  async () => (await import("./__testutils__/staff-harness")).startMock,
);
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

const route = (name: string) => readFileSync(`admin/routes/${name}`, "utf8");

describe("a signed-in person missing a scope sees a forbidden card, not the sign-in page", () => {
  it.each([
    ["users.tsx", "Users"],
    ["staff.tsx", "Staff"],
    ["audit.tsx", "Action record"],
    ["support.tsx", "Support"],
    ["reports.tsx", "Reports"],
    ["folders.tsx", "Podcast"],
    ["folder.$id.tsx", "Podcast"],
  ])("%s shows the forbidden card titled %s", (file, title) => {
    expect(route(file)).toContain(`<ForbiddenCard title="${title}"`);
  });
});

describe("the home page", () => {
  it("no longer redirects a signed-in person away", () => {
    const src = route("index.tsx");
    expect(src).not.toContain("homeFor");
    expect(src).toContain("HomeScreen");
    // The only redirect left is the signed-out one.
    expect(src.match(/redirect\(/g)?.length).toBe(1);
    expect(src).toContain('to: "/signin"');
  });

  it("asks for a card's data only when the person holds that card's scope", () => {
    const src = route("index.tsx");
    for (const scope of ["support.read", "numbers.read", "audit.read"]) {
      expect(src).toContain(`has("${scope}")`);
    }
  });
});

describe("the navigation names the person and signs out", () => {
  it("the root passes the display name and a sign-out that leaves for /signin", () => {
    const src = route("__root.tsx");
    expect(src).toContain("<ConsoleFrame");
    expect(src).toContain("signOutAndLeave(supabase.auth");
  });
});

describe("adminWhoAmI returns the display name", () => {
  const OWNER = "00000000-0000-4000-8000-0000000000a1";
  beforeEach(() => setStaff({ [OWNER]: { role: "owner", scopes: [] } }));

  it("reads the caller's own profile name, null when there is none", async () => {
    const mod = await import("./admin.functions");
    const { adminWhoAmI } = asTestFns({ adminWhoAmI: mod.adminWhoAmI });
    const named = { from: vi.fn(() => chainable({ data: { display_name: "Sam" }, error: null })) };
    expect(await adminWhoAmI({ context: { supabaseAdmin: named, userId: OWNER } })).toMatchObject({
      userId: OWNER,
      role: "owner",
      displayName: "Sam",
    });
    const unnamed = { from: vi.fn(() => chainable({ data: null, error: null })) };
    expect(
      (await adminWhoAmI({ context: { supabaseAdmin: unnamed, userId: OWNER } })).displayName,
    ).toBeNull();
  });
});
