// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/auth-headers", () => ({
  authHeaders: async () => ({ Authorization: "Bearer t" }),
}));

const { WebPaywall } = await import("./WebPaywall");

const realFetch = globalThis.fetch;
const assign = vi.fn();

function serve(status: number, body: unknown) {
  globalThis.fetch = vi.fn(async () => Response.json(body, { status })) as unknown as typeof fetch;
}

beforeEach(() => {
  assign.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign },
  });
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("WebPaywall", () => {
  it("shows no number when the server has no price for this learner's country", async () => {
    serve(200, {
      price: null,
      period: "month",
      trialDays: 7,
      purchaseUrl: "https://pay.rev.cat/tok/u1?x=1",
    });
    render(<WebPaywall source="hector_tab" />);
    expect(
      await screen.findByText("Monthly plan, priced in your currency at checkout"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Free for 7 days, then the monthly price shown at checkout"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start free trial" })).toBeInTheDocument();
  });

  it("asks for the offer with its source and shows RevenueCat's price, trial and disclosure", async () => {
    serve(200, {
      price: "CA$12.99",
      period: "month",
      trialDays: 7,
      purchaseUrl: "https://pay.rev.cat/tok/u1?x=1",
    });
    render(<WebPaywall source="practice_hector_card" />);
    expect(await screen.findByText("CA$12.99 / month")).toBeInTheDocument();
    expect(screen.getByText("Free for 7 days, then CA$12.99/month")).toBeInTheDocument();
    expect(
      screen.getByText(
        /After the free trial, Alphonso Pro renews automatically at CA\$12\.99\/month/,
      ),
    ).toBeInTheDocument();
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toBe(
      "/api/pro-offering?source=practice_hector_card",
    );
    expect(screen.getByText("Meet Hector, your AI tutor")).toBeInTheDocument();
  });

  it("the button goes to this learner's checkout link", async () => {
    serve(200, {
      price: "$9.99",
      period: "month",
      trialDays: 7,
      purchaseUrl: "https://pay.rev.cat/tok/u1?x=1",
    });
    render(<WebPaywall source="hector_tab" />);
    await userEvent.click(await screen.findByRole("button", { name: "Start free trial" }));
    expect(assign).toHaveBeenCalledWith("https://pay.rev.cat/tok/u1?x=1");
  });

  it("no trial: says Subscribe and shows no trial line", async () => {
    serve(200, {
      price: "$9.99",
      period: "month",
      trialDays: null,
      purchaseUrl: "https://pay.rev.cat/p/u1",
    });
    render(<WebPaywall source="hector_tab" />);
    expect(await screen.findByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    expect(screen.queryByText(/Free for/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Start free trial" })).toBeNull();
  });

  it("when the offer cannot load: the iPhone's error, a retry, and no price at all", async () => {
    serve(503, { error: "offering-unavailable" });
    render(<WebPaywall source="hector_tab" />);
    expect(
      await screen.findByText(
        "Couldn't load subscription options. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\d/)).toBeNull();
    serve(200, {
      price: "$9.99",
      period: "month",
      trialDays: null,
      purchaseUrl: "https://pay.rev.cat/p/u1",
    });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("$9.99 / month")).toBeInTheDocument());
  });
});
