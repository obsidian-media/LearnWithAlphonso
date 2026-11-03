// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/auth-headers", () => ({ authHeaders: async () => ({}) }));
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
      return Response.json({
        price: "$9.99",
        period: "month",
        trialDays: 7,
        purchaseUrl: "https://pay.rev.cat/t/u",
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
    const card = await screen.findByRole("button", { name: /Practise speaking with Hector/ });
    expect(
      screen.getByText(
        "A voice tutor that remembers your level and weak spots. Part of Alphonso Pro.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(card);
    expect(await screen.findByText("$9.99 / month")).toBeInTheDocument();
    expect(urls).toContain("/api/pro-offering?source=practice_hector_card");
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
