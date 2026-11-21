import { beforeEach, describe, expect, it, vi } from "vitest";
import { asTestFns, chainable, createSupabaseMock } from "./__testutils__/supabase-mock";
import { setStaff } from "./__testutils__/staff-harness";
import { UNAUTHORIZED_MESSAGE } from "./admin-auth";

vi.mock(
  "./staff-middleware",
  async () => (await import("./__testutils__/staff-harness")).staffMiddlewareMock,
);
vi.mock(
  "@tanstack/react-start",
  async () => (await import("./__testutils__/staff-harness")).startMock,
);
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("./staff-rate-limit", async (orig) => ({
  ...(await orig<typeof import("./staff-rate-limit")>()),
  consumeStaffLimit: (await import("./__testutils__/staff-rate-limit-mock")).fakeConsumeStaffLimit,
}));
const rebuild = vi.fn();
vi.mock("./support-facts.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./support-facts.server")>()),
  loadSupportFacts: (...args: unknown[]) => rebuild(...args),
}));

const mod = await import("./staff-support.functions");
const {
  staffListTickets,
  staffGetTicket,
  staffReplyTicket,
  staffAssignTicket,
  staffSetTicketStatus,
  staffAddTicketNote,
  staffHandToOwner,
  staffClearUrgent,
} = asTestFns({
  staffListTickets: mod.staffListTickets,
  staffGetTicket: mod.staffGetTicket,
  staffReplyTicket: mod.staffReplyTicket,
  staffAssignTicket: mod.staffAssignTicket,
  staffSetTicketStatus: mod.staffSetTicketStatus,
  staffAddTicketNote: mod.staffAddTicketNote,
  staffHandToOwner: mod.staffHandToOwner,
  staffClearUrgent: mod.staffClearUrgent,
});

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const SAM = "00000000-0000-4000-8000-0000000000b1";
const READER = "00000000-0000-4000-8000-0000000000b2";
const LEARNER = "00000000-0000-4000-8000-000000000001";
const TICKET = "10000000-0000-4000-8000-000000000001";
const ALL_SUPPORT = ["support.read", "support.reply", "support.assign"];

beforeEach(() => {
  rebuild.mockReset();
  setStaff({
    [OWNER]: { role: "owner", scopes: [] },
    [SAM]: { role: "support", scopes: [...ALL_SUPPORT, "users.notes"] },
    [READER]: { role: "support", scopes: ["support.read"] },
  });
});

const FACTS = {
  pro: { active: false, source: "none", until: null, unavailable: false },
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
  previousTickets: [{ status: "solved", topic: "restore", day: "2026-09-02" }],
};

const conversation = (over: Record<string, unknown> = {}) => ({
  id: TICKET,
  user_id: LEARNER,
  status: "open",
  topic: "billing",
  channel: "ios",
  handoff_reason: "learner_asked",
  assigned_to: SAM,
  ai_summary: "Charged, Pro not showing.\n\n[[link:subscription]]",
  created_at: "2026-11-14T10:02:00Z",
  updated_at: "2026-11-14T10:41:00Z",
  solved_at: null,
  ticket_no: 7,
  handed_off_at: "2026-11-14T10:02:00Z",
  urgent: false,
  ...over,
});

type Tables = {
  conversation?: unknown;
  messages?: unknown[];
  notes?: unknown[];
  profiles?: unknown[];
  /** What the learner's own profile row says (the second profiles read, made only with users.read). */
  learnerProfile?: unknown;
};
function adminClient(t: Tables = {}) {
  const order: string[] = [];
  let profileReads = 0;
  const admin = createSupabaseMock();
  admin.rpc.mockImplementation(async (name: string) => {
    order.push(`rpc:${name}`);
    return { data: name === "staff_record" ? 7 : null, error: null };
  });
  admin.from.mockImplementation((table: string) => {
    order.push(`from:${table}`);
    switch (table) {
      case "support_conversations":
        return chainable({
          data: t.conversation === undefined ? conversation() : t.conversation,
          error: null,
        });
      case "support_messages":
        return chainable({ data: t.messages ?? [], error: null });
      case "support_notes":
        return chainable({ data: t.notes ?? [], error: null });
      case "profiles": {
        profileReads += 1;
        // the staff names come first; a second read is the learner's own row (only with users.read)
        return chainable({
          data:
            profileReads === 1 || t.learnerProfile === undefined
              ? (t.profiles ?? [{ id: SAM, display_name: "Sam" }])
              : t.learnerProfile,
          error: null,
        });
      }
      default:
        return chainable({ data: [], error: null });
    }
  });
  return { admin, order };
}
const call = (fn: (o: never) => Promise<unknown>, userId: string, admin: unknown, data: unknown) =>
  fn({ data, context: { supabaseAdmin: admin, userId } } as never);

