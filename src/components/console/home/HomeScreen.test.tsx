// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomeScreen } from "./HomeScreen";
import type { HomeApi, HomeData } from "./homeApi";
import type { InboxPage, TicketSummary } from "../../../lib/staff-support.functions";
import { DEFAULT_SCOPES, SCOPES } from "../../../lib/staff-scopes";

const ME = "00000000-0000-4000-8000-0000000000b1";
const T1 = "10000000-0000-4000-8000-000000000001";
const T2 = "10000000-0000-4000-8000-000000000002";
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const ticket = (id: string, over: Partial<TicketSummary> = {}): TicketSummary => ({
  id,
  ticketNo: 7,
  status: "open",
  topic: "billing",
  channel: "ios",
  handoffReason: "learner_asked",
  assignedTo: null,
  assignedName: null,
  snippet: "Pro is not showing after I paid",
  createdAt: hoursAgo(5),
  updatedAt: hoursAgo(3),
  unopened: true,
  waitingSince: hoursAgo(3),
  breaching: false,
  ...over,
});

const page = (over: Partial<InboxPage> = {}): InboxPage => ({
  tickets: [
    ticket(T1),
    ticket(T2, { ticketNo: 8, status: "new", assignedTo: ME, snippet: "Cannot log in on Android" }),
  ],
  total: 2,
  counts: {
    open: 5,
    waiting: 1,
    solved: 9,
    all: 15,
    unassigned: 3,
    openUnassigned: 2,
    mine: 1,
    breaching: 1,
    oldestWaitingSince: hoursAgo(3),
  },
  breachHours: 8,
  next: null,
  me: ME,
  ...over,
});

const data = (over: Partial<HomeData> = {}): HomeData => ({
  loadedAt: new Date().toISOString(),
  queue: page(),
  metrics: {
    range: "today",
    generatedAt: new Date().toISOString(),
    newLearners: 11,
    lessons: 42,
    activeToday: 17,
  },
  health: { events: [{ event: "hearts_settlement_failed", status: "green" }] },
  feed: {
    rows: [{ id: 1, at: hoursAgo(1), action: "support.reply", actorName: "Sam" }],
  },
  ...over,
});

const detail = (over: Record<string, unknown> = {}) => ({
  id: T1,
  status: "open",
  topic: "billing",
  channel: "ios",
  handoffReason: null,
  createdAt: hoursAgo(5),
  updatedAt: hoursAgo(3),
  solvedAt: null,
  assignedTo: null,
  assignedName: null,
  aiSummary: null,
  messages: [
    {
      id: 1,
      kind: "learner",
      body: "Pro is not showing after I paid",
      at: hoursAgo(5),
      authorName: null,
    },
  ],
  notes: [],
  facts: null,
  factsSource: "unavailable",
  learnerId: null,
  me: ME,
  ...over,
});

function makeApi(over: Partial<HomeApi> = {}): HomeApi {
  return {
    listTickets: vi.fn(async () => page()),
    getTicket: vi.fn(async () => detail() as never),
    replyTicket: vi.fn(async () => ({ ok: true })),
    assignTicket: vi.fn(async () => ({ ok: true })),
    resolveTicket: vi.fn(async () => ({ ok: true })),
    metrics: vi.fn(async (range) => ({
      range,
      generatedAt: new Date().toISOString(),
      newLearners: 55,
      lessons: 66,
      activeToday: 17,
    })),
    money: vi.fn(async () => ({
      generatedAt: new Date().toISOString(),
      tiles: [
        {
          id: "spend_today",
          label: "AI cost today",
          kind: "usd" as const,
          value: 2.5,
          note: "",
          state: "ok" as const,
        },
        {
          id: "mrr",
          label: "MRR (estimate)",
          kind: "money" as const,
          value: null,
          note: "",
          reason: "Not connected",
          state: "not_connected" as const,
        },
        {
          id: "downloads",
          label: "App Store downloads",
          kind: "number" as const,
          value: null,
          note: "",
          state: "error" as const,
        },
      ],
    })),
    ...over,
  };
}

const ownerMe = { displayName: "Olga", scopes: [...SCOPES] };
const supportMe = { displayName: "Sam", scopes: [...DEFAULT_SCOPES.support] };
const metric = (name: string) =>
  within(document.querySelector<HTMLElement>(`[data-metric="${name}"]`)!);

afterEach(() => cleanup());

