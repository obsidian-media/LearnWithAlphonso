// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TicketView, type TicketViewData } from "./TicketView";

const ME = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const LEARNER = "00000000-0000-4000-8000-000000000001";

const FACTS = {
  pro: { active: false, source: "none" as const, until: null, unavailable: false },
  course: "fr",
  level: "A2",
  streak: 12,
  daysActiveLast30: 21,
  lastActiveDay: "2026-11-13",
  lessonsLast7Days: 9,
  lastLessonDay: "2026-11-13",
  platforms: ["ios"],
  socialBlocked: false,
  previousTickets: [{ status: "solved", topic: "restore", day: "2026-09-02" }],
};

const ticket = (over: Partial<TicketViewData> = {}): TicketViewData => ({
  id: "10000000-0000-4000-8000-000000000001",
  status: "open",
  topic: "billing",
  channel: "ios",
  handoffReason: "ai_unsure",
  createdAt: "2026-11-14T10:02:00Z",
  updatedAt: "2026-11-14T10:41:00Z",
  solvedAt: null,
  assignedTo: OTHER,
  assignedName: "Sam",
  aiSummary: "Learner was charged and Pro is not showing.",
  messages: [
    { id: 1, kind: "learner", body: "I got charged", at: "2026-11-14T10:02:00Z", authorName: null },
    {
      id: 2,
      kind: "ai",
      body: "Try Restore Purchases.",
      at: "2026-11-14T10:02:30Z",
      authorName: null,
    },
    {
      id: 3,
      kind: "system",
      body: "A person will reply here.",
      at: "2026-11-14T10:03:00Z",
      authorName: null,
    },
    {
      id: 4,
      kind: "staff",
      body: "Looking into it",
      at: "2026-11-14T10:41:00Z",
      authorName: "Sam",
    },
  ],
  notes: [{ id: "n1", body: "Charge confirmed", at: "2026-11-14T10:38:00Z", authorName: "Sam" }],
  facts: FACTS,
  factsSource: "ai",
  learnerId: null,
  me: ME,
  ...over,
});

const ALL = ["support.read", "support.reply", "support.assign"];
function setup(over: Partial<React.ComponentProps<typeof TicketView>> = {}) {
  const props = {
    ticket: ticket(),
    scopes: ALL,
    assignable: null,
    busy: false,
    error: null,
    notice: null,
    onReply: vi.fn(async () => true),
    onNote: vi.fn(async () => true),
    onAssign: vi.fn(),
    onStatus: vi.fn(),
    ...over,
  };
  render(<TicketView {...props} />);
  return props;
}

describe("TicketView conversation", () => {
  it("labels every speaker in words: learner, AI (with an AI tag), the staff member's name, system lines", () => {
    setup();
    const convo = screen.getByLabelText("Conversation", { selector: "div" });
    expect(within(convo).getByText("Learner")).toBeTruthy();
    expect(within(convo).getByText("Alphonso AI")).toBeTruthy();
    expect(within(convo).getByText("AI")).toBeTruthy();
    expect(within(convo).getByText(/Sam · support/)).toBeTruthy();
    expect(within(convo).getByText("A person will reply here.")).toBeTruthy();
  });

  it("renders learner, AI, staff and note text as plain text, never as markup", () => {
    const evil = '<img src=x onerror="alert(1)"> <script>boom()</script> **x**';
    const { container } = render(
      <TicketView
        {...{
          ticket: ticket({
            messages: [
              { id: 1, kind: "learner", body: evil, at: "2026-11-14T10:02:00Z", authorName: null },
              { id: 2, kind: "ai", body: evil, at: "2026-11-14T10:02:00Z", authorName: null },
              { id: 3, kind: "staff", body: evil, at: "2026-11-14T10:02:00Z", authorName: "S" },
            ],
            notes: [{ id: "n", body: evil, at: "2026-11-14T10:02:00Z", authorName: "S" }],
            aiSummary: evil,
          }),
          scopes: ALL,
          assignable: null,
          busy: false,
          error: null,
          notice: null,
          onReply: async () => true,
          onNote: async () => true,
          onAssign: () => {},
          onStatus: () => {},
        }}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent!.split(evil).length - 1).toBe(5);
  });

  it("shows the AI summary labelled as possibly wrong, with the reason and topic words", () => {
    setup();
    expect(screen.getByText("AI summary, may be wrong")).toBeTruthy();
    expect(screen.getByText("Learner was charged and Pro is not showing.")).toBeTruthy();
    expect(screen.getByText("Reason: AI was unsure · Topic: Billing")).toBeTruthy();
  });
});

