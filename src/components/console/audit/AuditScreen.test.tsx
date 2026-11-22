// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditScreen } from "./AuditScreen";
import { filtersFor } from "./auditFilters";
import type { AuditActor, AuditApi, AuditPage, AuditRow } from "./auditApi";

afterEach(() => cleanup());

const OLIVE = "40000000-0000-4000-8000-000000000001";
const SAM = "40000000-0000-4000-8000-000000000002";
const LEARNER = "50000000-0000-4000-8000-000000000001";
const GONE = "50000000-0000-4000-8000-000000000002";

const row = (id: number, over: Partial<AuditRow> = {}): AuditRow => ({
  id,
  at: "2026-11-20T12:00:00Z",
  actorUserId: OLIVE,
  actorName: "Olive",
  actorRole: "owner",
  action: "user.ban",
  targetUserId: LEARNER,
  targetName: "Maya",
  reason: "bot and spam",
  before: null,
  after: null,
  ...over,
});
const ACTORS: AuditActor[] = [
  { userId: OLIVE, displayName: "Olive", role: "owner", disabled: false },
  { userId: SAM, displayName: null, role: "support", disabled: true },
];

function makeApi(over: Partial<AuditApi> = {}): AuditApi {
  return {
    list: vi.fn(async (): Promise<AuditPage> => ({ rows: [row(2), row(1)], nextCursor: null })),
    actors: vi.fn(async () => ACTORS),
    ...over,
  };
}
async function show(api: AuditApi = makeApi()) {
  const user = userEvent.setup();
  render(<AuditScreen api={api} />);
  await screen.findByRole("list", { name: "Action record" });
  return user;
}
const rows = () => Array.from(document.querySelectorAll("[data-audit-row]")) as HTMLElement[];
const lastList = (api: AuditApi) => {
  const calls = (api.list as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1]!;
};

