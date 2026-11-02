// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

const { Route } = await import("./pro-return");
const realFetch = globalThis.fetch;
let pro = false;

beforeEach(() => {
  vi.useFakeTimers();
  navigate.mockReset();
  pro = false;
  globalThis.fetch = vi.fn(async () => Response.json({ pro })) as unknown as typeof fetch;
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = realFetch;
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("after checkout", () => {
  it("opens Hector as soon as RevenueCat reports Pro", async () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Payment received, activating…")).toBeInTheDocument();
    await advance(4_100);
    expect(navigate).not.toHaveBeenCalled();
    pro = true;
    await advance(2_100);
    expect(navigate).toHaveBeenCalledWith({ to: "/hector" });
  });

  it("keeps polling through RevenueCat errors (503, network) and opens Hector once Pro is active", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      if (call === 1) return Response.json({ error: "entitlement-unavailable" }, { status: 503 });
      if (call === 2) throw new TypeError("network down");
      return Response.json({ pro: call >= 4 });
    }) as unknown as typeof fetch;
    const Page = Route.options.component!;
    render(<Page />);
    await advance(4_100);
    expect(screen.getByText("Payment received, activating…")).toBeInTheDocument();
    expect(screen.queryByText(/failed|error/i)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    await advance(4_100);
    expect(call).toBeGreaterThanOrEqual(4);
    expect(navigate).toHaveBeenCalledWith({ to: "/hector" });
  });

  it("remembers for this session that the learner has just paid", async () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(Number(sessionStorage.getItem("alphonso.pro.justPaidAt"))).toBeGreaterThan(0);
  });

  it("still inactive after 30 s: keeps 'payment received' with a retry, never an error or the paywall", async () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await advance(32_000);
    expect(screen.getByText("Payment received, activating…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText(/failed|error/i)).toBeNull();
    expect(screen.queryByText(/Start free trial|Subscribe/)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    const calls = vi.mocked(globalThis.fetch).mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(14);
    expect(calls).toBeLessThanOrEqual(17);
  });
});
