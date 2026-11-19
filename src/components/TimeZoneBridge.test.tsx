// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession, onAuthStateChange } },
}));
const setTimeZone = vi.fn();
vi.mock("@/lib/profile.functions", () => ({ setTimeZone: (a: unknown) => setTimeZone(a) }));

const { TimeZoneBridge } = await import("./TimeZoneBridge");

beforeEach(() => {
  window.localStorage.clear();
  getSession.mockReset();
  onAuthStateChange.mockReset();
  setTimeZone.mockReset();
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  setTimeZone.mockResolvedValue({ timeZone: "x" });
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    timeZone: "Europe/Paris",
  } as Intl.ResolvedDateTimeFormatOptions);
});

describe("TimeZoneBridge", () => {
  it("sends the browser zone once for a signed-in session, and not on the next mount", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    const first = render(<TimeZoneBridge />);
    await waitFor(() => expect(setTimeZone).toHaveBeenCalledTimes(1));
    expect(setTimeZone).toHaveBeenCalledWith({ data: { timeZone: "Europe/Paris" } });
    first.unmount();
    render(<TimeZoneBridge />);
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(2));
    // Let the second mount's getSession().then() run (and its send, if the cache were ignored) before asserting.
    await getSession.mock.results[1]!.value;
    await new Promise((r) => setTimeout(r, 20));
    expect(setTimeZone).toHaveBeenCalledTimes(1);
  });

  it("sends nothing while signed out", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<TimeZoneBridge />);
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(setTimeZone).not.toHaveBeenCalled();
  });

  it("sends on a SIGNED_IN event", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<TimeZoneBridge />);
    const cb = onAuthStateChange.mock.calls[0]![0] as (e: string, s: unknown) => void;
    cb("SIGNED_IN", { user: { id: "u9" } });
    await waitFor(() => expect(setTimeZone).toHaveBeenCalledTimes(1));
  });
});