describe("staffListTickets", () => {
  const page = {
    tickets: [
      {
        id: TICKET,
        status: "new",
        topic: "billing",
        channel: "ios",
        handoffReason: "learner_asked",
        assignedTo: null,
        assignedName: null,
        snippet: "Pro is not showing",
        createdAt: "2026-11-14T10:02:00Z",
        updatedAt: "2026-11-14T10:02:00Z",
        unopened: true,
      },
    ],
    total: 1,
    counts: { open: 1, waiting: 0, solved: 0, all: 1, unassigned: 1 },
    next: null,
  };

  it("asks for the signed-in staff member's own list, with the filters and cursor, and says who 'me' is", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: page, error: null });
    const out = await call(staffListTickets, SAM, admin, {
      filter: "waiting",
      assigned: "me",
      cursor: { at: "2026-11-14T10:00:00Z", id: TICKET, urgent: true },
      actor: OWNER, // forged field: ignored
    });
    expect(admin.rpc).toHaveBeenCalledWith("staff_support_inbox", {
      p_actor: SAM,
      p_filter: "waiting",
      p_assigned: "me",
      p_cursor_at: "2026-11-14T10:00:00Z",
      p_cursor_id: TICKET,
      p_limit: 25,
      p_cursor_urgent: true,
    });
    expect(out).toMatchObject({ total: 1, me: SAM });
  });

  it("defaults to the open filter, any assignee, no cursor", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: page, error: null });
    await call(staffListTickets, SAM, admin, {});
    expect(admin.rpc).toHaveBeenCalledWith(
      "staff_support_inbox",
      expect.objectContaining({
        p_filter: "open",
        p_assigned: "any",
        p_cursor_at: null,
        p_cursor_urgent: false,
      }),
    );
  });

  it("runs the snippet through the link parser", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({
      data: { ...page, tickets: [{ ...page.tickets[0], snippet: "hello\n\n[[link:settings]]" }] },
      error: null,
    });
    const out = (await call(staffListTickets, SAM, admin, {})) as {
      tickets: { snippet: string }[];
    };
    expect(out.tickets[0]!.snippet).toBe("hello");
  });

  it("refuses bad filters and a non-uuid cursor before anything is queried", async () => {
    const { admin } = adminClient();
    await expect(call(staffListTickets, SAM, admin, { filter: "everything" })).rejects.toThrow();
    await expect(
      call(staffListTickets, SAM, admin, { cursor: { at: "x", id: "not-a-uuid" } }),
    ).rejects.toThrow();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("a staff member without support.read is Forbidden; a non-staff caller gets exactly the unauthorized text", async () => {
    const { admin } = adminClient();
    setStaff({ [SAM]: { role: "support", scopes: ["users.read"] } });
    await expect(call(staffListTickets, SAM, admin, {})).rejects.toThrow(
      "Forbidden: missing scope support.read",
    );
    await expect(call(staffListTickets, "someone-else", admin, {})).rejects.toThrow(
      UNAUTHORIZED_MESSAGE,
    );
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("reports a database failure plainly", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    await expect(call(staffListTickets, SAM, admin, {})).rejects.toThrow(
      "Could not read the tickets.",
    );
  });
});

describe("staffGetTicket", () => {
  const messages = [
    {
      id: 1,
      author_kind: "learner",
      author_id: null,
      body: "I got charged",
      created_at: "t1",
      ai_facts: null,
    },
    {
      id: 2,
      author_kind: "ai",
      author_id: null,
      body: "Try Restore Purchases.\n\n[[link:subscription]]",
      created_at: "t2",
      ai_facts: { ...FACTS, email: "leak@example.com", displayName: "Ada", staffNotes: ["x"] },
    },
    {
      id: 3,
      author_kind: "system",
      author_id: null,
      body: "A person will reply here.",
      created_at: "t3",
      ai_facts: null,
    },
    {
      id: 4,
      author_kind: "staff",
      author_id: SAM,
      body: "Hi, looking into it",
      created_at: "t4",
      ai_facts: null,
    },
  ];

  it("records the view of the LEARNER before it reads any message, note or fact", async () => {
    const { admin, order } = adminClient({ messages });
    await call(staffGetTicket, SAM, admin, { id: TICKET });
    expect(admin.rpc).toHaveBeenCalledWith(
      "staff_record",
      expect.objectContaining({
        p_actor: SAM,
        p_role: "support",
        p_action: "user.view",
        p_target: LEARNER,
        p_reason: null,
      }),
    );
    const recorded = order.indexOf("rpc:staff_record");
    expect(recorded).toBeGreaterThan(-1);
    expect(order.indexOf("from:support_messages")).toBeGreaterThan(recorded);
    expect(order.indexOf("from:support_notes")).toBeGreaterThan(recorded);
  });

  it("returns nothing when the record cannot be written", async () => {
    const { admin } = adminClient({ messages });
    admin.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    await expect(call(staffGetTicket, SAM, admin, { id: TICKET })).rejects.toThrow(
      "Could not write the action record",
    );
    expect(admin.from).not.toHaveBeenCalledWith("support_messages");
  });

  it("never shows the [[link:...]] marker: AI bodies and the AI summary go through the parser", async () => {
    const { admin } = adminClient({ messages });
    const out = (await call(staffGetTicket, SAM, admin, { id: TICKET })) as {
      messages: { kind: string; body: string }[];
      aiSummary: string;
    };
    expect(out.messages.find((m) => m.kind === "ai")!.body).toBe("Try Restore Purchases.");
    expect(out.aiSummary).toBe("Charged, Pro not showing.");
    expect(JSON.stringify(out)).not.toContain("[[link:");
  });

  it("shows the facts exactly as the AI saw them, with any field outside the allowlist dropped", async () => {
    const { admin } = adminClient({ messages });
    const out = (await call(staffGetTicket, SAM, admin, { id: TICKET })) as {
      facts: unknown;
      factsSource: string;
    };
    expect(out.factsSource).toBe("ai");
    expect(out.facts).toEqual(FACTS);
    const text = JSON.stringify(out);
    for (const secret of ["leak@example.com", "Ada", "staffNotes"])
      expect(text).not.toContain(secret);
    expect(rebuild).not.toHaveBeenCalled();
  });

  it("rebuilds the facts when the AI never answered, and says when it cannot", async () => {
    const noAi = messages.filter((m) => m.author_kind !== "ai");
    const ok = adminClient({ messages: noAi });
    rebuild.mockResolvedValueOnce(FACTS);
    const rebuilt = (await call(staffGetTicket, SAM, ok.admin, { id: TICKET })) as {
      facts: unknown;
      factsSource: string;
    };
    expect(rebuild).toHaveBeenCalledWith(ok.admin, LEARNER);
    expect(rebuilt).toMatchObject({ factsSource: "rebuilt", facts: FACTS });

    const bad = adminClient({ messages: noAi });
    rebuild.mockRejectedValueOnce(new Error("revenuecat down"));
    const failed = (await call(staffGetTicket, SAM, bad.admin, { id: TICKET })) as {
      facts: unknown;
      factsSource: string;
    };
    expect(failed).toMatchObject({ factsSource: "unavailable", facts: null });
  });

  it("a conversation still with the AI, or a missing one, is 'no such ticket' and records nothing", async () => {
    for (const conv of [conversation({ status: "ai" }), null]) {
      const { admin } = adminClient({ conversation: conv });
      await expect(call(staffGetTicket, SAM, admin, { id: TICKET })).rejects.toThrow(
        mod.NO_TICKET_MESSAGE,
      );
      expect(admin.rpc).not.toHaveBeenCalled();
    }
  });

  it("includes notes with the author's name, staff names on staff rows, and the learner id only with users.read", async () => {
    const notes = [{ id: "n1", author_id: SAM, body: "Charge confirmed", created_at: "t5" }];
    const sam = adminClient({ messages, notes });
    const withUsers = (await call(staffGetTicket, SAM, sam.admin, { id: TICKET })) as {
      notes: unknown[];
      messages: { kind: string; authorName: string | null }[];
      learnerId: string | null;
      me: string;
    };
    expect(withUsers.notes).toEqual([
      { id: "n1", body: "Charge confirmed", at: "t5", authorName: "Sam" },
    ]);
    expect(withUsers.messages.find((m) => m.kind === "staff")!.authorName).toBe("Sam");
    expect(withUsers.learnerId).toBeNull(); // SAM has no users.read here
    expect(withUsers.me).toBe(SAM);

    const owner = adminClient({ messages, notes });
    const asOwner = (await call(staffGetTicket, OWNER, owner.admin, { id: TICKET })) as {
      learnerId: string | null;
    };
    expect(asOwner.learnerId).toBe(LEARNER);
  });

  it("never returns an email, and the learner's name only to someone holding users.read (N-11)", async () => {
    const { admin } = adminClient({ messages, learnerProfile: { display_name: "Ada" } });
    const plain = (await call(staffGetTicket, SAM, admin, { id: TICKET })) as {
      displayName: string | null;
    };
    expect(plain.displayName).toBeNull();
    expect(JSON.stringify(plain)).not.toMatch(/@|Ada/);
    expect(admin.from).not.toHaveBeenCalledWith("users");
    // without users.read the learner's profile row is not even read (only the staff names are)
    expect(admin.from.mock.calls.filter(([t]) => t === "profiles")).toHaveLength(1);

    const withUsers = adminClient({ messages, learnerProfile: { display_name: "Ada" } });
    setStaff({ [SAM]: { role: "support", scopes: [...ALL_SUPPORT, "users.read"] } });
    const named = (await call(staffGetTicket, SAM, withUsers.admin, { id: TICKET })) as {
      displayName: string | null;
      learnerId: string | null;
    };
    expect(named.displayName).toBe("Ada");
    expect(named.learnerId).toBe(LEARNER);
    expect(JSON.stringify(named)).not.toMatch(/@/);

    // a learner who never set a name is null, not an error
    const unnamed = adminClient({ messages, learnerProfile: { display_name: null } });
    const none = (await call(staffGetTicket, SAM, unnamed.admin, { id: TICKET })) as {
      displayName: string | null;
    };
    expect(none.displayName).toBeNull();
  });

  it("carries the ticket number, the urgent flag, and the wait and breach from the database's own rule", async () => {
    const waitingSince = new Date(Date.now() - 9 * 3_600_000).toISOString();
    const make = (hours: number | null) => {
      const c = adminClient({ messages, conversation: conversation({ urgent: true }) });
      c.admin.rpc.mockImplementation(async (name: string) => {
        if (name === "support_waiting_since") return { data: waitingSince, error: null };
        if (name === "staff_get_settings")
          return { data: hours === null ? {} : { support_breach_hours: hours }, error: null };
        return { data: name === "staff_record" ? 7 : null, error: null };
      });
      return c.admin;
    };
    type D = { ticketNo: number; urgent: boolean; waitingSince: string; breaching: boolean };
    const slow = (await call(staffGetTicket, SAM, make(8), { id: TICKET })) as D;
    expect(slow).toMatchObject({ ticketNo: 7, urgent: true, waitingSince, breaching: true });
    // the SAME wait is not breaching once the setting is 12: the setting is read, not a constant
    expect(((await call(staffGetTicket, SAM, make(12), { id: TICKET })) as D).breaching).toBe(
      false,
    );
    // a missing setting never breaches
    expect(((await call(staffGetTicket, SAM, make(null), { id: TICKET })) as D).breaching).toBe(
      false,
    );
  });

  it("a solved ticket is never urgent, whatever the flag says", async () => {
    const { admin } = adminClient({
      messages,
      conversation: conversation({
        status: "solved",
        urgent: true,
        solved_at: "2026-11-15T10:00:00Z",
      }),
    });
    const out = (await call(staffGetTicket, SAM, admin, { id: TICKET })) as { urgent: boolean };
    expect(out.urgent).toBe(false);
  });
});

describe("the four writes", () => {
  it("reply: sends the trimmed text as the signed-in actor and role, whatever the body says about who", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: 41, error: null });
    const out = await call(staffReplyTicket, SAM, admin, {
      id: TICKET,
      body: "  Hello there  ",
      actor: OWNER,
      role: "owner",
      userId: OWNER,
    });
    expect(out).toEqual({ ok: true, messageId: 41 });
    expect(admin.rpc).toHaveBeenCalledWith("staff_support_reply", {
      p_actor: SAM,
      p_role: "support",
      p_conversation: TICKET,
      p_body: "Hello there",
    });
  });

  it("reply: refuses empty and over-long text, and needs support.reply", async () => {
    const { admin } = adminClient();
    await expect(call(staffReplyTicket, SAM, admin, { id: TICKET, body: "   " })).rejects.toThrow();
    await expect(
      call(staffReplyTicket, SAM, admin, { id: TICKET, body: "x".repeat(4001) }),
    ).rejects.toThrow();
    await expect(call(staffReplyTicket, READER, admin, { id: TICKET, body: "hi" })).rejects.toThrow(
      "Forbidden: missing scope support.reply",
    );
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("translates the database's refusals into plain sentences", async () => {
    const cases: [string, RegExp][] = [
      ["P0002", /does not exist/],
      ["42501", /your own account/],
      ["55000", /Reopen it first/],
      ["XX000", /Nothing was sent/],
    ];
    for (const [code, message] of cases) {
      const { admin } = adminClient();
      admin.rpc.mockResolvedValueOnce({ data: null, error: { code } });
      await expect(call(staffReplyTicket, SAM, admin, { id: TICKET, body: "hi" })).rejects.toThrow(
        message,
      );
    }
  });

  it("assign: taking it yourself needs only support.assign", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(
      call(staffAssignTicket, SAM, admin, { id: TICKET, assignTo: SAM }),
    ).resolves.toEqual({
      ok: true,
      changed: true,
    });
    expect(admin.rpc).toHaveBeenCalledWith("staff_support_assign", {
      p_actor: SAM,
      p_role: "support",
      p_conversation: TICKET,
      p_assignee: SAM,
      p_reason: null, // a self-claim sends no reason
    });
  });

  it("assign: handing it to someone else needs staff.manage; an owner can", async () => {
    const denied = adminClient();
    await expect(
      call(staffAssignTicket, SAM, denied.admin, { id: TICKET, assignTo: READER }),
    ).rejects.toThrow(mod.ASSIGN_OTHERS_MESSAGE);
    expect(denied.admin.rpc).not.toHaveBeenCalled();

    const owner = adminClient();
    owner.admin.rpc.mockResolvedValueOnce({ data: true, error: null });
    await call(staffAssignTicket, OWNER, owner.admin, {
      id: TICKET,
      assignTo: SAM,
      reason: "  Sam knows billing ",
    });
    expect(owner.admin.rpc).toHaveBeenCalledWith(
      "staff_support_assign",
      expect.objectContaining({
        p_actor: OWNER,
        p_assignee: SAM,
        p_reason: "Sam knows billing",
      }),
    );
  });

  it("assign: handing it to someone else needs a reason (N-8), checked before the database is called", async () => {
    for (const reason of [undefined, "", "  ", "ab", "x".repeat(501)]) {
      const { admin } = adminClient();
      await expect(
        call(staffAssignTicket, OWNER, admin, { id: TICKET, assignTo: SAM, reason }),
      ).rejects.toThrow(mod.REASON_NEEDED_MESSAGE);
      expect(admin.rpc).not.toHaveBeenCalledWith("staff_support_assign", expect.anything());
    }
  });

  it("assign: taking back someone else's ticket (unassign) needs staff.manage and a reason", async () => {
    const theirs = adminClient({ conversation: conversation({ assigned_to: READER }) });
    await expect(
      call(staffAssignTicket, OWNER, theirs.admin, { id: TICKET, assignTo: null }),
    ).rejects.toThrow(mod.REASON_NEEDED_MESSAGE);
    theirs.admin.rpc.mockResolvedValueOnce({ data: true, error: null });
    await call(staffAssignTicket, OWNER, theirs.admin, {
      id: TICKET,
      assignTo: null,
      reason: "Reader is away",
    });
    expect(theirs.admin.rpc).toHaveBeenCalledWith(
      "staff_support_assign",
      expect.objectContaining({ p_assignee: null, p_reason: "Reader is away" }),
    );
  });

  it("assign: giving back a ticket you hold is allowed; taking back someone else's is not", async () => {
    const mine = adminClient({ conversation: conversation({ assigned_to: SAM }) });
    mine.admin.rpc.mockResolvedValueOnce({ data: true, error: null });
    await call(staffAssignTicket, SAM, mine.admin, { id: TICKET, assignTo: null });
    expect(mine.admin.rpc).toHaveBeenCalledWith(
      "staff_support_assign",
      expect.objectContaining({ p_assignee: null, p_reason: null }),
    );

    const theirs = adminClient({ conversation: conversation({ assigned_to: READER }) });
    await expect(
      call(staffAssignTicket, SAM, theirs.admin, { id: TICKET, assignTo: null }),
    ).rejects.toThrow(mod.ASSIGN_OTHERS_MESSAGE);
    expect(theirs.admin.rpc).not.toHaveBeenCalled();
  });

  it("assign: a staff member with only support.reply cannot assign at all", async () => {
    setStaff({ [SAM]: { role: "support", scopes: ["support.read", "support.reply"] } });
    const { admin } = adminClient();
    await expect(
      call(staffAssignTicket, SAM, admin, { id: TICKET, assignTo: SAM }),
    ).rejects.toThrow("Forbidden: missing scope support.assign");
  });

  it("status: passes one of three statuses, refuses 'new' and the rest, and needs support.reply", async () => {
    for (const status of ["open", "waiting_learner", "solved"]) {
      const { admin } = adminClient();
      admin.rpc.mockResolvedValueOnce({ data: true, error: null });
      await call(staffSetTicketStatus, SAM, admin, {
        id: TICKET,
        status,
        reason: "  because of the thing ",
      });
      expect(admin.rpc).toHaveBeenCalledWith(
        "staff_support_set_status",
        expect.objectContaining({
          p_status: status,
          p_actor: SAM,
          p_reason: "because of the thing",
        }),
      );
    }
    const { admin } = adminClient();
    for (const status of ["new", "ai", "closed"]) {
      await expect(
        call(staffSetTicketStatus, SAM, admin, { id: TICKET, status, reason: "because" }),
      ).rejects.toThrow();
    }
    await expect(
      call(staffSetTicketStatus, READER, admin, { id: TICKET, status: "solved", reason: "x y z" }),
    ).rejects.toThrow("Forbidden: missing scope support.reply");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("status: every change needs a reason of 3 to 500 characters, checked before anything is called", async () => {
    for (const status of ["open", "waiting_learner", "solved"]) {
      for (const reason of [undefined, "", "   ", "ab", "x".repeat(501)]) {
        const { admin } = adminClient();
        await expect(
          call(staffSetTicketStatus, SAM, admin, { id: TICKET, status, reason }),
        ).rejects.toThrow(mod.REASON_NEEDED_MESSAGE);
        expect(admin.rpc).not.toHaveBeenCalled();
      }
    }
  });

  it("status: a reopen the database refuses because the learner started a new chat says so", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
    await expect(
      call(staffSetTicketStatus, SAM, admin, { id: TICKET, status: "open", reason: "they wrote" }),
    ).rejects.toThrow(/already has an open conversation/);
  });

  it("status: a reopen refused because the chat is too old or not the learner's newest says so", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: null, error: { code: "LW001" } });
    await expect(
      call(staffSetTicketStatus, SAM, admin, { id: TICKET, status: "open", reason: "they wrote" }),
    ).rejects.toThrow(mod.TOO_OLD_MESSAGE);
  });

  it("note: trims, caps at 2000, needs support.reply", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: "note-id", error: null });
    await call(staffAddTicketNote, SAM, admin, { id: TICKET, body: " check store " });
    expect(admin.rpc).toHaveBeenCalledWith("staff_support_add_note", {
      p_actor: SAM,
      p_role: "support",
      p_conversation: TICKET,
      p_body: "check store",
    });
    await expect(
      call(staffAddTicketNote, SAM, admin, { id: TICKET, body: "x".repeat(2001) }),
    ).rejects.toThrow();
    await expect(
      call(staffAddTicketNote, READER, admin, { id: TICKET, body: "n" }),
    ).rejects.toThrow("Forbidden: missing scope support.reply");
  });

  it("a non-staff caller gets exactly the unauthorized text on every write", async () => {
    const { admin } = adminClient();
    const calls = [
      () => call(staffReplyTicket, "stranger", admin, { id: TICKET, body: "hi" }),
      () => call(staffAssignTicket, "stranger", admin, { id: TICKET, assignTo: null }),
      () =>
        call(staffSetTicketStatus, "stranger", admin, {
          id: TICKET,
          status: "solved",
          reason: "because",
        }),
      () => call(staffHandToOwner, "stranger", admin, { id: TICKET, reason: "because" }),
      () => call(staffClearUrgent, "stranger", admin, { id: TICKET, reason: "because" }),
      () => call(staffAddTicketNote, "stranger", admin, { id: TICKET, body: "n" }),
    ];
    for (const run of calls) await expect(run()).rejects.toThrow(UNAUTHORIZED_MESSAGE);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("writes are limited to 60 a minute per staff member", async () => {
    const BUSY = "00000000-0000-4000-8000-0000000000b9";
    setStaff({
      [BUSY]: { role: "support", scopes: ALL_SUPPORT },
      [OWNER]: { role: "owner", scopes: [] },
    });
    const { admin } = adminClient();
    admin.rpc.mockResolvedValue({ data: "id", error: null });
    const run = () => call(staffAddTicketNote, BUSY, admin, { id: TICKET, body: "n" });
    for (let i = 0; i < 60; i++) await run();
    await expect(run()).rejects.toThrow(mod.TOO_MANY_CHANGES);
    await expect(
      call(staffAddTicketNote, OWNER, admin, { id: TICKET, body: "n" }),
    ).resolves.toEqual({
      ok: true,
    });
  });
});

