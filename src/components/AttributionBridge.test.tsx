// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession, onAuthStateChange } },
}));

const recordSignupAttribution = vi.fn();
vi.mock("@/lib/signup-attribution.functions", () => ({
  recordSignupAttribution: (args: unknown) => recordSignupAttribution(args),
}));

const { AttributionBridge } = await import("./AttributionBridge");
const { ATTRIBUTION_KEY } = await import("@/lib/signup-attribution");
const CONSENT_KEY = "lingua.cookie-consent.v1";

function setUrl(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  getSession.mockReset();
  onAuthStateChange.mockReset();
  unsubscribe.mockReset();
  recordSignupAttribution.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
  recordSignupAttribution.mockResolvedValue({ result: "recorded" });
  setUrl("");
});

describe("AttributionBridge", () => {
  it("renders nothing and unsubscribes on unmount", () => {
    const { container, unmount } = render(<AttributionBridge />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("holds tags in sessionStorage before the visitor answers the banner, and sends nothing", async () => {
    setUrl("?utm_source=r_testflight&utm_medium=post&utm_campaign=beta1");
    getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
    render(<AttributionBridge />);
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(window.sessionStorage.getItem(ATTRIBUTION_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(ATTRIBUTION_KEY)).toBeNull();
    expect(recordSignupAttribution).not.toHaveBeenCalled();
  });

  it("with Accept all and a signed-in session, sends the tags once and clears them", async () => {
    window.localStorage.setItem(CONSENT_KEY, "all");
    setUrl("?utm_source=site&utm_medium=button&utm_campaign=beta1");
    getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
    render(<AttributionBridge />);
    await waitFor(() => expect(recordSignupAttribution).toHaveBeenCalledTimes(1));
    expect(recordSignupAttribution.mock.calls[0]![0]).toMatchObject({
      data: { source: "site", medium: "button", campaign: "beta1" },
    });
    await waitFor(() => expect(window.localStorage.getItem(ATTRIBUTION_KEY)).toBeNull());
  });

  it("sends after a later SIGNED_IN event (sign-up completes after the landing page)", async () => {
    window.localStorage.setItem(CONSENT_KEY, "all");
    setUrl("?utm_source=site&utm_medium=button&utm_campaign=beta1");
    render(<AttributionBridge />);
    expect(recordSignupAttribution).not.toHaveBeenCalled();
    const handler = onAuthStateChange.mock.calls[0]![0] as (e: string, s: unknown) => void;
    handler("TOKEN_REFRESHED", { access_token: "t" });
    expect(recordSignupAttribution).not.toHaveBeenCalled();
    handler("SIGNED_IN", { access_token: "t" });
    await waitFor(() => expect(recordSignupAttribution).toHaveBeenCalledTimes(1));
  });

  it("sends nothing and stores nothing after Essential only", async () => {
    window.localStorage.setItem(CONSENT_KEY, "essential");
    setUrl("?utm_source=site&utm_medium=button&utm_campaign=beta1");
    getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
    render(<AttributionBridge />);
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(window.localStorage.getItem(ATTRIBUTION_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(ATTRIBUTION_KEY)).toBeNull();
    expect(recordSignupAttribution).not.toHaveBeenCalled();
  });
});