describe("Home: every tile shows the real value it was given", () => {
  it("metrics, the queue counts and tab counts come from the data", () => {
    render(<HomeScreen me={ownerMe} data={data()} api={makeApi()} />);
    expect(metric("Open tickets").getByText("5")).toBeTruthy();
    expect(metric("Open tickets").getByText(/2/)).toBeTruthy(); // unassigned
    expect(metric("New learners").getByText("11")).toBeTruthy();
    expect(metric("Lessons done").getByText("42")).toBeTruthy();
    expect(metric("Active today").getByText("17")).toBeTruthy();
    // the tabs carry their own real counts
    expect(screen.getByRole("tab", { name: /^All 5/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Unassigned 2/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Mine 1/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Breaching 1/ })).toBeTruthy();
  });

  it("a queue row shows its ticket number, snippet, area, status word and how long it has waited", async () => {
    render(<HomeScreen me={ownerMe} data={data()} api={makeApi()} />);
    const row = screen.getByRole("button", { name: /Pro is not showing/ });
    expect(row.textContent).toContain("#7");
    expect(row.textContent).toContain("Billing");
    expect(row.textContent).toContain("Needs reply");
    expect(row.textContent).toContain("Unassigned");
    await waitFor(() => expect(row.querySelector("[data-wait]")!.textContent).toMatch(/^3h \d\dm/));
    // the "new" ticket uses the owner-ruled word
    expect(screen.getByText("New", { selector: "span" })).toBeTruthy();
  });

  it("the feed names who did what, from the action record", () => {
    render(<HomeScreen me={ownerMe} data={data()} api={makeApi()} />);
    expect(screen.getByText("Sam")).toBeTruthy();
    expect(screen.getByText(/replied to a ticket/)).toBeTruthy();
  });

  it("a feed action with no sentence is shown as its raw code, never hidden", () => {
    render(
      <HomeScreen
        me={ownerMe}
        data={data({
          feed: { rows: [{ id: 2, at: hoursAgo(1), action: "brand.new_thing", actorName: null }] },
        })}
        api={makeApi()}
      />,
    );
    expect(screen.getByText(/brand\.new_thing/)).toBeTruthy();
    expect(screen.getByText("Someone")).toBeTruthy();
  });
});

describe("Home: an absent source says so and never shows a number or a 0", () => {
  it("every metric whose read failed shows its reason and no figure", () => {
    render(
      <HomeScreen
        me={ownerMe}
        data={data({ metrics: null, queue: null, health: null, feed: null })}
        api={makeApi()}
      />,
    );
    for (const name of ["Open tickets", "New learners", "Lessons done", "Active today"]) {
      const m = document.querySelector(`[data-metric="${name}"]`)!;
      expect(m.querySelector("[data-figure]"), name).toBeNull();
      expect(m.textContent).toContain("Could not read");
    }
    expect(screen.getAllByText("Could not read the tickets.").length).toBeGreaterThan(0);
    expect(screen.getByText("Could not read the action record.")).toBeTruthy();
    expect(screen.getByText("Could not read system health.")).toBeTruthy();
    // the banner says what it could not check, not "all clear"
    expect(screen.getByText("Could not check the support queue")).toBeTruthy();
    expect(screen.getByText("Could not check system health")).toBeTruthy();
    // no tab count, no digit in any figure node at all
    expect(screen.getByRole("tab", { name: "All" })).toBeTruthy();
    expect(document.querySelectorAll("[data-figure]").length).toBe(0);
  });

  it("a single missing number (the database returned null for one) shows the reason for that one only", () => {
    render(
      <HomeScreen
        me={ownerMe}
        data={data({
          metrics: {
            range: "today",
            generatedAt: new Date().toISOString(),
            newLearners: 3,
            lessons: null,
            activeToday: null,
          },
        })}
        api={makeApi()}
      />,
    );
    expect(metric("New learners").getByText("3")).toBeTruthy();
    expect(metric("Lessons done").getByText("Could not read")).toBeTruthy();
    expect(metric("Active today").getByText("Could not read")).toBeTruthy();
  });

  it("a count of the breaching tickets that is null (setting missing) leaves the number off the tab", () => {
    const p = page({
      breachHours: null,
      counts: { ...page().counts, breaching: null },
    });
    render(<HomeScreen me={ownerMe} data={data({ queue: p })} api={makeApi()} />);
    expect(screen.getByRole("tab", { name: "Breaching" })).toBeTruthy();
  });

  it("owner money tiles: a real value, 'Not connected' with its reason, and a failed provider", async () => {
    render(<HomeScreen me={ownerMe} data={data()} api={makeApi()} />);
    const money = within(await screen.findByRole("region", { name: "Money" }));
    await waitFor(() => expect(money.getByText("$2.50")).toBeTruthy());
    expect(money.getByText("Not connected")).toBeTruthy();
    expect(money.getByText("Could not read")).toBeTruthy();
    expect(money.getByText("Owner only")).toBeTruthy();
  });

  it("owner money read that throws says so", async () => {
    const api = makeApi({ money: vi.fn(async () => Promise.reject(new Error("x"))) });
    render(<HomeScreen me={ownerMe} data={data()} api={api} />);
    expect(await screen.findByText("Could not read the money numbers.")).toBeTruthy();
  });
});

