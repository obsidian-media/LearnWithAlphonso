// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AiConsent } from "../lib/ai-consent-context";

let current: AiConsent;
vi.mock("../lib/ai-consent-context", () => ({ useAiConsent: () => current }));
vi.mock("@/lib/ai-consent-context", () => ({ useAiConsent: () => current }));

const { AiConsentGate } = await import("./AiConsentGate");

const consent = (over: Partial<AiConsent>): AiConsent => ({
  status: "denied",
  grantedAt: null,
  granted: false,
  requestConsent: vi.fn().mockResolvedValue(true),
  setConsent: vi.fn(),
  markWithdrawn: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
  ...over,
});

afterEach(cleanup);

describe("AiConsentGate", () => {
  it("does not mount the screen before consent has ever been seen, and offers Review and allow", () => {
    current = consent({});
    render(
      <AiConsentGate backTo="/learn">
        <p>The conversation</p>
      </AiConsentGate>,
    );
    expect(screen.queryByText("The conversation")).toBeNull();
    expect(screen.getByText("AI practice is off")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review and allow" }));
    expect(current.requestConsent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/learn");
  });

  it("shows the screen once consent is granted", () => {
    current = consent({ status: "granted", granted: true });
    render(
      <AiConsentGate backTo="/learn">
        <p>The conversation</p>
      </AiConsentGate>,
    );
    expect(screen.getByText("The conversation")).toBeInTheDocument();
    expect(screen.queryByText("AI practice is off")).toBeNull();
  });

  it("keeps the screen mounted, inert, under the prompt when consent is withdrawn later", () => {
    current = consent({ status: "granted", granted: true });
    const view = render(
      <AiConsentGate backTo="/learn">
        <p>The conversation</p>
      </AiConsentGate>,
    );
    current = consent({});
    view.rerender(
      <AiConsentGate backTo="/learn">
        <p>The conversation</p>
      </AiConsentGate>,
    );
    expect(screen.getByText("The conversation")).toBeInTheDocument();
    expect(screen.getByText("The conversation").closest("[inert]")).not.toBeNull();
    expect(screen.getByText("AI practice is off")).toBeInTheDocument();
  });

  it("says the check failed, with Try again, when the status is unknown", () => {
    current = consent({ status: "unknown" });
    render(
      <AiConsentGate backTo="/learn">
        <p>The conversation</p>
      </AiConsentGate>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't check your AI setting");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(current.refresh).toHaveBeenCalledTimes(1);
  });

  it("says Loading while the first read is out", () => {
    current = consent({ status: "loading" });
    render(
      <AiConsentGate backTo="/learn">
        <p>The conversation</p>
      </AiConsentGate>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(screen.queryByText("The conversation")).toBeNull();
  });
});