describe("Hand to owner and Clear urgent (N-13)", () => {
  it("hand to owner: passes the signed-in actor and role and the trimmed reason; any support.assign holder may", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(
      call(staffHandToOwner, SAM, admin, {
        id: TICKET,
        reason: "  Chargeback threat ",
        actor: OWNER,
      }),
    ).resolves.toEqual({ ok: true, changed: true });
    expect(admin.rpc).toHaveBeenCalledWith("staff_support_hand_to_owner", {
      p_actor: SAM,
      p_role: "support",
      p_conversation: TICKET,
      p_reason: "Chargeback threat",
    });
  });

  it("hand to owner: a repeat that changes nothing says so (changed false)", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(
      call(staffHandToOwner, SAM, admin, { id: TICKET, reason: "again" }),
    ).resolves.toEqual({ ok: true, changed: false });
  });

  it("hand to owner: needs support.assign and a reason, and calls nothing otherwise", async () => {
    setStaff({
      [SAM]: { role: "support", scopes: ALL_SUPPORT },
      [READER]: { role: "support", scopes: ["support.read", "support.reply"] },
    });
    const { admin } = adminClient();
    await expect(
      call(staffHandToOwner, READER, admin, { id: TICKET, reason: "because" }),
    ).rejects.toThrow("Forbidden: missing scope support.assign");
    for (const reason of ["", "  ", "ab", "x".repeat(501)]) {
      await expect(call(staffHandToOwner, SAM, admin, { id: TICKET, reason })).rejects.toThrow(
        mod.REASON_NEEDED_MESSAGE,
      );
    }
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("hand to owner: translates the database's refusals", async () => {
    const cases: [string, RegExp][] = [
      ["LW002", /no active owner/],
      ["55000", /Reopen it first/],
      ["P0002", /does not exist/],
      ["XX000", /Nothing was changed/],
    ];
    for (const [code, message] of cases) {
      const { admin } = adminClient();
      admin.rpc.mockResolvedValueOnce({ data: null, error: { code } });
      await expect(
        call(staffHandToOwner, SAM, admin, { id: TICKET, reason: "because" }),
      ).rejects.toThrow(message);
    }
  });

  it("clear urgent: an owner only (staff.manage and the owner role), with a reason", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(
      call(staffClearUrgent, OWNER, admin, { id: TICKET, reason: " handled " }),
    ).resolves.toEqual({ ok: true, changed: true });
    expect(admin.rpc).toHaveBeenCalledWith("staff_support_clear_urgent", {
      p_actor: OWNER,
      p_role: "owner",
      p_conversation: TICKET,
      p_reason: "handled",
    });
    // a support agent lacks staff.manage; even one who somehow held it is refused for not being an owner
    const denied = adminClient();
    await expect(
      call(staffClearUrgent, SAM, denied.admin, { id: TICKET, reason: "because" }),
    ).rejects.toThrow("Forbidden: missing scope staff.manage");
    setStaff({
      [OWNER]: { role: "owner", scopes: [] },
      [SAM]: { role: "support", scopes: [...ALL_SUPPORT, "staff.manage"] },
    });
    await expect(
      call(staffClearUrgent, SAM, denied.admin, { id: TICKET, reason: "because" }),
    ).rejects.toThrow(mod.OWNER_ONLY_MESSAGE);
    await expect(
      call(staffClearUrgent, OWNER, denied.admin, { id: TICKET, reason: "ab" }),
    ).rejects.toThrow(mod.REASON_NEEDED_MESSAGE);
    expect(denied.admin.rpc).not.toHaveBeenCalled();
  });
});