describe("what each entry shows", () => {
  it("reads the whole record once with no filter, and shows who, what, to whom, when and why", async () => {
    const api = makeApi();
    await show(api);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(lastList(api)).toEqual([{}]);
    const first = rows()[0]!;
    expect(within(first).getByText("Banned")).toBeTruthy();
    expect(first.querySelector("[data-audit-target]")?.textContent).toBe("Maya");
    expect(first.querySelector("[data-audit-actor]")?.textContent).toBe("Olive");
    expect(within(first).getByText(/Owner/)).toBeTruthy();
    expect(within(first).getByText("bot and spam")).toBeTruthy();
    expect(within(first).getByText(/20 Nov 2026/)).toBeTruthy();
  });

  it("falls back to the short id when a name is missing, and says when no reason or actor was recorded", async () => {
    const api = makeApi({
      list: vi.fn(async () => ({
        rows: [
          row(3, { targetName: null, targetUserId: GONE, actorName: null, reason: null }),
          row(2, {
            actorUserId: null,
            actorName: null,
            actorRole: "support_ai",
            targetUserId: null,
          }),
          row(1, { actorUserId: null, actorName: null, actorRole: "owner", targetUserId: null }),
        ],
        nextCursor: null,
      })),
    });
    await show(api);
    const [a, b, c] = rows();
    expect(a!.querySelector("[data-audit-target]")?.textContent).toBe("50000000…");
    expect(a!.querySelector("[data-audit-actor]")?.textContent).toBe("40000000…");
    expect(within(a!).getByText("No reason recorded")).toBeTruthy();
    expect(within(b!).getByText("Support AI")).toBeTruthy();
    expect(b!.querySelector("[data-audit-target]")).toBeNull();
    expect(within(c!).getByText("No actor recorded")).toBeTruthy();
  });

  it("an unknown action code is shown as the raw code, never hidden", async () => {
    const api = makeApi({
      list: vi.fn(async () => ({
        rows: [row(1, { action: "billing.refund_everything", targetUserId: null })],
        nextCursor: null,
      })),
    });
    await show(api);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.querySelector("[data-audit-action]")?.textContent).toBe(
      "billing.refund_everything",
    );
  });

  it("joins a person-directed action to the name with a space and others with a dot", async () => {
    const api = makeApi({
      list: vi.fn(async () => ({
        rows: [row(2), row(1, { action: "report.dismiss" })],
        nextCursor: null,
      })),
    });
    await show(api);
    expect(rows()[0]!.querySelector("[data-audit-sentence]")?.textContent).toBe("Banned Maya");
    expect(rows()[1]!.querySelector("[data-audit-sentence]")?.textContent).toBe(
      "Dismissed a report · Maya",
    );
  });

  it("expands before and after, and says when one side recorded nothing", async () => {
    const api = makeApi({
      list: vi.fn(async () => ({
        rows: [row(2, { before: { restricted: false }, after: null }), row(1)],
        nextCursor: null,
      })),
    });
    const user = await show(api);
    // a row with nothing recorded offers no expander
    expect(within(rows()[1]!).queryByRole("button", { name: /before and after/i })).toBeNull();
    const toggle = within(rows()[0]!).getByRole("button", { name: "Before and after" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(rows()[0]!.querySelector("[data-audit-json=before]")?.textContent).toContain(
      '"restricted": false',
    );
    expect(rows()[0]!.querySelector("[data-audit-json=after]")?.textContent).toBe(
      "Nothing recorded",
    );
    await user.click(toggle);
    expect(rows()[0]!.querySelector("[data-audit-json=before]")).toBeNull();
  });

  it("keeps the append-only note as copy", async () => {
    await show();
    expect(screen.getByText(/Append-only\./)).toBeTruthy();
  });
});

describe("the filters send the right payload to the server", () => {
  it("lists the staff from the actors call (a name, or the short id, with role and suspended)", async () => {
    await show();
    const select = screen.getByLabelText("Staff") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual(["All staff", "Olive (Owner)", "40000000… (Support, suspended)"]);
  });

  it("a staff person sends their id as the actor", async () => {
    const api = makeApi();
    const user = await show(api);
    await user.selectOptions(screen.getByLabelText("Staff"), OLIVE);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(lastList(api)).toEqual([{ actor: OLIVE }]);
  });

  it("a category sends its action prefixes", async () => {
    const api = makeApi();
    const user = await show(api);
    await user.selectOptions(screen.getByLabelText("Action"), "Moderation");
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(lastList(api)).toEqual([{ actions: ["user.", "note.", "report."] }]);
    await user.selectOptions(screen.getByLabelText("Action"), "Staff and settings");
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(3));
    expect(lastList(api)).toEqual([{ actions: ["staff.", "settings."] }]);
  });

  it("text searches the reason on Search or Enter; a pasted learner id searches that learner instead", async () => {
    const api = makeApi();
    const user = await show(api);
    await user.type(screen.getByLabelText("Find"), "bot and{Enter}");
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(lastList(api)).toEqual([{ q: "bot and" }]);
    await user.clear(screen.getByLabelText("Find"));
    await user.type(screen.getByLabelText("Find"), LEARNER);
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(3));
    expect(lastList(api)).toEqual([{ target: LEARNER }]);
  });

  it("a date range sends the first and last instant of those days (UTC)", async () => {
    const api = makeApi();
    const user = await show(api);
    await user.type(screen.getByLabelText("From"), "2026-11-01");
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(lastList(api)).toEqual([{ from: "2026-11-01T00:00:00.000Z" }]);
    await user.type(screen.getByLabelText("To"), "2026-11-30");
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(3));
    expect(lastList(api)).toEqual([
      { from: "2026-11-01T00:00:00.000Z", to: "2026-11-30T23:59:59.000Z" },
    ]);
  });

  it("filters combine, and Clear filters goes back to the whole record", async () => {
    const api = makeApi();
    const user = await show(api);
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Staff"), OLIVE);
    await user.selectOptions(screen.getByLabelText("Action"), "Billing");
    await user.type(screen.getByLabelText("Find"), "gift{Enter}");
    await waitFor(() =>
      expect(lastList(api)).toEqual([{ actor: OLIVE, actions: ["pro."], q: "gift" }]),
    );
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastList(api)).toEqual([{}]));
    expect((screen.getByLabelText("Find") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Staff") as HTMLSelectElement).value).toBe("");
  });

  it("filtersFor is the whole mapping: nothing chosen sends nothing, blank text is ignored", () => {
    const base = { actor: "", category: "", text: "", from: "", to: "" };
    expect(filtersFor(base)).toEqual({});
    expect(filtersFor({ ...base, text: "   " })).toEqual({});
    expect(filtersFor({ ...base, category: "nope" })).toEqual({});
  });

  it("an empty result says nothing matches these filters (and a clean empty record says so)", async () => {
    const api = makeApi({ list: vi.fn(async () => ({ rows: [], nextCursor: null })) });
    const user = await show(api);
    expect(screen.getByText("The action record is empty.")).toBeTruthy();
    await user.type(screen.getByLabelText("Find"), "zzz{Enter}");
    await screen.findByText("Nothing matches these filters.");
  });
});

