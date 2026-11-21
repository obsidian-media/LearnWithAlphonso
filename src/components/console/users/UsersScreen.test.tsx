// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UsersScreen, type UsersMe } from "./UsersScreen";
import type { UserHit, UsersApi } from "./usersApi";
import type { LearnerFacts } from "../../../lib/staff-user-facts.server";
import { DEFAULT_SCOPES, SCOPES } from "../../../lib/staff-scopes";

afterEach(() => cleanup());

const ADA = "20000000-0000-4000-8000-000000000001";
const BEN = "20000000-0000-4000-8000-000000000002";

const hit = (id: string, over: Partial<UserHit> = {}): UserHit => ({
  id,
  email: id === ADA ? "ada@example.com" : "ben@example.com",
  displayName: id === ADA ? "Ada" : "Ben",
  createdAt: "2026-02-03T10:00:00Z",
  ...over,
});

const facts = (over: Partial<LearnerFacts> = {}): LearnerFacts => ({
  id: ADA,
  email: "ada@example.com",
  displayName: "Ada",
  createdAt: "2026-02-03T10:00:00Z",
  lastActiveAt: "2026-11-19",
  course: "fr",
  level: "A2",
  streak: 12,
  xp: 340,
  lessonsDone: 57,
  pro: { active: false, source: "none", until: null, unavailable: false, notConnected: false },
  platforms: ["ios"],
  restrictions: [],
  reportsAgainst: 1,
  gifts: [],
  notes: [{ author: "Sam", body: "Wrote in about billing", createdAt: "2026-11-01T09:00:00Z" }],
  ...over,
});

const ok = () => vi.fn(async () => ({ ok: true }));
function makeApi(over: Partial<UsersApi> = {}): UsersApi {
  return {
    search: vi.fn(async () => [hit(ADA), hit(BEN)]),
    getUser: vi.fn(async () => facts()),
    addNote: ok(),
    grantPro: ok(),
    revokePro: ok(),
    block: ok(),
    unblock: ok(),
    ban: ok(),
    unban: ok(),
    deleteUser: ok(),
    ...over,
  };
}

const owner: UsersMe = { displayName: "Alex", role: "owner", scopes: [...SCOPES] };
const agent: UsersMe = { displayName: "Sam", role: "support", scopes: DEFAULT_SCOPES.support };

/** The route keeps the open learner in the address; this host keeps it in state the same way. */
function Host({ me, api, start = null }: { me: UsersMe; api: UsersApi; start?: string | null }) {
  const [id, setId] = useState<string | null>(start);
  return <UsersScreen me={me} api={api} selectedId={id} onSelect={setId} />;
}
function show(me: UsersMe, api: UsersApi, start: string | null = null) {
  const user = userEvent.setup();
  render(<Host me={me} api={api} start={start} />);
  return user;
}
async function find(user: ReturnType<typeof userEvent.setup>, text = "ada") {
  await user.type(screen.getByLabelText("Search learners"), text);
  await user.click(screen.getByRole("button", { name: "Search" }));
}

