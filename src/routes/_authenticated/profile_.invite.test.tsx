// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { REFERRAL_COPY, REFERRAL_MONTHLY_CAP } from "../../lib/referral";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
      select({ location: { pathname: "/profile/invite" } }),
  };
});

const getReferralOverview = vi.fn();
vi.mock("../../lib/referral.functions", () => ({ getReferralOverview }));

const { Route } = await import("./profile_.invite");

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Page = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

const ready = (
  over: Partial<{ completed: number; pending: number; rewardedThisMonth: number }> = {},
) => ({
  code: "AbCd1234",
  summary: { completed: 0, pending: 0, rewardedThisMonth: 0, ...over },
});

beforeEach(() => {
  cleanup();
  getReferralOverview.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
});

describe("Invite friends screen", () => {
  it("loading: shows a loading line and no link yet", () => {
    getReferralOverview.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(document.querySelector("[data-referral-link]")).toBeNull();
  });

  it("explains the reward in plain words, including the Pro difference", async () => {
    getReferralOverview.mockResolvedValue(ready());
    renderPage();
    expect(await screen.findByText(REFERRAL_COPY.explainer)).toBeInTheDocument();
    expect(screen.getByText(REFERRAL_COPY.proNote)).toBeInTheDocument();
  });

  it("ready: shows the referral link and copies it", async () => {
    getReferralOverview.mockResolvedValue(ready());
    renderPage();
    const link = await waitFor(() => {
      const el = document.querySelector("[data-referral-link]");
      expect(el).not.toBeNull();
      return el!.textContent!;
    });
    expect(link).toBe(`${window.location.origin}/?ref=AbCd1234`);
    fireEvent.click(screen.getByRole("button", { name: REFERRAL_COPY.copy }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(link));
    expect(await screen.findByRole("button", { name: REFERRAL_COPY.copied })).toBeInTheDocument();
  });

  it("offers Share only where the browser can share, and shares the link", async () => {
    getReferralOverview.mockResolvedValue(ready());
    const { unmount } = renderPage();
    await screen.findByRole("button", { name: REFERRAL_COPY.copy });
    expect(screen.queryByRole("button", { name: REFERRAL_COPY.share })).toBeNull();
    unmount();

    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: REFERRAL_COPY.share }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ url: `${window.location.origin}/?ref=AbCd1234` }),
      ),
    );
  });

  it("shows the count of successful referrals and the rewards left", async () => {
    getReferralOverview.mockResolvedValue(
      ready({ completed: 3, pending: 1, rewardedThisMonth: 3 }),
    );
    renderPage();
    await waitFor(() =>
      expect(document.querySelector("[data-referral-count]")?.textContent).toBe("3"),
    );
    expect(
      screen.getByText(/3 friends joined and finished a first lesson\. 1 still to start\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${REFERRAL_MONTHLY_CAP - 3} of ${REFERRAL_MONTHLY_CAP} rewards left this month.`,
      ),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-referral-cap]")).toBeNull();
  });

  it("cap reached: says the monthly invite reward limit is reached, and the link still works", async () => {
    getReferralOverview.mockResolvedValue(
      ready({ completed: 25, rewardedThisMonth: REFERRAL_MONTHLY_CAP }),
    );
    renderPage();
    expect(await screen.findByText(/Monthly invite reward limit reached/)).toBeInTheDocument();
    expect(screen.queryByText(/rewards left this month/)).toBeNull();
    expect(screen.getByRole("button", { name: REFERRAL_COPY.copy })).toBeEnabled();
  });

  it("error: says so and shows no link", async () => {
    getReferralOverview.mockRejectedValue(new Error("down"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(REFERRAL_COPY.loadError);
    expect(document.querySelector("[data-referral-link]")).toBeNull();
  });

  it("an unreadable count is not drawn as zero", async () => {
    getReferralOverview.mockResolvedValue({ code: "AbCd1234", summary: null });
    renderPage();
    await screen.findByRole("button", { name: REFERRAL_COPY.copy });
    expect(document.querySelector("[data-referral-count]")).toBeNull();
  });
});
