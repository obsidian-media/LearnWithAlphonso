// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useEffect } from "react";

let siteKey: string | undefined = "site-key";
vi.mock("@/lib/turnstile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/turnstile")>()),
  turnstileSiteKey: () => siteKey,
}));

// The widget hands over a token per render (resetKey changes render a new one), and null first, like the real one.
let mounts = 0;
let widget: "token" | "silent" | "load-failed" = "token";
vi.mock("@/components/TurnstileWidget", () => ({
  TurnstileWidget: ({
    onToken,
    resetKey,
    onLoadFailed,
  }: {
    onToken: (t: string | null) => void;
    resetKey: number;
    onLoadFailed?: () => void;
  }) => {
    useEffect(() => {
      mounts += 1;
      onToken(null);
      if (widget === "token") onToken(`token-${resetKey}`);
      if (widget === "load-failed") {
        onToken(null);
        onLoadFailed?.();
      }
    }, [onToken, resetKey, onLoadFailed]);
    return <div data-testid="turnstile" />;
  },
}));

const { Route } = await import("./native-captcha");
const Page = Route.options.component!;

type W = {
  webkit?: unknown;
  AlphonsoCaptcha?: unknown;
  alphonsoCaptchaReset?: () => void;
};
const w = window as unknown as W;
let ios: unknown[];
let android: string[];

beforeEach(() => {
  siteKey = "site-key";
  widget = "token";
  mounts = 0;
  ios = [];
  android = [];
  w.webkit = { messageHandlers: { alphonsoCaptcha: { postMessage: (m: unknown) => ios.push(m) } } };
  w.AlphonsoCaptcha = { post: (json: string) => android.push(json) };
});
afterEach(() => {
  delete w.webkit;
  delete w.AlphonsoCaptcha;
});

describe("/native-captcha (the apps' bot check page)", () => {
  it("hands each token to the iOS and the Android app", () => {
    render(<Page />);
    expect(ios).toEqual([{ type: "token", token: "token-0" }]);
    expect(android.map((j) => JSON.parse(j))).toEqual(ios);
  });

  it("renders a fresh widget (a new single-use token) when the app asks for a reset", () => {
    render(<Page />);
    act(() => w.alphonsoCaptchaReset!());
    expect(mounts).toBe(2);
    expect(ios.at(-1)).toEqual({ type: "token", token: "token-1" });
  });

  it("says nothing until there is a token, so the app's timeout still covers a check that never loads", () => {
    widget = "silent";
    render(<Page />);
    expect(ios).toEqual([]);
    expect(android).toEqual([]);
  });

  it("tells the app there is no bot check when Turnstile cannot load", () => {
    widget = "load-failed";
    render(<Page />);
    expect(ios).toEqual([{ type: "unavailable" }]);
  });

  it("without a site key it tells the app there is no bot check, and shows nothing", () => {
    siteKey = undefined;
    const { container } = render(<Page />);
    expect(ios).toEqual([{ type: "unavailable" }]);
    expect(container.innerHTML).toBe("");
  });

  it("is harmless in a normal browser with no app bridge", () => {
    delete w.webkit;
    delete w.AlphonsoCaptcha;
    expect(() => render(<Page />)).not.toThrow();
  });
});