describe("TicketView facts panel", () => {
  it("shows exactly the snapshot rows and says what is not shown; no email or name field exists", () => {
    const { container } = render(
      <TicketView
        ticket={ticket()}
        scopes={ALL}
        assignable={null}
        busy={false}
        error={null}
        notice={null}
        onReply={async () => true}
        onNote={async () => true}
        onAssign={() => {}}
        onStatus={() => {}}
      />,
    );
    const text = container.textContent!;
    for (const expected of [
      "Not active (none)",
      "French, A2",
      "12 days",
      "21",
      "2026-11-13",
      "9 (last 2026-11-13)",
      "ios",
      "No",
      "Earlier: solved, restore, 2026-09-02.",
      "No email, notes, payment details or lesson answers are shown here.",
    ])
      expect(text, expected).toContain(expected);
    expect(text).not.toMatch(/@/);
  });

  it("explains a gift, an unreadable store, and facts that could not be loaded", () => {
    const { unmount } = render(
      <TicketView
        ticket={ticket({
          facts: {
            ...FACTS,
            pro: { active: true, source: "gift", until: "2026-12-01", unavailable: false },
          },
          factsSource: "rebuilt",
        })}
        scopes={ALL}
        assignable={null}
        busy={false}
        error={null}
        notice={null}
        onReply={async () => true}
        onNote={async () => true}
        onAssign={() => {}}
        onStatus={() => {}}
      />,
    );
    expect(screen.getByText("Pro (gift) until 2026-12-01")).toBeTruthy();
    expect(screen.getByText(/read just now/)).toBeTruthy();
    unmount();
    setup({ ticket: ticket({ facts: null, factsSource: "unavailable" }) });
    expect(screen.getByText("The learner's facts could not be loaded.")).toBeTruthy();
  });

  it("links to the learner page only when the server gave a learner id (viewer has users.read)", () => {
    const { unmount } = render(
      <TicketView
        ticket={ticket()}
        scopes={ALL}
        assignable={null}
        busy={false}
        error={null}
        notice={null}
        onReply={async () => true}
        onNote={async () => true}
        onAssign={() => {}}
        onStatus={() => {}}
      />,
    );
    expect(screen.queryByRole("link", { name: "Open learner page" })).toBeNull();
    unmount();
    setup({ ticket: ticket({ learnerId: LEARNER }) });
    expect(screen.getByRole("link", { name: "Open learner page" }).getAttribute("href")).toBe(
      `/users/${LEARNER}`,
    );
  });
});

describe("TicketView reply and notes", () => {
  it("sends the trimmed reply and clears the box only when it was sent", async () => {
    const onReply = vi.fn(async () => true);
    setup({ onReply });
    const box = screen.getByLabelText("Reply to the learner") as HTMLTextAreaElement;
    const send = screen.getByRole("button", { name: "Send reply" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await userEvent.type(box, "  Hello there  ");
    expect(send.disabled).toBe(false);
    await userEvent.click(send);
    expect(onReply).toHaveBeenCalledWith("Hello there");
    expect(box.value).toBe("");
  });

  it("keeps the draft when the send failed", async () => {
    setup({ onReply: vi.fn(async () => false) });
    const box = screen.getByLabelText("Reply to the learner") as HTMLTextAreaElement;
    await userEvent.type(box, "keep me");
    await userEvent.click(screen.getByRole("button", { name: "Send reply" }));
    expect(box.value).toBe("keep me");
  });

  it("a solved ticket offers no reply box, only Reopen; a viewer without support.reply cannot reply or add notes", async () => {
    const onStatus = vi.fn();
    const { unmount } = render(
      <TicketView
        ticket={ticket({ status: "solved", solvedAt: "2026-11-14T12:00:00Z" })}
        scopes={ALL}
        assignable={null}
        busy={false}
        error={null}
        notice={null}
        onReply={async () => true}
        onNote={async () => true}
        onAssign={() => {}}
        onStatus={onStatus}
      />,
    );
    expect(screen.queryByLabelText("Reply to the learner")).toBeNull();
    expect(screen.getByText("This ticket is solved. Reopen it to reply.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(onStatus).toHaveBeenCalledWith("open");
    unmount();

    setup({ scopes: ["support.read"] });
    expect(screen.getByText("You can read tickets but not reply.")).toBeTruthy();
    expect(screen.queryByLabelText("New internal note")).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark solved" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assign to me" })).toBeNull();
  });

  it("adds an internal note with its own box, separate from the reply", async () => {
    const onNote = vi.fn(async () => true);
    const onReply = vi.fn(async () => true);
    setup({ onNote, onReply });
    expect(screen.getByText("Charge confirmed")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("New internal note"), "check the store");
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(onNote).toHaveBeenCalledWith("check the store");
    expect(onReply).not.toHaveBeenCalled();
  });
});

describe("TicketView status and owner", () => {
  it("Mark solved and the status select call onStatus; New is shown but cannot be chosen", async () => {
    const onStatus = vi.fn();
    setup({ onStatus });
    await userEvent.click(screen.getByRole("button", { name: "Mark solved" }));
    expect(onStatus).toHaveBeenLastCalledWith("solved");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "waiting_learner");
    expect(onStatus).toHaveBeenLastCalledWith("waiting_learner");
  });

  it("Assign to me when it is someone else's, Give back when it is mine", async () => {
    const onAssign = vi.fn();
    const { unmount } = render(
      <TicketView
        ticket={ticket()}
        scopes={ALL}
        assignable={null}
        busy={false}
        error={null}
        notice={null}
        onReply={async () => true}
        onNote={async () => true}
        onAssign={onAssign}
        onStatus={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Assign to me" }));
    expect(onAssign).toHaveBeenLastCalledWith(ME);
    unmount();
    setup({ ticket: ticket({ assignedTo: ME }), onAssign });
    await userEvent.click(screen.getByRole("button", { name: "Give back" }));
    expect(onAssign).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("You")).toBeTruthy();
  });

  it("only a manager gets the picker for handing a ticket to someone else", async () => {
    const onAssign = vi.fn();
    setup({
      assignable: [
        { userId: ME, name: "Me" },
        { userId: OTHER, name: "Sam" },
      ],
      onAssign,
    });
    await userEvent.selectOptions(screen.getByLabelText("Assigned to"), ME);
    expect(onAssign).toHaveBeenLastCalledWith(ME);
    await userEvent.selectOptions(screen.getByLabelText("Assigned to"), "");
    expect(onAssign).toHaveBeenLastCalledWith(null);
  });

  it("shows a refusal as an alert and a success notice", () => {
    setup({ error: "You cannot act on your own account.", notice: "Reply sent." });
    expect(screen.getByRole("alert").textContent).toBe("You cannot act on your own account.");
    expect(screen.getByText("Reply sent.")).toBeTruthy();
  });
});
