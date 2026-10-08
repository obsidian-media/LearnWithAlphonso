// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeConsentApi, withAiConsent } from "@/lib/__testutils__/ai-consent";
import { AiFeaturesSetting } from "./AiFeaturesSetting";

vi.mock("@/lib/ai-consent.functions", () => ({ getAiConsent: vi.fn(), setAiConsent: vi.fn() }));
afterEach(cleanup);

describe("AiFeaturesSetting", () => {
  it("shows the current state", async () => {
    render(withAiConsent(<AiFeaturesSetting />, fakeConsentApi("2026-10-09T10:00:00Z")));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "AI features" })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
  });

  it("turning it off withdraws at once, with no sheet", async () => {
    const api = fakeConsentApi("2026-10-09T10:00:00Z");
    const user = userEvent.setup();
    render(withAiConsent(<AiFeaturesSetting />, api));
    const toggle = await screen.findByRole("switch", { name: "AI features" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(api.setCalls).toEqual([false]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("turning it on goes through the consent sheet", async () => {
    const api = fakeConsentApi(null);
    const user = userEvent.setup();
    render(withAiConsent(<AiFeaturesSetting />, api));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "AI features" })).not.toBeDisabled(),
    );
    await user.click(screen.getByRole("switch", { name: "AI features" }));
    expect(api.setCalls).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(api.setCalls).toEqual([true]));
  });

  it("offers a retry, not an Off switch, when the setting cannot be read", async () => {
    let fail = true;
    const api = fakeConsentApi("2026-10-09T10:00:00Z");
    api.get = async () => {
      if (fail) throw new Error("offline");
      return "2026-10-09T10:00:00Z";
    };
    const user = userEvent.setup();
    render(withAiConsent(<AiFeaturesSetting />, { ...api, initial: undefined }));
    expect(await screen.findByText("Couldn't check your AI setting")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "AI features" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "AI features" })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
  });
});
