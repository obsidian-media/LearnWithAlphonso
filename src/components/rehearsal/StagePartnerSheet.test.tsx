// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, search, onClick, ...rest }: Record<string, unknown>) => (
    <a
      href={`${String(to)}|${JSON.stringify(params)}|${JSON.stringify(search ?? {})}`}
      onClick={onClick as never}
      {...(rest as object)}
    >
      {children as never}
    </a>
  ),
}));
const pro = vi.hoisted(() => ({ state: "loading" as "loading" | "pro" | "free" | "error" }));
vi.mock("@/lib/use-pro-status", () => ({ useProStatus: () => ({ state: pro.state }) }));
vi.mock("../WebPaywall", () => ({
  WebPaywallSheet: ({ source }: { source: string }) => <p>paywall:{source}</p>,
}));

const { StagePartnerSheet } = await import("./StagePartnerSheet");

const ID = "11111111-1111-4111-8111-111111111111";
const open = (stage: "warmup" | "conversation" | "hard_moments", hectorAvailable: boolean | null) =>
  render(
    <StagePartnerSheet
      rehearsalId={ID}
      stage={stage}
      hectorAvailable={hectorAvailable}
      onClose={vi.fn()}
    />,
  );

beforeEach(() => {
  pro.state = "error";
});

describe("the partner is chosen at the start of each stage", () => {
  it("Start with Alphonso is the main button and carries no persona", () => {
    open("conversation", true);
    const alphonso = screen.getByRole("link", { name: "Start with Alphonso" });
    expect(alphonso.getAttribute("href")).toBe(
      `/rehearse/$id/$stage|${JSON.stringify({ id: ID, stage: "conversation" })}|{}`,
    );
  });

  it("a Pro learner starts with Hector, which carries persona=hector and nothing else", () => {
    open("conversation", true);
    const hector = screen.getByRole("link", { name: "Start with Hector" });
    expect(hector.getAttribute("href")).toContain('|{"persona":"hector"}');
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("a learner who is not Pro sees a Pro badge, and choosing Hector opens the existing paywall", async () => {
    const user = userEvent.setup();
    open("conversation", false);
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Hector/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start with Hector (Pro)" }));
    expect(screen.getByText("paywall:rehearsal_entry")).toBeInTheDocument();
  });

  it("Alphonso stays available to a learner who is not Pro", () => {
    open("hard_moments", false);
    expect(screen.getByRole("link", { name: "Start with Alphonso" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("hard mode is offered on the last stage with Hector only, and adds hard=true", async () => {
    const user = userEvent.setup();
    open("hard_moments", true);
    await user.click(screen.getByRole("checkbox", { name: /Hard mode/ }));
    const hard = screen.getByRole("link", { name: "Start hard mode with Hector" });
    expect(hard.getAttribute("href")).toContain('|{"persona":"hector","hard":true}');
  });

  it.each(["warmup", "conversation"] as const)("no hard mode on %s", (stage) => {
    open(stage, true);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("when Pro cannot be told, Hector can still be tried (the run's own start decides)", () => {
    open("conversation", null);
    expect(screen.getByRole("link", { name: "Start with Hector" })).toBeInTheDocument();
  });

  it("a Pro client with a stale hectorAvailable:false is not locked out", () => {
    pro.state = "pro";
    open("conversation", false);
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start with Hector" })).toBeInTheDocument();
  });

  it("a free client with no server answer sees the Pro badge", () => {
    pro.state = "free";
    open("conversation", null);
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Hector/ })).not.toBeInTheDocument();
  });

  it("picking a partner closes the sheet and tells the caller", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onChosen = vi.fn();
    render(
      <StagePartnerSheet
        rehearsalId={ID}
        stage="conversation"
        hectorAvailable
        onClose={onClose}
        onChosen={onChosen}
      />,
    );
    await user.click(screen.getByRole("link", { name: "Start with Alphonso" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChosen).toHaveBeenCalledWith({});
  });

  it("while this device's Pro status is loading, Hector is disabled with no Pro badge, then settles", () => {
    pro.state = "loading";
    const { rerender } = open("conversation", false);
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start with Hector" })).toBeDisabled();
    pro.state = "free";
    rerender(
      <StagePartnerSheet
        rehearsalId={ID}
        stage="conversation"
        hectorAvailable={false}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Pro")).toBeInTheDocument();
  });

  it("labels the partner an AI", () => {
    open("conversation", true);
    expect(screen.getAllByText("AI").length).toBeGreaterThan(0);
  });
});
