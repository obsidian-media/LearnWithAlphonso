// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SupportScreen, type SupportMe } from "./SupportScreen";
import type { SupportApi } from "./supportApi";
import type { InboxPage, TicketSummary } from "../../../lib/staff-support.functions";
import { DEFAULT_SCOPES, SCOPES } from "../../../lib/staff-scopes";

const ME = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const T1 = "10000000-0000-4000-8000-000000000001";
const T2 = "10000000-0000-4000-8000-000000000002";
const T3 = "10000000-0000-4000-8000-000000000003";
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
  urgent: false,
  ...over,
});

const counts = (over: Partial<InboxPage["counts"]> = {}): InboxPage["counts"] => ({
  open: 5,
  waiting: 2,
  solved: 9,
  all: 16,
  unassigned: 3,
  openUnassigned: 2,
  mine: 1,
  urgent: 0,
  breaching: 1,
  oldestWaitingSince: hoursAgo(3),
  ...over,
});

const page = (over: Partial<InboxPage> = {}): InboxPage => ({
  tickets: [
    ticket(T1),
    ticket(T2, { ticketNo: 8, status: "new", assignedTo: ME, snippet: "Cannot log in on Android" }),
    ticket(T3, {
      ticketNo: 9,
      status: "waiting_learner",
      assignedTo: OTHER,
      assignedName: "Ola",
      snippet: "Sent a screenshot",
      waitingSince: null,
      unopened: false,
    }),
  ],
  total: 3,
  counts: counts(),
  breachHours: 8,
  next: null,
  me: ME,
  ...over,
});

const detail = (over: Record<string, unknown> = {}) => ({
  id: T1,
  ticketNo: 7,
  status: "open",
  urgent: false,
  waitingSince: hoursAgo(3),
  breaching: false,
  topic: "billing",
  channel: "ios",
  handoffReason: "learner_asked",
  createdAt: hoursAgo(5),
  updatedAt: hoursAgo(3),
  solvedAt: null,
  assignedTo: null,
  assignedName: null,
  aiSummary: "Charged, Pro not showing.",
  messages: [
    {
      id: 1,
      kind: "learner",
      body: "Pro is not showing after I paid",
      at: hoursAgo(5),
      authorName: null,
    },
    { id: 2, kind: "system", body: "A person will reply here.", at: hoursAgo(5), authorName: null },
  ],
  notes: [],
  facts: null,
  factsSource: "unavailable",
  learnerId: null,
  displayName: null,
  me: ME,
  ...over,
});

function makeApi(over: Partial<SupportApi> = {}): SupportApi {
  return {
    listTickets: vi.fn(async () => page()),
    getTicket: vi.fn(async () => detail() as never),
    reply: vi.fn(async () => ({ ok: true })),
    note: vi.fn(async () => ({ ok: true })),
    assign: vi.fn(async () => ({ ok: true })),
    setStatus: vi.fn(async () => ({ ok: true })),
    handToOwner: vi.fn(async () => ({ ok: true })),
    clearUrgent: vi.fn(async () => ({ ok: true })),
    listAssignable: vi.fn(async () => [
      { userId: ME, name: "Olga" },
      { userId: OTHER, name: "Ola" },
    ]),
    setBreachHours: vi.fn(async () => ({ ok: true })),
    ...over,
  };
}

const owner: SupportMe = { displayName: "Olga", role: "owner", scopes: [...SCOPES] };
const agent: SupportMe = {
  displayName: "Sam",
  role: "support",
  scopes: [...DEFAULT_SCOPES.support],
};
const reader: SupportMe = { displayName: "Rae", role: "support", scopes: ["support.read"] };

function show(
  me: SupportMe,
  api: SupportApi,
  over: { initial?: InboxPage | null; selectedId?: string | null } = {},
) {
  const onSelect = vi.fn();
  const view = render(
    <SupportScreen
      me={me}
      initial={over.initial === undefined ? page() : over.initial}
      api={api}
      selectedId={over.selectedId ?? null}
      onSelect={onSelect}
    />,
  );
  return { onSelect, view };
}

/** Open a ticket's pane directly (the route holds the selection; the screen is told which one). */
async function openPane(me: SupportMe, api: SupportApi, d: Record<string, unknown> = {}) {
  (api.getTicket as ReturnType<typeof vi.fn>).mockResolvedValue(detail(d));
  const user = userEvent.setup();
  const r = show(me, api, { selectedId: T1 });
  await screen.findByRole("region", { name: "Ticket" });
  await screen.findByLabelText("Conversation");
  return { user, ...r };
}