describe("Home: the attention banner reads real signals", () => {
  it("says how long the oldest ticket has waited, how many are breaching, and a failing health event", async () => {
    render(
      <HomeScreen
        me={ownerMe}
        data={data({ health: { events: [{ event: "hearts_settlement_failed", status: "red" }] } })}
        api={makeApi()}
      />,
    );
    const banner = within(screen.getByRole("region", { name: "Needs attention" }));
    await waitFor(() => expect(banner.getByText(/oldest ticket has waited 3h/i)).toBeTruthy());
    expect(banner.getByText(/ticket is breaching/)).toBeTruthy();
    expect(banner.getByText(/hearts settlement failed \(problem\)/)).toBeTruthy();
  });

  it("is absent when nothing real needs attention", () => {
    render(
      <HomeScreen
        me={ownerMe}
        data={data({
          queue: page({ counts: { ...page().counts, oldestWaitingSince: null, breaching: 0 } }),
        })}
        api={makeApi()}
      />,
    );
    expect(screen.queryByRole("region", { name: "Needs attention" })).toBeNull();
  });
});

describe("Home: Breaching uses the setting, not a constant", () => {
  it("shows the hours the database used, and a different setting shows a different number", async () => {
    const user = userEvent.setup();
    const eight = makeApi({ listTickets: vi.fn(async () => page({ breachHours: 8 })) });
    const { unmount } = render(<HomeScreen me={ownerMe} data={data()} api={eight} />);
    await user.click(screen.getByRole("tab", { name: /^Breaching/ }));
    expect(eight.listTickets).toHaveBeenCalledWith({ filter: "breaching", assigned: "any" });
    expect(await screen.findByText(/longer than/)).toBeTruthy();
    expect(screen.getByText(/longer than/).textContent).toContain("8 h");
    unmount();
    const twelve = makeApi({ listTickets: vi.fn(async () => page({ breachHours: 12 })) });
    render(<HomeScreen me={ownerMe} data={data()} api={twelve} />);
    await user.click(screen.getByRole("tab", { name: /^Breaching/ }));
    expect((await screen.findByText(/longer than/)).textContent).toContain("12 h");
  });

  it("the tabs ask the inbox for exactly the right view", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<HomeScreen me={ownerMe} data={data()} api={api} />);
    await user.click(screen.getByRole("tab", { name: /^Unassigned/ }));
    await user.click(screen.getByRole("tab", { name: /^Mine/ }));
    await user.click(screen.getByRole("tab", { name: /^All/ }));
    expect((api.listTickets as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      { filter: "open", assigned: "unassigned" },
      { filter: "open", assigned: "me" },
      { filter: "open", assigned: "any" },
    ]);
  });

  it("an empty view says so, and a failed read says so", async () => {
    const user = userEvent.setup();
    const api = makeApi({ listTickets: vi.fn(async () => page({ tickets: [], total: 0 })) });
    render(<HomeScreen me={ownerMe} data={data()} api={api} />);
    await user.click(screen.getByRole("tab", { name: /^Mine/ }));
    expect(await screen.findByText("No tickets in this view.")).toBeTruthy();
    (api.listTickets as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("x"));
    await user.click(screen.getByRole("tab", { name: /^Unassigned/ }));
    expect(await screen.findByText("Could not read the tickets.")).toBeTruthy();
  });
});

