// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiConsentGate } from "@/components/AiConsentGate";
import { fakeConsentApi } from "./__testutils__/ai-consent";
import { AiConsentProvider, isAiConsentRequired, useAiConsent } from "./ai-consent-context";

vi.mock("./ai-consent.functions", () => ({ getAiConsent: vi.fn(), setAiConsent: vi.fn() }));
afterEach(cleanup);

function Feature() {
  const consent = useAiConsent();
  return (
    <div>
      <p>feature content</p>
      <button type="button" onClick={consent.markWithdrawn}>
        simulate 403
      </button>
    </div>
  );
}

function renderGate(api: ReturnType<typeof fakeConsentApi>) {
  return render(
    <AiConsentProvider api={api}>
      <AiConsentGate backTo="/converse">
        <Feature />
      </AiConsentGate>
    </AiConsentProvider>,
  );
}

describe("AiConsentGate", () => {
  it("shows the feature at once for a learner who consented anywhere (no sheet)", async () => {
    const api = fakeConsentApi("2026-10-09T10:00:00Z");
    renderGate(api);
    expect(await screen.findByText("feature content")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.setCalls).toEqual([]);
  });

  it("without consent shows the gate, and Allow records consent then shows the feature", async () => {
    const api = fakeConsentApi(null);
    const user = userEvent.setup();
    renderGate(api);
    await user.click(await screen.findByRole("button", { name: "Review and allow" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Deepgram");
    await user.click(screen.getByRole("button", { name: "Allow" }));
    expect(await screen.findByText("feature content")).toBeInTheDocument();
    expect(api.setCalls).toEqual([true]);
  });

  it("Not now records nothing and keeps the gate", async () => {
    const api = fakeConsentApi(null);
    const user = userEvent.setup();
    renderGate(api);
    await user.click(await screen.findByRole("button", { name: "Review and allow" }));
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("feature content")).toBeNull();
    expect(api.setCalls).toEqual([]);
  });

  it("a 403 ai-consent-required flips the page back to the gate", async () => {
    const user = userEvent.setup();
    renderGate(fakeConsentApi("2026-10-09T10:00:00Z"));
    await user.click(await screen.findByRole("button", { name: "simulate 403" }));
    expect(await screen.findByRole("button", { name: "Review and allow" })).toBeInTheDocument();
  });

  it("a failed save shows an error and stays open", async () => {
    const api = fakeConsentApi(null);
    api.set = async () => {
      throw new Error("offline");
    };
    const user = userEvent.setup();
    renderGate(api);
    await user.click(await screen.findByRole("button", { name: "Review and allow" }));
    await user.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save your choice"),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a failed read never shows the consent sheet on its own", async () => {
    const api = fakeConsentApi(null);
    api.get = async () => {
      throw new Error("offline");
    };
    renderGate(api);
    expect(await screen.findByRole("button", { name: "Review and allow" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("isAiConsentRequired", () => {
  it("recognises only the 403 consent code", async () => {
    expect(
      await isAiConsentRequired(Response.json({ error: "ai-consent-required" }, { status: 403 })),
    ).toBe(true);
    expect(
      await isAiConsentRequired(Response.json({ error: "not-entitled" }, { status: 403 })),
    ).toBe(false);
    expect(
      await isAiConsentRequired(Response.json({ error: "ai-consent-required" }, { status: 400 })),
    ).toBe(false);
    expect(
      await isAiConsentRequired(Response.json({ error: "consent-check-failed" }, { status: 503 })),
    ).toBe(false);
  });
});