/** The reason box of the open dialog (the page has other text boxes behind it). */
const dialogBox = () => within(screen.getByRole("dialog")).getByRole("textbox");

afterEach(() => cleanup());

describe("Support: the queue shows the real data it was given", () => {
  it("rows carry the ticket number, snippet, area, the words New / Needs reply / Waiting on learner, and the wait", async () => {
    show(agent, makeApi());
    const row = screen.getByRole("button", { name: /Pro is not showing/ });
    expect(row.textContent).toContain("#7");
    expect(row.textContent).toContain("Billing");
    expect(row.textContent).toContain("Needs reply");
    expect(row.textContent).toContain("Unassigned");
    await waitFor(() => expect(row.querySelector("[data-wait]")!.textContent).toMatch(/^3h \d\dm/));
    expect(screen.getByRole("button", { name: /Cannot log in/ }).textContent).toContain("New");
    const waiting = screen.getByRole("button", { name: /Sent a screenshot/ });
    expect(waiting.textContent).toContain("Waiting on learner");
    expect(waiting.textContent).toContain("Ola");
    expect(screen.getByRole("button", { name: /Cannot log in/ }).textContent).toContain("You");
  });

  it("the tabs and the subtitle carry their real counts; an unreadable count says so, never a 0", () => {
    show(agent, makeApi());
    expect(screen.getByRole("tab", { name: /^Needs reply 5/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Breaching 1/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Waiting on learner 2/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Resolved 9/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^All 16/ })).toBeTruthy();
    const sub = document.querySelector("[data-support-sub]")!.textContent!;
    expect(sub).toContain("5 need a reply");
    expect(sub).toContain("2 unassigned");
    expect(sub).toContain("1 breaching");
    cleanup();
    show(agent, makeApi(), {
      initial: page({ counts: counts({ breaching: null }), breachHours: null }),
    });
    const sub2 = document.querySelector("[data-support-sub]")!.textContent!;
    expect(sub2).toContain("No breach time set breaching");
    expect(screen.queryByRole("tab", { name: /^Breaching \d/ })).toBeNull();
    expect(sub2).not.toMatch(/\b0 breaching/);
  });

  it("a breaching row is marked, and the Breaching tab says which setting it used", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      listTickets: vi.fn(async () =>
        page({
          tickets: [ticket(T1, { breaching: true, waitingSince: hoursAgo(9) })],
          counts: counts(),
        }),
      ),
    });
    show(agent, api);
    await user.click(screen.getByRole("tab", { name: /^Breaching/ }));
    const row = await screen.findByRole("button", { name: /Pro is not showing/ });
    await waitFor(() => expect(row.textContent).toContain("(breaching)"));
    expect(screen.getByText(/longer than/).textContent).toContain("8 h");
    expect(api.listTickets).toHaveBeenCalledWith({
      filter: "breaching",
      assigned: "any",
      cursor: undefined,
    });
  });

  it("each tab and each who-has-it button asks the inbox for exactly that {filter, assigned}", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    show(agent, api);
    const last = () => (api.listTickets as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    await user.click(screen.getByRole("tab", { name: /^Waiting on learner/ }));
    expect(last()).toEqual({ filter: "waiting", assigned: "any", cursor: undefined });
    await user.click(screen.getByRole("button", { name: /^Mine/ }));
    expect(last()).toEqual({ filter: "waiting", assigned: "me", cursor: undefined });
    await user.click(screen.getByRole("tab", { name: /^Resolved/ }));
    expect(last()).toEqual({ filter: "solved", assigned: "me", cursor: undefined });
    await user.click(screen.getByRole("button", { name: /^Unassigned/ }));
    expect(last()).toEqual({ filter: "solved", assigned: "unassigned", cursor: undefined });
    await user.click(screen.getByRole("tab", { name: /^All/ }));
    expect(last()).toEqual({ filter: "all", assigned: "unassigned", cursor: undefined });
    await user.click(screen.getByRole("tab", { name: /^Needs reply/ }));
    await user.click(screen.getByRole("button", { name: /^Anyone/ }));
    expect(last()).toEqual({ filter: "open", assigned: "any", cursor: undefined });
  });

  it("Load more sends the cursor (with its urgent part) and appends", async () => {
    const user = userEvent.setup();
    const next = { at: hoursAgo(4), id: T1, urgent: true };
    const api = makeApi({
      listTickets: vi.fn(async () =>
        page({ tickets: [ticket(T3, { snippet: "Older one", ticketNo: 3 })], next: null }),
      ),
    });
    show(agent, api, { initial: page({ next }) });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(api.listTickets).toHaveBeenCalledWith({ filter: "open", assigned: "any", cursor: next });
    expect(await screen.findByRole("button", { name: /Older one/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pro is not showing/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("an unread list says so; an empty one says it is empty", async () => {
    show(agent, makeApi(), { initial: null });
    expect(screen.getByRole("alert").textContent).toContain("Could not read the tickets");
    cleanup();
    show(agent, makeApi(), { initial: page({ tickets: [], total: 0 }) });
    expect(screen.getByText(/all caught up/)).toBeTruthy();
  });

  it("a failed re-read (a tab) shows the error instead of the stale list", async () => {
    const user = userEvent.setup();
    const api = makeApi({ listTickets: vi.fn(async () => Promise.reject(new Error("x"))) });
    show(agent, api);
    await user.click(screen.getByRole("tab", { name: /^Resolved/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not read the tickets");
  });

  it("the owner sees urgent tickets marked and the urgent count; a support agent sees no count", () => {
    const urgent = page({
      tickets: [ticket(T1, { urgent: true, assignedTo: OTHER, assignedName: "Ola" })],
      counts: counts({ urgent: 1 }),
    });
    show(owner, makeApi(), { initial: urgent });
    expect(screen.getByText("Urgent", { selector: "span.rounded-md" })).toBeTruthy();
    expect(document.querySelector("[data-support-sub]")!.textContent).toContain("1 urgent");
    cleanup();
    show(agent, makeApi(), { initial: urgent });
    expect(document.querySelector("[data-support-sub]")!.textContent).not.toContain("urgent");
  });

  it("selecting a row tells the route, and on a phone the pane's back arrow clears it", async () => {
    const user = userEvent.setup();
    const { onSelect } = show(agent, makeApi());
    await user.click(screen.getByRole("button", { name: /Pro is not showing/ }));
    expect(onSelect).toHaveBeenCalledWith(T1);
    cleanup();
    const second = await openPane(agent, makeApi());
    await second.user.click(screen.getByRole("button", { name: "Back to the list" }));
    expect(second.onSelect).toHaveBeenCalledWith(null);
  });
});

describe("Support: the owner's breach-time control", () => {
  it("is drawn for the owner only", () => {
    show(owner, makeApi());
    expect(screen.getByRole("button", { name: /Breach time/ }).textContent).toContain("8 h");
    cleanup();
    show(agent, makeApi());
    expect(screen.queryByRole("button", { name: /Breach time/ })).toBeNull();
    cleanup();
    show(reader, makeApi());
    expect(screen.queryByRole("button", { name: /Breach time/ })).toBeNull();
    // even an owner-role login whose staff.manage scope is missing gets no control
    cleanup();
    show({ ...owner, scopes: owner.scopes.filter((s) => s !== "staff.manage") }, makeApi());
    expect(screen.queryByRole("button", { name: /Breach time/ })).toBeNull();
  });

  it("needs whole hours 1 to 168 and a reason of 3 or more; then saves and re-reads the list (the setting is read, not a constant)", async () => {
    const user = userEvent.setup();
    let hours = 8;
    const api = makeApi({
      setBreachHours: vi.fn(async (h: number) => {
        hours = h;
        return { ok: true };
      }),
      listTickets: vi.fn(async () =>
        page({
          breachHours: hours,
          tickets: [ticket(T1, { breaching: hours === 8 })],
          counts: counts({ breaching: hours === 8 ? 1 : 0 }),
        }),
      ),
    });
    show(owner, api);
    await user.click(screen.getByRole("button", { name: /Breach time/ }));
    const dialog = screen.getByRole("dialog", { name: "Breach time" });
    const save = within(dialog).getByRole("button", { name: /Save and log/ });
    const hoursBox = within(dialog).getByLabelText(/Hours/);
    const reasonBox = within(dialog).getByLabelText(/Reason/);
    expect((hoursBox as HTMLInputElement).value).toBe("8");
    for (const bad of ["0", "169", "1.5", ""]) {
      await user.clear(hoursBox);
      if (bad) await user.type(hoursBox, bad);
      await user.clear(reasonBox);
      await user.type(reasonBox, "fine reason");
      expect(save, `hours ${bad}`).toBeDisabled();
    }
    await user.clear(hoursBox);
    await user.type(hoursBox, "12");
    await user.clear(reasonBox);
    await user.type(reasonBox, "ab");
    expect(save).toBeDisabled();
    await user.type(reasonBox, "c");
    await user.click(save);
    await waitFor(() => expect(api.setBreachHours).toHaveBeenCalledWith(12, "abc"));
    // the list was re-read with the new setting: nothing is breaching any more
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Breach time/ }).textContent).toContain("12 h"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/\(breaching\)/)).toBeNull();
  });

  it("a refusal is shown in the dialog and nothing closes", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      setBreachHours: vi.fn(async () =>
        Promise.reject(new Error("Only an owner can change settings.")),
      ),
    });
    show(owner, api);
    await user.click(screen.getByRole("button", { name: /Breach time/ }));
    const dialog = screen.getByRole("dialog", { name: "Breach time" });
    await user.type(within(dialog).getByLabelText(/Reason/), "tune the clock");
    await user.click(within(dialog).getByRole("button", { name: /Save and log/ }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Only an owner");
    expect(screen.getByRole("dialog", { name: "Breach time" })).toBeTruthy();
  });
});

describe("Support: a ticket's actions, reasons and role matrix", () => {
  it("shows the number, the status word, the learner's name only when the server sent one, and the wait", async () => {
    await openPane(agent, makeApi(), { displayName: "Ada", ticketNo: 41 });
    const head = screen.getByRole("region", { name: "Ticket" });
    expect(head.textContent).toContain("#41");
    expect(head.textContent).toContain("Needs reply");
    expect(within(head).getByRole("heading", { name: "Ada" })).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector("[data-sla]")!.textContent).toMatch(/Waiting for a reply3h/),
    );
    cleanup();
    await openPane(agent, makeApi(), { displayName: null });
    expect(screen.getByRole("heading", { name: "Support ticket" })).toBeTruthy();
  });

  it("a breaching ticket's wait is marked", async () => {
    await openPane(agent, makeApi(), { breaching: true, waitingSince: hoursAgo(9) });
    await waitFor(() =>
      expect(document.querySelector("[data-sla]")!.textContent).toContain("(breaching)"),
    );
  });

  it("Resolve asks for a reason, cannot submit under 3 characters, and sends the reason", async () => {
    const api = makeApi();
    const { user } = await openPane(agent, api);
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    const dialog = screen.getByRole("dialog", { name: "Resolve this ticket" });
    expect(api.setStatus).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole("button", { name: "Resolve and log" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "ab");
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "c");
    await user.click(confirm);
    await waitFor(() => expect(api.setStatus).toHaveBeenCalledWith(T1, "solved", "abc"));
  });

  it("a suggested reason fills the box and is sent", async () => {
    const api = makeApi();
    const { user } = await openPane(agent, api);
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await user.click(screen.getByRole("button", { name: "Resolve and log" }));
    await waitFor(() => expect(api.setStatus).toHaveBeenCalledWith(T1, "solved", "Duplicate"));
  });

  it("Escape and Cancel close the dialog and change nothing", async () => {
    const api = makeApi();
    const { user } = await openPane(agent, api);
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Waiting on learner" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.setStatus).not.toHaveBeenCalled();
  });

  it("waiting on learner, back to needs reply and reopen each ask for a reason too, and only offer a real change", async () => {
    const api = makeApi();
    const { user } = await openPane(agent, api);
    expect(screen.queryByRole("button", { name: "Needs reply" })).toBeNull(); // already needs reply
    expect(screen.queryByRole("button", { name: "Reopen" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Waiting on learner" }));
    await user.type(dialogBox(), "asked for a screenshot");
    await user.click(screen.getByRole("button", { name: "Change and log" }));
    await waitFor(() =>
      expect(api.setStatus).toHaveBeenCalledWith(T1, "waiting_learner", "asked for a screenshot"),
    );
    cleanup();
    const waiting = makeApi();
    const w = await openPane(agent, waiting, { status: "waiting_learner" });
    expect(screen.queryByRole("button", { name: "Waiting on learner" })).toBeNull();
    await w.user.click(screen.getByRole("button", { name: "Needs reply" }));
    await w.user.type(dialogBox(), "they answered");
    await w.user.click(screen.getByRole("button", { name: "Change and log" }));
    await waitFor(() =>
      expect(waiting.setStatus).toHaveBeenCalledWith(T1, "open", "they answered"),
    );
    cleanup();
    const solvedApi = makeApi();
    const s = await openPane(agent, solvedApi, {
      status: "solved",
      urgent: false,
      solvedAt: hoursAgo(1),
      waitingSince: null,
    });
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assign to me" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hand to owner" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Reply to the learner" })).toBeNull();
    await s.user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(screen.getByRole("dialog", { name: "Reopen this ticket" })).toBeTruthy();
    await s.user.type(dialogBox(), "they wrote back");
    await s.user.click(screen.getByRole("button", { name: "Change and log" }));
    await waitFor(() =>
      expect(solvedApi.setStatus).toHaveBeenCalledWith(T1, "open", "they wrote back"),
    );
  });

  it("a refusal from the server is shown in the dialog (the ticket is not marked changed)", async () => {
    const api = makeApi({
      setStatus: vi.fn(async () =>
        Promise.reject(
          new Error("This chat is too old to reopen; the learner can start a new one."),
        ),
      ),
    });
    const { user } = await openPane(agent, api);
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await user.type(dialogBox(), "done here");
    await user.click(screen.getByRole("button", { name: "Resolve and log" }));
    expect((await screen.findAllByRole("alert")).map((a) => a.textContent).join(" ")).toContain(
      "too old to reopen",
    );
    expect(screen.getByRole("dialog", { name: "Resolve this ticket" })).toBeTruthy();
  });

  it("reply and 'Assign to me' need no reason; a reply sends its text and clears the box", async () => {
    const api = makeApi();
    const { user } = await openPane(agent, api);
    await user.click(screen.getByRole("button", { name: "Assign to me" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith(T1, ME));
    const box = screen.getByRole("textbox", { name: "Reply to the learner" });
    await user.type(box, "On it");
    await user.click(screen.getByRole("button", { name: "Send reply" }));
    await waitFor(() => expect(api.reply).toHaveBeenCalledWith(T1, "On it"));
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(""));
  });

  it("'Assign to me' is not drawn on a ticket you hold; 'Give back' is, and needs no reason", async () => {
    const api = makeApi();
    const { user } = await openPane(agent, api, { assignedTo: ME });
    expect(screen.queryByRole("button", { name: "Assign to me" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Give back" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith(T1, null));
  });

  it("an internal note is sent with its own text and no reason", async () => {
    const api = makeApi();
    const { user } = await openPane(agent, api);
    await user.type(screen.getByRole("textbox", { name: "New internal note" }), "check the store");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(api.note).toHaveBeenCalledWith(T1, "check the store"));
  });

  it("Hand to owner: a support agent gets it (with a reason dialog); the reason is sent; hidden once urgent and for owners", async () => {
    const api = makeApi();
    const { user } = await openPane(agent, api);
    await user.click(screen.getByRole("button", { name: "Hand to owner" }));
    const dialog = screen.getByRole("dialog", { name: "Hand to owner" });
    const confirm = within(dialog).getByRole("button", { name: "Hand over and log" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "Chargeback threat");
    await user.click(confirm);
    await waitFor(() => expect(api.handToOwner).toHaveBeenCalledWith(T1, "Chargeback threat"));
    cleanup();
    // already urgent: no button that would do nothing
    await openPane(agent, makeApi(), { urgent: true, assignedTo: OTHER, assignedName: "Olga" });
    expect(screen.queryByRole("button", { name: "Hand to owner" })).toBeNull();
    expect(screen.getByText("Urgent", { selector: "span.rounded-md" })).toBeTruthy();
    cleanup();
    // an owner has nobody above them
    await openPane(owner, makeApi());
    expect(screen.queryByRole("button", { name: "Hand to owner" })).toBeNull();
  });

  it("Hand to owner needs support.assign: a read-and-reply agent never sees it, nor Assign", async () => {
    await openPane({ ...agent, scopes: ["support.read", "support.reply"] }, makeApi());
    expect(screen.queryByRole("button", { name: "Hand to owner" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assign to me" })).toBeNull();
    expect(screen.getByRole("button", { name: "Resolve" })).toBeTruthy();
  });

  it("Clear urgent: only the owner, only on an urgent ticket, with a reason", async () => {
    const api = makeApi();
    const { user } = await openPane(owner, api, { urgent: true, assignedTo: ME });
    await user.click(screen.getByRole("button", { name: "Clear urgent" }));
    await user.type(dialogBox(), "handled it");
    await user.click(screen.getByRole("button", { name: "Clear and log" }));
    await waitFor(() => expect(api.clearUrgent).toHaveBeenCalledWith(T1, "handled it"));
    cleanup();
    await openPane(owner, makeApi(), { urgent: false });
    expect(screen.queryByRole("button", { name: "Clear urgent" })).toBeNull();
    cleanup();
    await openPane(agent, makeApi(), { urgent: true, assignedTo: OTHER });
    expect(screen.queryByRole("button", { name: "Clear urgent" })).toBeNull();
  });

  it("the owner can hand a ticket to a colleague (a reason is required) or unassign someone else's; an agent cannot", async () => {
    const api = makeApi();
    const { user } = await openPane(owner, api, { assignedTo: OTHER, assignedName: "Ola" });
    await waitFor(() => expect(api.listAssignable).toHaveBeenCalled());
    const pick = await screen.findByRole("combobox", { name: "Assign to someone else" });
    // the current holder is not offered (that would be a no-op)
    expect(within(pick).queryByRole("option", { name: "Ola" })).toBeNull();
    await user.selectOptions(pick, ME);
    const dialog = screen.getByRole("dialog", { name: "Take over this ticket" });
    expect(api.assign).not.toHaveBeenCalled();
    await user.type(within(dialog).getByRole("textbox"), "Olga knows billing");
    await user.click(within(dialog).getByRole("button", { name: "Assign and log" }));
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith(T1, ME, "Olga knows billing"));
    cleanup();
    const api2 = makeApi();
    const o2 = await openPane(owner, api2, { assignedTo: OTHER, assignedName: "Ola" });
    await o2.user.click(screen.getByRole("button", { name: "Unassign" }));
    await o2.user.type(dialogBox(), "Ola is away");
    await o2.user.click(screen.getByRole("button", { name: "Assign and log" }));
    await waitFor(() => expect(api2.assign).toHaveBeenCalledWith(T1, null, "Ola is away"));
    cleanup();
    const apiAgent = makeApi();
    await openPane(agent, apiAgent, { assignedTo: OTHER, assignedName: "Ola" });
    expect(screen.queryByRole("combobox", { name: "Assign to someone else" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unassign" })).toBeNull();
    expect(apiAgent.listAssignable).not.toHaveBeenCalled();
  });

  it("a read-only viewer sees the ticket and no buttons or reply box", async () => {
    await openPane(reader, makeApi());
    const pane = screen.getByRole("region", { name: "Ticket" });
    // the only button is the phone back arrow: no action, no quick-reply chip, no send
    expect(
      within(pane)
        .queryAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Back to the list"]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/can read tickets but not reply/)).toBeTruthy();
  });

  it("an unreadable ticket says so and offers no actions", async () => {
    const api = makeApi({
      getTicket: vi.fn(async () => Promise.reject(new Error("That ticket does not exist."))),
    });
    show(agent, api, { selectedId: T1 });
    expect((await screen.findByRole("alert")).textContent).toContain("does not exist");
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
  });

  it("learner text is shown as plain text, never as markup", async () => {
    await openPane(agent, makeApi(), {
      messages: [
        {
          id: 1,
          kind: "learner",
          body: "<img src=x onerror=alert(1)> hi",
          at: hoursAgo(1),
          authorName: null,
        },
      ],
    });
    expect(document.querySelector("img[src='x']")).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeTruthy();
  });

  it("learner facts use Figure: a missing fact set says so, a present one shows real numbers", async () => {
    const facts = {
      pro: { active: true, source: "store", until: null, unavailable: false },
      course: "fr",
      level: "A2",
      streak: 12,
      streakProtected: false,
      streakFreezes: 0,
      daysActiveLast30: 21,
      lastActiveDay: "2026-11-13",
      lessonsLast7Days: 9,
      lastLessonDay: "2026-11-13",
      platforms: ["ios"],
      socialBlocked: false,
      previousTickets: [],
    };
    await openPane(agent, makeApi(), { facts, factsSource: "ai" });
    const facts_ = document.querySelector("details")!;
    expect(facts_.textContent).toContain("12 days");
    expect(facts_.textContent).toContain("21");
    expect(facts_.textContent).toContain("French, A2");
    cleanup();
    await openPane(agent, makeApi(), { facts: null });
    expect(document.querySelector("details")!.textContent).toContain("could not be loaded");
  });
});

describe("Support: the legacy page's every action is reachable here", () => {
  it("the ticket's learner-page link appears only with users.read data (learnerId)", async () => {
    await openPane(agent, makeApi(), { learnerId: "u-1" });
    expect(document.querySelector("a[href='/users/u-1']")).toBeTruthy();
    cleanup();
    await openPane(agent, makeApi(), { learnerId: null });
    expect(document.querySelector("a[href^='/users/']")).toBeNull();
  });
});

describe("Support: taking over a ticket someone else holds (L2)", () => {
  it("'Assign to me' on another person's (or an owner's urgent) ticket asks for a reason first", async () => {
    const api = makeApi();
    const { user } = await openPane(agent, api, {
      assignedTo: OTHER,
      assignedName: "Ola",
      urgent: true,
    });
    await user.click(screen.getByRole("button", { name: "Assign to me" }));
    const dialog = screen.getByRole("dialog", { name: "Take over this ticket" });
    expect(api.assign).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole("button", { name: "Assign and log" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "Ola is away");
    await user.click(confirm);
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith(T1, ME, "Ola is away"));
  });

  it("picking up an unassigned ticket and giving back your own stay reason-free", async () => {
    const api = makeApi();
    const { user } = await openPane(agent, api, { assignedTo: null });
    await user.click(screen.getByRole("button", { name: "Assign to me" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith(T1, ME));
  });
});

describe("Support: focus and ordering", () => {
  it("the breach-time dialog keeps focus where the person put it across the 30-second re-render", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const user = userEvent.setup();
      show(owner, makeApi());
      await user.click(screen.getByRole("button", { name: /Breach time/ }));
      const dialog = screen.getByRole("dialog", { name: "Breach time" });
      expect(document.activeElement).toBe(within(dialog).getByLabelText(/Hours/));
      within(dialog)
        .getByLabelText(/Reason/)
        .focus();
      act(() => {
        vi.advanceTimersByTime(30_000);
        vi.advanceTimersByTime(30_000);
      });
      expect(document.activeElement).toBe(within(dialog).getByLabelText(/Reason/));
    } finally {
      vi.useRealTimers();
    }
  });

  it("an older list answer that arrives late does not replace the newest one", async () => {
    const user = userEvent.setup();
    let releaseSlow: (p: InboxPage) => void = () => {};
    const slow = new Promise<InboxPage>((r) => (releaseSlow = r));
    const api = makeApi({
      listTickets: vi.fn(async (q) =>
        q.filter === "solved"
          ? slow
          : page({ tickets: [ticket(T2, { snippet: "The newest answer", ticketNo: 2 })] }),
      ),
    });
    show(agent, api);
    await user.click(screen.getByRole("tab", { name: /^Resolved/ })); // slow, still in flight
    await user.click(screen.getByRole("tab", { name: /^All/ })); // answers at once
    expect(await screen.findByRole("button", { name: /The newest answer/ })).toBeTruthy();
    await act(async () =>
      releaseSlow(page({ tickets: [ticket(T3, { snippet: "A stale answer" })] })),
    );
    expect(screen.queryByRole("button", { name: /A stale answer/ })).toBeNull();
    expect(screen.getByRole("button", { name: /The newest answer/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^All/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("unknown learner facts read 'Unknown', never 'never' or 'none yet'", async () => {
    const facts = {
      pro: { active: false, source: "none", until: null, unavailable: false },
      course: null,
      level: null,
      streak: 0,
      streakProtected: false,
      streakFreezes: 0,
      daysActiveLast30: 0,
      lastActiveDay: null,
      lessonsLast7Days: 0,
      lastLessonDay: null,
      platforms: [],
      socialBlocked: false,
      previousTickets: [],
    };
    await openPane(agent, makeApi(), { facts, factsSource: "ai" });
    const text = document.querySelector("details")!.textContent!;
    expect(text).toContain("Unknown");
    expect(text).not.toMatch(/never|none yet/);
  });
});