describe("Home: the triage drawer uses the existing reply, assign and resolve", () => {
  async function open(api: HomeApi, scopes = ownerMe) {
    const user = userEvent.setup();
    render(<HomeScreen me={scopes} data={data()} api={api} />);
    await user.click(screen.getByRole("button", { name: /Pro is not showing/ }));
    await screen.findByText("Pro is not showing after I paid", { selector: "p.inline-block" });
    return user;
  }

  it("opening a row reads that ticket", async () => {
    const api = makeApi();
    await open(api);
    expect(api.getTicket).toHaveBeenCalledWith(T1);
  });

  it("Send reply sends the typed text to the reply function and reloads", async () => {
    const api = makeApi();
    const user = await open(api);
    await user.type(screen.getByLabelText("Reply"), "On it");
    await user.click(screen.getByRole("button", { name: "Send reply" }));
    await waitFor(() => expect(api.replyTicket).toHaveBeenCalledWith(T1, "On it"));
    await waitFor(() =>
      expect((api.getTicket as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2),
    );
  });

  it("a quick reply fills the box (it does not send)", async () => {
    const api = makeApi();
    const user = await open(api);
    await user.click(screen.getByRole("button", { name: "Looking into it" }));
    expect((screen.getByLabelText("Reply") as HTMLTextAreaElement).value).toMatch(
      /looking into this/,
    );
    expect(api.replyTicket).not.toHaveBeenCalled();
  });

  it("Assign to me assigns to the signed-in staff member", async () => {
    const api = makeApi();
    const user = await open(api);
    await user.click(screen.getByRole("button", { name: "Assign to me" }));
    await waitFor(() => expect(api.assignTicket).toHaveBeenCalledWith(T1, ME));
  });

  it("Resolve calls the status function for this ticket", async () => {
    const api = makeApi();
    const user = await open(api);
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(api.resolveTicket).toHaveBeenCalledWith(T1));
  });

  it("a refusal from the server is shown in the drawer", async () => {
    const api = makeApi({
      replyTicket: vi.fn(async () => Promise.reject(new Error("This chat is too old."))),
    });
    const user = await open(api);
    await user.type(screen.getByLabelText("Reply"), "Hello");
    await user.click(screen.getByRole("button", { name: "Send reply" }));
    expect(await screen.findByText("This chat is too old.")).toBeTruthy();
  });

  it("focus moves into the drawer, Tab wraps inside it, and Escape closes it and restores focus to the row", async () => {
    const api = makeApi();
    const user = userEvent.setup();
    render(<HomeScreen me={ownerMe} data={data()} api={api} />);
    const row = screen.getByRole("button", { name: /Pro is not showing/ });
    await user.click(row);
    await screen.findByText("Pro is not showing after I paid", { selector: "p.inline-block" });
    const drawer = document.querySelector<HTMLElement>("[data-ticket-drawer]")!;
    expect(drawer.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 12; i++) {
      await user.tab();
      expect(drawer.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(document.querySelector("[data-ticket-drawer]")).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it("a resolved ticket offers no reply, assign or resolve", async () => {
    const api = makeApi({ getTicket: vi.fn(async () => detail({ status: "solved" }) as never) });
    await open(api);
    expect(screen.getByText(/This ticket is resolved/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send reply" })).toBeNull();
  });
});

describe("Home: the range buttons read again", () => {
  it("7 days asks for 7 and shows what came back", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<HomeScreen me={ownerMe} data={data()} api={api} />);
    await user.click(screen.getByRole("button", { name: "7 days" }));
    expect(api.metrics).toHaveBeenCalledWith("7");
    await waitFor(() => expect(metric("New learners").getByText("55")).toBeTruthy());
    expect(metric("New learners").getByText("last 7 days")).toBeTruthy();
  });

  it("a failed re-read shows the reason, not the old or a zero number", async () => {
    const user = userEvent.setup();
    const api = makeApi({ metrics: vi.fn(async () => Promise.reject(new Error("x"))) });
    render(<HomeScreen me={ownerMe} data={data()} api={api} />);
    await user.click(screen.getByRole("button", { name: "30 days" }));
    await waitFor(() => expect(metric("New learners").getByText("Could not read")).toBeTruthy());
  });
});

describe("Home: the role matrix (support versus owner)", () => {
  const supportData = data({ metrics: undefined, health: undefined, feed: undefined });

  it("a support person sees the queue and open tickets, and none of money, the feed, health or learner numbers", () => {
    const api = makeApi();
    render(<HomeScreen me={supportMe} data={supportData} api={api} />);
    expect(screen.getByRole("region", { name: "Support queue" })).toBeTruthy();
    expect(document.querySelector('[data-metric="Open tickets"]')).toBeTruthy();
    for (const name of ["New learners", "Lessons done", "Active today"]) {
      expect(document.querySelector(`[data-metric="${name}"]`), name).toBeNull();
    }
    expect(screen.queryByRole("region", { name: "Money" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Just happened" })).toBeNull();
    expect(screen.queryByRole("region", { name: "System health" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Range" })).toBeNull();
    // and the money read is never even attempted
    expect(api.money).not.toHaveBeenCalled();
  });

  it("an owner sees all of it and the money read is made", async () => {
    const api = makeApi();
    render(<HomeScreen me={ownerMe} data={data()} api={api} />);
    for (const name of ["Support queue", "Just happened", "Money", "System health"]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
    }
    await waitFor(() => expect(api.money).toHaveBeenCalledTimes(1));
  });

  it("someone with no scopes sees a page with no card at all", () => {
    render(
      <HomeScreen
        me={{ displayName: null, scopes: [] }}
        data={data({ queue: undefined, metrics: undefined, health: undefined, feed: undefined })}
        api={makeApi()}
      />,
    );
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
});