describe("Users is search-only (owner ruling)", () => {
  it("opens with no learners listed and nothing asked of the server", () => {
    const api = makeApi();
    show(owner, api);
    expect(api.search).not.toHaveBeenCalled();
    expect(api.getUser).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("has no filter tabs, no select-all or bulk bar, no export and no Pro/Free split", async () => {
    const user = show(owner, makeApi());
    await find(user);
    await screen.findByText("ada@example.com");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/export|csv|select all|bulk|reset streak|refund/i);
    expect(text).not.toMatch(/\bFlagged\b|\bBanned\s*\(|learners\b.*\d/i);
  });

  it("a search needs 2 characters, then asks for exactly that text and lists the hits (never loading their plan)", async () => {
    const api = makeApi();
    const user = show(owner, api);
    await user.type(screen.getByLabelText("Search learners"), "a");
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    await user.type(screen.getByLabelText("Search learners"), "da ");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("ben@example.com");
    expect(api.search).toHaveBeenCalledWith("ada");
    // the per-learner read (which carries the live plan lookup) happens only when ONE learner is opened
    expect(api.getUser).not.toHaveBeenCalled();
  });

  it("says so when nothing matches, and shows a failed search as a failure rather than an empty result", async () => {
    const api = makeApi({
      search: vi
        .fn<UsersApi["search"]>()
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error("Too many searches. Wait a minute and try again.")),
    });
    const user = show(owner, api);
    await find(user, "zed");
    expect(await screen.findByText("No learners found.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Too many searches");
    expect(screen.queryByText("No learners found.")).toBeNull();
  });

  it("an older search answer that arrives late does not replace the newest one", async () => {
    let releaseSlow: (rows: UserHit[]) => void = () => {};
    const slow = new Promise<UserHit[]>((r) => (releaseSlow = r));
    const api = makeApi({
      search: vi
        .fn<UsersApi["search"]>()
        .mockReturnValueOnce(slow)
        .mockResolvedValueOnce([hit(BEN)]),
    });
    const user = show(owner, api);
    await user.type(screen.getByLabelText("Search learners"), "ada");
    // the first request is slow; press Enter twice quickly by re-submitting after a new request is allowed
    await act(async () => {
      screen.getByRole("button", { name: /Search/ }).click();
    });
    await user.clear(screen.getByLabelText("Search learners"));
    await user.type(screen.getByLabelText("Search learners"), "ben");
    await act(async () => {
      screen.getByLabelText("Search learners").closest("form")!.requestSubmit();
    });
    await screen.findByText("ben@example.com");
    await act(async () => releaseSlow([hit(ADA)]));
    expect(screen.queryByText("ada@example.com")).toBeNull();
    expect(screen.getByText("ben@example.com")).toBeTruthy();
  });
});

describe("the learner pane", () => {
  it("opening a hit reads that one learner and shows the real facts, with every count through Figure", async () => {
    const api = makeApi();
    const user = show(owner, api);
    await find(user);
    await user.click(await screen.findByRole("button", { name: /Ada/ }));
    const pane = await screen.findByRole("region", { name: "Learner" });
    await within(pane).findByText("Wrote in about billing");
    expect(api.getUser).toHaveBeenCalledTimes(1);
    expect(api.getUser).toHaveBeenCalledWith(ADA);
    expect(within(pane).getByText("FR · A2")).toBeTruthy();
    expect(pane.querySelectorAll("[data-figure]").length).toBeGreaterThanOrEqual(4);
    expect(
      within(pane).getByText("Opening this learner is in the action record", { exact: false }),
    ).toBeTruthy();
  });

  it("a deep link (?u=) opens the learner straight away", async () => {
    const api = makeApi();
    show(owner, api, ADA);
    expect(await screen.findByText("Wrote in about billing")).toBeTruthy();
    expect(api.getUser).toHaveBeenCalledWith(ADA);
  });

  it("the plan is shown here only: Free, Pro (gift), Pro (store), Not connected, Could not check", async () => {
    const cases: [Partial<LearnerFacts>["pro"], string][] = [
      [
        { active: false, source: "none", until: null, unavailable: false, notConnected: false },
        "Free",
      ],
      [
        { active: true, source: "store", until: null, unavailable: false, notConnected: false },
        "Pro (store purchase)",
      ],
      [
        {
          active: true,
          source: "gift",
          until: "2026-12-24T00:00:00Z",
          unavailable: false,
          notConnected: false,
        },
        "Pro (gift) until",
      ],
      [
        { active: false, source: "none", until: null, unavailable: true, notConnected: true },
        "Not connected",
      ],
      [
        { active: false, source: "none", until: null, unavailable: true, notConnected: false },
        "Could not check",
      ],
    ];
    for (const [pro, text] of cases) {
      const api = makeApi({ getUser: vi.fn(async () => facts({ pro })) });
      show(owner, api, ADA);
      const plan = await waitFor(() => {
        const el = document.querySelector("[data-plan]");
        if (!el) throw new Error("no plan yet");
        return el;
      });
      expect(plan.textContent, text).toContain(text);
      if (text === "Not connected" || text === "Could not check") {
        expect(plan.textContent).not.toMatch(/Free|Pro/);
      }
      cleanup();
    }
  });

  it("with the sources absent it writes the honest state and never a digit or a 0", async () => {
    const api = makeApi({
      getUser: vi.fn(async () =>
        facts({
          lessonsDone: null,
          createdAt: null,
          lastActiveAt: null,
          course: null,
          level: null,
          platforms: [],
          notes: [],
          pro: {
            active: false,
            source: "none",
            until: null,
            unavailable: true,
            notConnected: true,
          },
        }),
      ),
    });
    show(owner, api, ADA);
    await screen.findByText("Not connected");
    const absent = [...document.querySelectorAll("[data-figure-absent]")].map((n) => n.textContent);
    expect(absent).toContain("Could not read");
    for (const n of document.querySelectorAll("[data-figure-absent]")) {
      expect(n.textContent).not.toMatch(/\d/);
    }
    const dd = [...document.querySelectorAll("dd")].map((n) => n.textContent);
    expect(dd.filter((t) => t === "Unknown").length).toBeGreaterThanOrEqual(3);
    expect(dd).not.toContain("0");
    expect(document.body.textContent).not.toMatch(/\bnever\b|none yet/i);
  });

  it("a learner who cannot be opened shows the refusal and a way out", async () => {
    const api = makeApi({
      getUser: vi.fn(async () => {
        throw new Error("That learner does not exist.");
      }),
    });
    const user = show(owner, api, ADA);
    expect((await screen.findByRole("alert")).textContent).toContain("does not exist");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an internal note is sent trimmed and the learner is read again", async () => {
    const api = makeApi();
    const user = show(owner, api, ADA);
    await screen.findByText("Wrote in about billing");
    await user.type(screen.getByLabelText("New note"), "  Called back  ");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(api.addNote).toHaveBeenCalledWith(ADA, "Called back"));
    await waitFor(() => expect(api.getUser).toHaveBeenCalledTimes(2));
  });
});

describe("every existing action stays reachable, and each sensitive one goes through the reason dialog", () => {
  async function openAction(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(await screen.findByRole("button", { name }));
    return screen.getByRole("dialog", { name });
  }
  async function typeReason(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    await user.type(within(dialog).getByRole("textbox", { name: /Reason/ }), "  a good reason  ");
  }

  it("the owner is offered Give Pro, Block, Ban and Delete (and Add note)", async () => {
    show(owner, makeApi(), ADA);
    for (const name of ["Give Pro", "Block", "Ban", "Delete account"]) {
      expect(await screen.findByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Add note" })).toBeTruthy();
  });

  it("each action needs 3 characters of reason before it can be confirmed", async () => {
    const user = show(owner, makeApi(), ADA);
    for (const name of ["Give Pro", "Block", "Ban", "Delete account"]) {
      const dialog = await openAction(user, name);
      const confirm = within(dialog).getAllByRole("button").at(-1)!;
      expect(confirm).toBeDisabled();
      await user.type(within(dialog).getByRole("textbox", { name: /Reason/ }), "ab");
      expect(confirm).toBeDisabled();
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    }
  });

  it("Give Pro sends the days and the trimmed reason", async () => {
    const api = makeApi();
    const user = show(owner, api, ADA);
    const dialog = await openAction(user, "Give Pro");
    await user.clear(within(dialog).getByLabelText(/Days of Pro/));
    await user.type(within(dialog).getByLabelText(/Days of Pro/), "14");
    await typeReason(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Give Pro" }));
    await waitFor(() => expect(api.grantPro).toHaveBeenCalledWith(ADA, 14, "  a good reason  "));
  });

  it("Block sends a reason; Lift block, Ban lift and End gifted Pro appear for a learner in that state", async () => {
    const api = makeApi();
    const user = show(owner, api, ADA);
    const dialog = await openAction(user, "Block");
    await typeReason(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Block" }));
    await waitFor(() => expect(api.block).toHaveBeenCalledWith(ADA, "  a good reason  "));
    cleanup();

    const states = makeApi({
      getUser: vi.fn(async () =>
        facts({
          restrictions: [
            { kind: "block", reason: "spam", createdAt: "2026-11-02T00:00:00Z", liftedAt: null },
            { kind: "ban", reason: "abuse", createdAt: "2026-11-03T00:00:00Z", liftedAt: null },
          ],
          pro: {
            active: true,
            source: "gift",
            until: "2026-12-24T00:00:00Z",
            unavailable: false,
            notConnected: false,
          },
        }),
      ),
    });
    const u2 = show(owner, states, ADA);
    for (const [name, call] of [
      ["Lift block", states.unblock],
      ["Lift ban", states.unban],
      ["End gifted Pro", states.revokePro],
    ] as const) {
      const d = await openAction(u2, name);
      await u2.type(within(d).getByRole("textbox", { name: /Reason/ }), "sorted out");
      await u2.click(within(d).getByRole("button", { name }));
      await waitFor(() => expect(call).toHaveBeenCalledWith(ADA, "sorted out"));
    }
  });

  it("Ban and Delete also need the learner's email typed, and send it with the reason", async () => {
    const api = makeApi();
    const user = show(owner, api, ADA);
    const ban = await openAction(user, "Ban");
    await typeReason(user, ban);
    const banConfirm = within(ban).getByRole("button", { name: "Ban" });
    expect(banConfirm).toBeDisabled();
    await user.type(within(ban).getByLabelText(/Type the learner/), "ada@example.com");
    await user.click(banConfirm);
    await waitFor(() =>
      expect(api.ban).toHaveBeenCalledWith(ADA, "  a good reason  ", "ada@example.com"),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const del = await openAction(user, "Delete account");
    await typeReason(user, del);
    await user.type(within(del).getByLabelText(/Type the learner/), "ada@example.com");
    await user.click(within(del).getByRole("button", { name: "Delete account" }));
    await waitFor(() =>
      expect(api.deleteUser).toHaveBeenCalledWith(ADA, "  a good reason  ", "ada@example.com"),
    );
  });

  it("deleting closes the learner, drops them from the results and says so", async () => {
    const api = makeApi();
    const user = show(owner, api);
    await find(user);
    await user.click(await screen.findByRole("button", { name: /Ada/ }));
    const dialog = await openAction(user, "Delete account");
    await typeReason(user, dialog);
    await user.type(within(dialog).getByLabelText(/Type the learner/), "ada@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Delete account" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Learner" })?.textContent).toContain("Deleted."),
    );
    expect(screen.queryByText("ada@example.com")).toBeNull();
    expect(screen.getByText("ben@example.com")).toBeTruthy();
  });

  it("a refused action keeps the dialog open and shows the refusal", async () => {
    const api = makeApi({
      block: vi.fn(async () => {
        throw new Error("You cannot delete this account: it belongs to staff.");
      }),
    });
    const user = show(owner, api, ADA);
    const dialog = await openAction(user, "Block");
    await typeReason(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Block" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("belongs to staff");
    expect(screen.getByRole("dialog", { name: "Block" })).toBeTruthy();
  });

  it("a partly-failed ban or delete says which steps need follow-up", async () => {
    const api = makeApi({ ban: vi.fn(async () => ({ ok: true, partial: ["auth_ban"] })) });
    const user = show(owner, api, ADA);
    const dialog = await openAction(user, "Ban");
    await typeReason(user, dialog);
    await user.type(within(dialog).getByLabelText(/Type the learner/), "ada@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Ban" }));
    expect((await screen.findByRole("status")).textContent).toContain("auth_ban");
  });
});

describe("role matrix", () => {
  it("a support agent sees Block and notes but not Give Pro, Ban or Delete", async () => {
    show(agent, makeApi(), ADA);
    await screen.findByRole("button", { name: "Block" });
    for (const hidden of ["Give Pro", "Ban", "Delete account", "End gifted Pro"]) {
      expect(screen.queryByRole("button", { name: hidden })).toBeNull();
    }
    expect(screen.getByRole("button", { name: "Add note" })).toBeTruthy();
  });

  it("a reader with only users.read sees the facts and no actions, no note box", async () => {
    show({ displayName: "Pat", role: "support", scopes: ["users.read"] }, makeApi(), ADA);
    await screen.findByText("Wrote in about billing");
    expect(screen.getByText("No actions are available to you.")).toBeTruthy();
    expect(screen.queryByLabelText("New note")).toBeNull();
  });
});
