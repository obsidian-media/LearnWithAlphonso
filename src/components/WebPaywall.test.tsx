// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PAYWALL_TEXT_ROLE } from "@/lib/paywall-plans";

vi.mock("@/lib/auth-headers", () => ({
  authHeaders: async () => ({ Authorization: "Bearer t" }),
}));
const getMyProfile = vi.fn();
vi.mock("@/lib/leaderboard.functions", () => ({ getMyProfile: () => getMyProfile() }));

const { WebPaywall } = await import("./WebPaywall");

const realFetch = globalThis.fetch;
const assign = vi.fn();

// TEST FIXTURES: made-up offers standing in for RevenueCat's answer. The paywall itself holds no price.
const YEARLY = {
  period: "year",
  price: "$59.99",
  amountMicros: 59_990_000,
  currency: "USD",
  trialDays: 7,
  purchaseUrl: "https://pay.rev.cat/year/u1",
};
const MONTHLY = {
  period: "month",
  price: "$9.99",
  amountMicros: 9_990_000,
  currency: "USD",
  trialDays: 7,
  purchaseUrl: "https://pay.rev.cat/month/u1",
};
type Fixture = typeof YEARLY;
const noTrial = (p: Fixture) => ({ ...p, trialDays: null });
const priceless = (p: Fixture) => ({ ...p, price: null, amountMicros: null, currency: null });

let offering: { status: number; body: unknown };
let proStatus: unknown = { pro: false };
const urls: string[] = [];

function serve(status: number, body: unknown) {
  offering = { status, body };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 6, 12, 0));
  assign.mockReset();
  urls.length = 0;
  getMyProfile.mockReset();
  getMyProfile.mockResolvedValue({ display_name: "Sam Rivera" });
  proStatus = { pro: false };
  serve(200, { plans: [YEARLY, MONTHLY] });
  globalThis.fetch = vi.fn(async (input: string) => {
    urls.push(String(input));
    if (String(input).startsWith("/api/pro-status")) return Response.json(proStatus);
    return Response.json(offering.body, { status: offering.status });
  }) as unknown as typeof fetch;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign },
  });
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = realFetch;
});

const plansReady = () => screen.findByRole("radiogroup", { name: "Choose a plan" });

describe("WebPaywall: the top", () => {
  it("tells the story: the headline, a labelled example call and three facts, with no daily number", async () => {
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "A tutor who remembers you.",
    );
    const call = screen.getByRole("figure", { name: "Example call" });
    expect(within(call).getByText(/Last week you said/)).toBeInTheDocument();
    const facts = screen.getByRole("list", { name: "What Pro gives you" });
    expect(
      within(facts)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Any topicno script", "Remembersyour weak spots", "Every daya long conversation"]);
    expect(document.body.textContent).not.toMatch(/\d+\s*(messages|minutes|a day|per day)/i);
  });

  it("pins the learner's first name on the Pro card", async () => {
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    await waitFor(() => expect(screen.getAllByText("Sam").length).toBeGreaterThan(0));
    expect(screen.queryByText(/Rivera/)).toBeNull();
  });

  it("never pins a generated Learner handle on the card", async () => {
    getMyProfile.mockResolvedValue({ display_name: "Learner-AB12" });
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    await waitFor(() => expect(getMyProfile).toHaveBeenCalled());
    expect(screen.queryByText(/Learner-AB12/)).toBeNull();
  });
});