describe("taking over a ticket someone else holds (L2)", () => {
  it("needs a reason, and still only support.assign (no Staff permission) when it is for yourself", async () => {
    const held = adminClient({ conversation: conversation({ assigned_to: READER }) });
    for (const reason of [undefined, "", "ab"]) {
      await expect(
        call(staffAssignTicket, SAM, held.admin, { id: TICKET, assignTo: SAM, reason }),
      ).rejects.toThrow(mod.REASON_NEEDED_MESSAGE);
    }
    expect(held.admin.rpc).not.toHaveBeenCalledWith("staff_support_assign", expect.anything());
    held.admin.rpc.mockResolvedValueOnce({ data: true, error: null });
    await call(staffAssignTicket, SAM, held.admin, {
      id: TICKET,
      assignTo: SAM,
      reason: " covering ",
    });
    expect(held.admin.rpc).toHaveBeenCalledWith(
      "staff_support_assign",
      expect.objectContaining({ p_assignee: SAM, p_reason: "covering" }),
    );
  });

  it("picking up an unassigned ticket sends no reason", async () => {
    const free = adminClient({ conversation: conversation({ assigned_to: null }) });
    free.admin.rpc.mockResolvedValueOnce({ data: true, error: null });
    await call(staffAssignTicket, SAM, free.admin, { id: TICKET, assignTo: SAM });
    expect(free.admin.rpc).toHaveBeenCalledWith(
      "staff_support_assign",
      expect.objectContaining({ p_assignee: SAM, p_reason: null }),
    );
  });

  it("hand to owner and clear urgent refuse with an accurate sentence, not 'your own account'", async () => {
    const { admin } = adminClient();
    admin.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(
      call(staffHandToOwner, SAM, admin, { id: TICKET, reason: "because" }),
    ).rejects.toThrow(mod.NOT_ALLOWED_MESSAGE);
    expect(mod.NOT_ALLOWED_MESSAGE).not.toMatch(/own account/);
    admin.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(
      call(staffClearUrgent, OWNER, admin, { id: TICKET, reason: "because" }),
    ).rejects.toThrow(mod.NOT_ALLOWED_MESSAGE);
  });
});

describe("22023 from the assign call (L2 follow-up)", () => {
  it("a reason refusal (someone took the ticket in between) says a reason is needed; an assignee refusal still says that person cannot work tickets", async () => {
    const free = adminClient({ conversation: conversation({ assigned_to: null }) });
    free.admin.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "22023",
        message:
          "staff_support_assign: moving a ticket someone else holds, or handing it to someone else, needs a reason of 3 to 500 characters",
      },
    });
    await expect(
      call(staffAssignTicket, SAM, free.admin, { id: TICKET, assignTo: SAM }),
    ).rejects.toThrow(mod.TAKE_OVER_NEEDS_REASON_MESSAGE);
    free.admin.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "22023", message: "staff_support_assign: that person cannot work tickets" },
    });
    await expect(
      call(staffAssignTicket, SAM, free.admin, { id: TICKET, assignTo: SAM }),
    ).rejects.toThrow("That person cannot work support tickets.");
  });
});
