// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/auth-headers", () => ({ authHeaders: async () => ({}) }));
vi.mock("@/lib/leaderboard.functions", () => ({ getMyProfile: async () => null }));
const { HectorInvite } = await import("./HectorInvite");

const realFetch = globalThis.fetch;
let status: { code: number; body: unknown };
const urls: string[] = [];

beforeEach(() => {
  urls.length = 0;
  status = { code: 200, body: { pro: false, store: null, trialEligible: true, manageUrl: null } };
  globalThis.fetch = vi.fn(async (input: string) => {
    urls.push(String(input));
    if (String(input).startsWith("/api/pro-offering")) {
      // Test fixture: a made-up offer.
      return Response.json({
        plans: [
          {
            price: "$9.99",
            amountMicros: 9_990_000,
            currency: "USD",
            period: "month",
            trialDays: 7,
            purchaseUrl: "https://pay.rev.cat/t/u",
          },
        ],
      });
    }
    return Response.json(status.body, { status: status.code });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("HectorInvite", () => {
  it("Practice card: shown to a learner without Pro, and opens the paywall with its source", async () => {
    render(<HectorInvite source="practice_hector_card" />);
    const card = await screen.findByRole("button", { name: /Practice speaking with Hector/ });
    expect(
      screen.getByText(
        "A voice tutor that remembers your level and weak spots. Part of Alphonso Pro.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(card);
    const sheet = await screen.findByRole("dialog", { name: "Alphonso Pro" });
    expect(await within(sheet).findByText("$9.99 a month after the trial")).toBeInTheDocument();
    expect(urls).toContain("/api/pro-offering?source=practice_hector_card");
  });

  it("the paywall opens over the page, takes focus, and Close or Escape gives the page back", async () => {
    render(<HectorInvite source="practice_hector_card" />);
    const card = await screen.findByRole("button", { name: /Practice speaking with Hector/ });
    await userEvent.click(card);
    const close = await screen.findByRole("button", { name: "Close" });
    expect(close).toHaveFocus();
    await userEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(card).toHaveFocus();
    await userEvent.click(card);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the open paywall keeps Tab inside and locks the page from scrolling until it closes", async () => {
    render(<HectorInvite source="practice_hector_card" />);
    const card = await screen.findByRole("button", { name: /Practice speaking with Hector/ });
    await userEvent.click(card);
    const sheet = await screen.findByRole("dialog", { name: "Alphonso Pro" });
    await within(sheet).findByText("$9.99 a month after the trial");
    expect(document.body.style.overflow).toBe("hidden");
    // Twice round the sheet forwards, then backwards: focus never reaches the page behind.
    for (let i = 0; i < 30; i++) {
      await userEvent.tab();
      expect(sheet.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 30; i++) {
      await userEvent.tab({ shift: true });
      expect(sheet.contains(document.activeElement)).toBe(true);
    }
    await userEvent.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
    expect(card).toHaveFocus();
  });

  it("end-of-Practice prompt uses its own wording and source", async () => {
    render(<HectorInvite source="practice_end_prompt" />);
    await userEvent.click(await screen.findByRole("button", { name: /Continue with Hector/ }));
    await waitFor(() => expect(urls).toContain("/api/pro-offering?source=practice_end_prompt"));
  });

  it("hidden for Pro", async () => {
    status = {
      code: 200,
      body: { pro: true, store: "app_store", trialEligible: false, manageUrl: null },
    };
    const { container } = render(<HectorInvite source="practice_hector_card" />);
    await waitFor(() => expect(urls).toContain("/api/pro-status"));
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("hidden when Pro cannot be checked (never upsell a learner who may have paid)", async () => {
    status = { code: 503, body: { error: "entitlement-unavailable" } };
    const { container } = render(<HectorInvite source="practice_hector_card" />);
    await waitFor(() => expect(urls).toContain("/api/pro-status"));
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