describe("WebPaywall: the plans", () => {
  it("asks for the offer with its source", async () => {
    render(<WebPaywall source="practice_hector_card" />);
    await plansReady();
    expect(urls).toContain("/api/pro-offering?source=practice_hector_card");
  });

  it("yearly and monthly side by side, yearly selected, with the saving worked out from the prices", async () => {
    render(<WebPaywall source="hector_tab" />);
    const group = await plansReady();
    const [year, month] = within(group).getAllByRole("radio");
    expect(year).toHaveAccessibleName(/Yearly/);
    expect(year).toBeChecked();
    expect(month).toHaveAccessibleName(/Monthly/);
    expect(month).not.toBeChecked();
    expect(within(group).getByText("Save 50%")).toBeInTheDocument();
    expect(within(group).getByText("$5.00 a month")).toBeInTheDocument();
  });

  it("with a trial: price line, trial line, the exact first-payment date, and Start free trial", async () => {
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    expect(screen.getByText("$59.99 a year after the trial")).toBeInTheDocument();
    expect(screen.getByText("Free for 7 days")).toBeInTheDocument();
    expect(screen.getByText("Nothing to pay today.")).toBeInTheDocument();
    expect(
      screen.getByText(
        /^First payment on (November 13|13 November)\. Cancel before then and you pay nothing\.$/,
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start free trial" }));
    expect(assign).toHaveBeenCalledWith("https://pay.rev.cat/year/u1");
  });

  it("the first-payment date follows the offer's own trial length", async () => {
    serve(200, {
      plans: [
        { ...YEARLY, trialDays: 3 },
        { ...MONTHLY, trialDays: 3 },
      ],
    });
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    expect(screen.getByText(/^First payment on (November 9|9 November)\./)).toBeInTheDocument();
    expect(screen.getByText("Free for 3 days")).toBeInTheDocument();
  });

  it("the price line takes the price role and the trial line the trial role (3.1.2)", async () => {
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    expect(screen.getByText("$59.99 a year after the trial")).toHaveClass(PAYWALL_TEXT_ROLE.price);
    expect(screen.getByText("Free for 7 days")).toHaveClass(PAYWALL_TEXT_ROLE.trial);
  });

  it("picking monthly switches the lines and the checkout link", async () => {
    render(<WebPaywall source="hector_tab" />);
    const group = await plansReady();
    await userEvent.click(within(group).getAllByRole("radio")[1]);
    expect(screen.getByText("$9.99 a month after the trial")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start free trial" }));
    expect(assign).toHaveBeenCalledWith("https://pay.rev.cat/month/u1");
  });

  it("not eligible for a trial: Subscribe, and no trial is mentioned anywhere", async () => {
    serve(200, { plans: [noTrial(YEARLY), noTrial(MONTHLY)] });
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start free trial" })).toBeNull();
    expect(screen.getByText("$59.99 a year")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/trial|free for|nothing to pay/i);
  });

  it("a price not for this country: no number, no currency, no saving", async () => {
    serve(200, { plans: [priceless(YEARLY), priceless(MONTHLY)] });
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    expect(
      screen.getByText("Yearly plan, priced in your currency at checkout"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Save/)).toBeNull();
    const group = screen.getByRole("radiogroup", { name: "Choose a plan" });
    expect(group.textContent).not.toMatch(/[$€£¥]|\d/);
  });

  it("one plan only (no yearly set up): it is selected, with no saving badge", async () => {
    serve(200, { plans: [MONTHLY] });
    render(<WebPaywall source="hector_tab" />);
    const group = await plansReady();
    expect(within(group).getAllByRole("radio")).toHaveLength(1);
    expect(within(group).getByRole("radio")).toBeChecked();
    expect(screen.queryByText(/Save/)).toBeNull();
    expect(screen.getByText("$9.99 a month after the trial")).toBeInTheDocument();
  });

  it("says what stays free, the renewal terms, and links Restore, Terms and Privacy", async () => {
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    expect(screen.getByText("Everything else stays free, always.")).toBeInTheDocument();
    const free = screen.getByRole("list", { name: "Free for everyone" });
    expect(
      within(free)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Lessons", "Alphonso calls", "Audio", "Review"]);
    expect(screen.getByText(/Renews automatically until cancelled/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("button", { name: "Restore purchases" })).toBeInTheDocument();
  });

  it("Restore opens Hector when this account already has Pro", async () => {
    proStatus = { pro: true };
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    await userEvent.click(screen.getByRole("button", { name: "Restore purchases" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/hector"));
  });

  it("Restore says so when there is nothing to restore", async () => {
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    await userEvent.click(screen.getByRole("button", { name: "Restore purchases" }));
    expect(await screen.findByText("No Alphonso Pro found on this account.")).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("Restore that cannot check the account offers Get help, which opens the Help chat", async () => {
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    const served = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: string) => {
      if (String(input).startsWith("/api/pro-status")) throw new Error("offline");
      return served(input);
    }) as unknown as typeof fetch;
    await userEvent.click(screen.getByRole("button", { name: "Restore purchases" }));
    expect(
      await screen.findByText("Couldn't check your subscription. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get help" })).toHaveAttribute("href", "/help");
  });
});

describe("WebPaywall: when there is no offer", () => {
  it("not on sale yet: a calm Coming soon, no price and no buy button", async () => {
    serve(503, { error: "offering-unavailable", reason: "not-configured" });
    render(<WebPaywall source="hector_tab" />);
    expect(await screen.findByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start free trial|Subscribe/ })).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(document.body.textContent).not.toMatch(/[$€£¥]|\d/);
    // The story still tells what Pro is.
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("cannot load: the iPhone's error, a retry, and no price at all", async () => {
    serve(503, { error: "offering-unavailable" });
    render(<WebPaywall source="hector_tab" />);
    expect(
      await screen.findByText(
        "Couldn't load subscription options. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[$€£¥]|\d/);
    expect(screen.getByRole("link", { name: "Get help" })).toHaveAttribute("href", "/help");
    serve(200, { plans: [MONTHLY] });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByText("$9.99 a month after the trial")).toBeInTheDocument(),
    );
  });
});

describe("WebPaywall: closing", () => {
  it("has a Close button only when it can be closed", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<WebPaywall source="lesson_complete" onClose={onClose} />);
    await plansReady();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    unmount();
    render(<WebPaywall source="hector_tab" />);
    await plansReady();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});