describe("Load more", () => {
  it("appends the next page after the cursor, keeps the filters, and goes away at the end", async () => {
    const list = vi
      .fn<AuditApi["list"]>()
      .mockResolvedValueOnce({ rows: [row(4), row(3)], nextCursor: 3 })
      .mockResolvedValueOnce({ rows: [row(2), row(1)], nextCursor: null });
    const api = makeApi({ list });
    const user = userEvent.setup();
    render(<AuditScreen api={api} />);
    await screen.findByRole("button", { name: "Load more" });
    expect(rows()).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(rows()).toHaveLength(4));
    expect(list).toHaveBeenLastCalledWith({}, 3);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("sends the active filters with the cursor", async () => {
    const list = vi
      .fn<AuditApi["list"]>()
      .mockResolvedValueOnce({ rows: [row(4)], nextCursor: null })
      .mockResolvedValueOnce({ rows: [row(9), row(8)], nextCursor: 8 })
      .mockResolvedValueOnce({ rows: [row(7)], nextCursor: null });
    const api = makeApi({ list });
    const user = await show(api);
    await user.selectOptions(screen.getByLabelText("Action"), "Billing");
    await screen.findByRole("button", { name: "Load more" });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(list).toHaveBeenLastCalledWith({ actions: ["pro."] }, 8);
  });

  it("a failed page keeps what is shown, says so, and can be tried again", async () => {
    const list = vi
      .fn<AuditApi["list"]>()
      .mockResolvedValueOnce({ rows: [row(4), row(3)], nextCursor: 3 })
      .mockRejectedValueOnce(new Error("Too many reads. Wait a minute and try again."))
      .mockResolvedValueOnce({ rows: [row(2)], nextCursor: null });
    const user = userEvent.setup();
    render(<AuditScreen api={makeApi({ list })} />);
    await user.click(await screen.findByRole("button", { name: "Load more" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/too many reads/i);
    expect(rows()).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a page that arrives after the filters changed is dropped, not mixed in", async () => {
    let release: (p: AuditPage) => void = () => {};
    const slow = new Promise<AuditPage>((r) => (release = r));
    const list = vi
      .fn<AuditApi["list"]>()
      .mockResolvedValueOnce({ rows: [row(4)], nextCursor: 4 })
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce({ rows: [row(50, { reason: "fresh" })], nextCursor: null });
    const user = userEvent.setup();
    render(<AuditScreen api={makeApi({ list })} />);
    await user.click(await screen.findByRole("button", { name: "Load more" }));
    await user.selectOptions(screen.getByLabelText("Action"), "Billing");
    await screen.findByText("fresh");
    release({ rows: [row(1, { reason: "stale" })], nextCursor: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("stale")).toBeNull();
    expect(rows()).toHaveLength(1);
  });
});

describe("honest states when a read fails (no figure, no empty record passed off as real)", () => {
  it("a failed record read says so with a retry, shows no entries and no digit in any figure", async () => {
    const list = vi
      .fn<AuditApi["list"]>()
      .mockRejectedValueOnce(new Error("Could not read the action record."))
      .mockResolvedValueOnce({ rows: [row(1)], nextCursor: null });
    const user = userEvent.setup();
    render(<AuditScreen api={makeApi({ list })} />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not read the action record.",
    );
    expect(rows()).toHaveLength(0);
    expect(document.querySelectorAll("[data-figure]")).toHaveLength(0);
    expect(document.querySelector("[data-figure-absent]")?.textContent).toBe("Could not read");
    expect(screen.queryByText(/Nothing matches|record is empty/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
  });

  it("while loading, the count is not a number either", async () => {
    render(<AuditScreen api={makeApi({ list: () => new Promise(() => {}) })} />);
    await screen.findByText("Loading the action record…");
    expect(document.querySelectorAll("[data-figure]")).toHaveLength(0);
    expect(document.querySelector("[data-figure-absent]")?.textContent).toBe("Loading");
  });

  it("the entry count is a real figure when the record is read", async () => {
    await show();
    expect(document.querySelector("[data-figure]")?.textContent).toBe("2");
    expect(document.querySelector("[data-figure-absent]")).toBeNull();
  });

  it("when the staff list cannot be read the staff filter is off and says so; the others still work", async () => {
    const api = makeApi({
      actors: vi.fn(async () => {
        throw new Error("down");
      }),
    });
    const user = await show(api);
    const select = screen.getByLabelText("Staff") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.options[0]!.textContent).toBe("Could not read staff");
    expect(screen.getByText(/staff list could not be read/i)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Action"), "Billing");
    await waitFor(() => expect(lastList(api)).toEqual([{ actions: ["pro."] }]));
  });
});

describe("the layout holds at phone width (no 375 px e2e exists for the admin app yet)", () => {
  it("is stacked cards with no table, which only become columns from the md breakpoint, and never scrolls sideways", async () => {
    await show();
    expect(document.querySelector("table")).toBeNull();
    const li = rows()[0]!;
    expect(li.className).toContain("md:grid-cols-");
    expect(li.className).not.toMatch(/(^|\s)grid-cols-/);
    expect(document.querySelector("main")?.innerHTML).not.toMatch(/min-w-\[(?!12rem)/);
    // every control is at least 44 px tall (min-h-11) so a thumb can hit it
    for (const el of Array.from(document.querySelectorAll("select, input, button"))) {
      expect((el as HTMLElement).className, el.outerHTML.slice(0, 60)).toMatch(/min-h-11/);
    }
  });
});
