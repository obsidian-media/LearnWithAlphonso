// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiUsageSetting } from "./AiUsageSetting";

vi.mock("@/lib/auth-headers", () => ({ authHeaders: async () => ({ Authorization: "Bearer t" }) }));

const RESET = "2026-12-01T00:00:00.000Z";
function mockFetch(body: unknown, ok = true) {
  const f = vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
  vi.stubGlobal("fetch", f);
  return f;
}
function renderIt() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <AiUsageSetting />
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("AiUsageSetting", () => {
  it("ok: a meter at the percent, the word, the reset date, and the honest explanation", async () => {
    const f = mockFetch({ state: "ok", percentUsed: 37, resetsAt: RESET });
    renderIt();
    const meter = await screen.findByRole("meter", { name: "AI practice this month" });
    expect(meter).toHaveAttribute("aria-valuenow", "37");
    expect(meter).toHaveAttribute("aria-valuetext", "37 percent used, plenty left");
    expect(screen.getByText("Plenty left")).toBeTruthy();
    expect(screen.getByText(/Resets on 1 December\./)).toBeTruthy();
    expect(screen.getByText(/keeps the app sustainable/)).toBeTruthy();
    expect(screen.getByText(/normal use never reaches it/)).toBeTruthy();
    expect(f).toHaveBeenCalledWith("/api/ai-usage", { headers: { Authorization: "Bearer t" } });
  });
  it("warn: getting close, still kind, lessons still work", async () => {
    mockFetch({ state: "warn", percentUsed: 85, resetsAt: RESET });
    renderIt();
    expect(await screen.findByText("Getting close")).toBeTruthy();
    expect(screen.getByText(/Lessons and review always work\./)).toBeTruthy();
  });
  it("capped: limit reached at 100 with the reset date", async () => {
    mockFetch({ state: "capped", percentUsed: 100, resetsAt: RESET });
    renderIt();
    const meter = await screen.findByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("Limit reached")).toBeTruthy();
    expect(
      screen.getByText(
        "AI practice is paused for now. Lessons and review always work. Resets on 1 December.",
      ),
    ).toBeTruthy();
  });
  it("unknown, a failed call and a thrown fetch all render nothing", async () => {
    const makers = [
      () => mockFetch({ state: "unknown", percentUsed: 0, resetsAt: RESET }),
      () => mockFetch({ error: "x" }, false),
      () =>
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => {
            throw new Error("offline");
          }),
        ),
    ];
    for (const make of makers) {
      make();
      const { container, unmount } = renderIt();
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 20));
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });
  it("never shows a dollar amount, even if the response carried one", async () => {
    mockFetch({ state: "warn", percentUsed: 90, resetsAt: RESET, spentUsd: 1.8, capUsd: 2 });
    const { container } = renderIt();
    await screen.findByRole("meter");
    expect(container.textContent).not.toMatch(/\$|USD|dollar|\d\.\d\d/i);
    expect(container.textContent).not.toContain("1.8");
  });
});
