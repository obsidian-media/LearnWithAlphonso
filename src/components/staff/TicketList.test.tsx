// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TicketList } from "./TicketList";
import type { InboxPage, TicketSummary } from "../../lib/staff-support.functions";

const ME = "00000000-0000-4000-8000-0000000000b1";
const ticket = (n: number, over: Partial<TicketSummary> = {}): TicketSummary => ({
  id: `10000000-0000-4000-8000-00000000000${n}`,
  status: "new",
  topic: "billing",
  channel: "ios",
  handoffReason: "learner_asked",
  assignedTo: null,
  assignedName: null,
  snippet: "I got charged but Pro is not showing.",
  createdAt: "2026-11-14T10:02:00Z",
  updatedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  unopened: true,
  ...over,
});
const page = (over: Partial<InboxPage> = {}): InboxPage => ({
  tickets: [ticket(1)],
  total: 1,
  counts: { open: 4, waiting: 1, solved: 12, all: 17, unassigned: 2 },
  next: null,
  me: ME,
  ...over,
});
const props = {
  filter: "open" as const,
  assigned: "any" as const,
  busy: false,
  error: null,
  onFilter: () => {},
  onMore: () => {},
};

describe("TicketList", () => {
  it("shows the filters with their counts, and the pressed one", () => {
    render(<TicketList {...props} page={page()} />);
    const group = screen.getByRole("group", { name: "Filters" });
    const open = within(group).getByRole("button", { name: /^Open/ });
    expect(open.getAttribute("aria-pressed")).toBe("true");
    expect(open.textContent).toContain("4");
    expect(within(group).getByRole("button", { name: /Waiting on learner/ }).textContent).toContain(
      "1",
    );
    expect(within(group).getByRole("button", { name: /Solved/ }).textContent).toContain("12");
    expect(within(group).getByRole("button", { name: /Unassigned/ }).textContent).toContain("2");
    expect(within(group).getByRole("button", { name: /^All/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("choosing a filter keeps the assignment filter, and toggling Assigned to me flips it", async () => {
    const onFilter = vi.fn();
    const { rerender } = render(<TicketList {...props} page={page()} onFilter={onFilter} />);
    await userEvent.click(screen.getByRole("button", { name: /Waiting on learner/ }));
    expect(onFilter).toHaveBeenLastCalledWith("waiting", "any");
    await userEvent.click(screen.getByRole("button", { name: "Assigned to me" }));
    expect(onFilter).toHaveBeenLastCalledWith("open", "me");
    rerender(<TicketList {...props} assigned="me" page={page()} onFilter={onFilter} />);
    await userEvent.click(screen.getByRole("button", { name: /Solved/ }));
    expect(onFilter).toHaveBeenLastCalledWith("solved", "me");
    await userEvent.click(screen.getByRole("button", { name: "Assigned to me" }));
    expect(onFilter).toHaveBeenLastCalledWith("open", "any");
    await userEvent.click(screen.getByRole("button", { name: /Unassigned/ }));
    expect(onFilter).toHaveBeenLastCalledWith("open", "unassigned");
  });

  it("each row links to its ticket and shows status, topic, channel, reason, age and owner", () => {
    render(
      <TicketList
        {...props}
        page={page({
          tickets: [
            ticket(1),
            ticket(2, {
              status: "open",
              assignedTo: ME,
              topic: "restore",
              handoffReason: "ai_unsure",
            }),
            ticket(3, {
              status: "waiting_learner",
              assignedTo: "someone-else",
              assignedName: "Sam",
              unopened: false,
            }),
          ],
          total: 3,
        })}
      />,
    );
    const rows = within(screen.getByRole("list", { name: "Tickets" })).getAllByRole("link");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.getAttribute("href")).toBe("/support/10000000-0000-4000-8000-000000000001");
    expect(rows[0]!.textContent).toContain("New");
    expect(rows[0]!.textContent).toContain("Billing");
    expect(rows[0]!.textContent).toContain("iOS");
    expect(rows[0]!.textContent).toContain("Learner asked for a person");
    expect(rows[0]!.textContent).toContain("12 min ago");
    expect(rows[0]!.textContent).toContain("Unassigned");
    expect(rows[1]!.textContent).toContain("You");
    expect(rows[1]!.textContent).toContain("AI was unsure");
    expect(rows[2]!.textContent).toContain("Sam");
    expect(rows[2]!.textContent).toContain("Waiting on learner");
  });

  it("marks only unopened tickets with the dot", () => {
    render(
      <TicketList
        {...props}
        page={page({ tickets: [ticket(1), ticket(2, { unopened: false })], total: 2 })}
      />,
    );
    const rows = within(screen.getByRole("list", { name: "Tickets" })).getAllByRole("link");
    expect(within(rows[0]!).getAllByRole("img", { name: "Not opened yet" }).length).toBeGreaterThan(
      0,
    );
    expect(within(rows[1]!).queryAllByRole("img", { name: "Not opened yet" })).toHaveLength(0);
  });

  it("shows learner text as plain text, never as markup, and no name or email", () => {
    const evil = '<img src=x onerror="alert(1)"> **bold** <b>b</b>';
    const { container } = render(
      <TicketList {...props} page={page({ tickets: [ticket(1, { snippet: evil })] })} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain(evil);
    expect(container.textContent).not.toMatch(/@/);
  });

  it("says how many are shown, pages with Load more only when there is more, and disables it while loading", async () => {
    const onMore = vi.fn();
    const { rerender } = render(
      <TicketList
        {...props}
        page={page({ total: 17, next: { at: "t", id: "i" } })}
        onMore={onMore}
      />,
    );
    expect(screen.getByText("Showing 1 of 17. 25 per page.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onMore).toHaveBeenCalledOnce();
    rerender(<TicketList {...props} busy page={page({ total: 17, next: { at: "t", id: "i" } })} />);
    expect((screen.getByRole("button", { name: "Loading…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    rerender(<TicketList {...props} page={page({ total: 1, next: null })} />);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("an empty filter says so, and a failure shows as an alert", () => {
    render(
      <TicketList
        {...props}
        error="Could not read the tickets."
        page={page({ tickets: [], total: 0 })}
      />,
    );
    expect(screen.getByText("No tickets here")).toBeTruthy();
    expect(screen.getByText("Nothing is waiting on you in this filter.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Could not read the tickets.");
    expect(screen.queryByRole("list", { name: "Tickets" })).toBeNull();
  });
});
