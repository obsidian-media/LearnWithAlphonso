import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SUPPORT_FROM,
  deliverNotice,
  handleSupportNotify,
  sendDigest,
  sendPushViaEdgeFunction,
  supabaseNotifyStore,
  sweepSupport,
  type QueuePatch,
  type QueueRow,
  type Recipient,
  type SupportNotifyDeps,
  type SupportNotifyStore,
} from "./support-notify.server";
import { REPORT_NOTIFY_HEADER, type EmailMessage } from "./report-notify.server";
import type { LooseAdmin } from "./support-chat-runtime.server";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-11-15T12:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
// A reply's text and a learner's address that must never reach a log, an email or a push.
const BODY_SENTINEL = "SENTINEL-REPLY-TEXT-do-not-leak";
const LEARNER_EMAIL = "learner.sentinel@example.com";

const row = (over: Partial<QueueRow> = {}): QueueRow => ({
  id: 1,
  conversationId: "c-1",
  messageId: 10,
  queuedAt: ago(1),
  emailSentAt: null,
  pushSentAt: null,
  deliveredAt: null,
  gaveUpAt: null,
  attempts: 0,
  ...over,
});

type World = {
  rows: QueueRow[];
  recipients: Record<number, Recipient | null>;
  /** conversation ids the owner was told about, with when */
  seen: Map<string, Date>;
  newTickets: string[];
  emailsInLastHour: number;
};

function fakeStore(w: World): SupportNotifyStore {
  return {
    async getRow(id) {
      return w.rows.find((r) => r.id === id) ?? null;
    },
    async waitingRows(before, limit) {
      return w.rows
        .filter((r) => !r.deliveredAt && !r.gaveUpAt && r.queuedAt < before)
        .sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime())
        .slice(0, limit);
    },
    async recipient(r) {
      return w.recipients[r.id] ?? null;
    },
    async emailsSentSince() {
      return w.emailsInLastHour;
    },
    async save(id, patch: QueuePatch) {
      const r = w.rows.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    },
    async unseenNewTickets(limit) {
      return w.newTickets.filter((id) => !w.seen.has(id)).slice(0, limit);
    },
    async lastDigestAt() {
      const all = [...w.seen.values()].map((d) => d.getTime());
      return all.length ? new Date(Math.max(...all)) : null;
    },
    async markSeen(ids, at) {
      for (const id of ids) w.seen.set(id, at);
    },
  };
}

function setup(over: Partial<World> = {}) {
  const world: World = {
    rows: [row()],
    recipients: {
      1: {
        userId: "u-1",
        email: LEARNER_EMAIL,
        staff: { displayName: "Dana Whitfield", email: "dw@example.com" },
      },
    },
    seen: new Map(),
    newTickets: [],
    emailsInLastHour: 0,
    ...over,
  };
  const emails: EmailMessage[] = [];
  const pushes: { userId: string; push: unknown }[] = [];
  const deps: SupportNotifyDeps & { failEmail?: boolean; failPush?: boolean } = {
    store: fakeStore(world),
    now: () => NOW,
    sendEmail: async (m) => {
      if (deps.failEmail) throw new Error("Resend 500 (internal_error)");
      emails.push(m);
    },
    sendPush: async (userId, push) => {
      if (deps.failPush) throw new Error("send-push 502");
      pushes.push({ userId, push });
    },
    ownerEmail: "owner@example.com",
    supportFrom: DEFAULT_SUPPORT_FROM,
  };
  return { world, deps, emails, pushes };
}

let errors: string[];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation(
    (...a: unknown[]) => void errors.push(a.map(String).join(" ")),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("the reply email's sender and subject", () => {
  it("comes from the Support team, never from Alphonso or Miya, with no bracket prefix", async () => {
    expect(DEFAULT_SUPPORT_FROM).toBe(
      "Learn with Alphonso Support team <support@hello.learnwithalphonso.com>",
    );
    const { world, deps, emails } = setup();
    await deliverNotice(deps, world.rows[0]);
    const sentFrom = emails[0].from as string;
    expect(sentFrom.split("<")[0].trim()).toMatch(/Support team$/);
    expect(sentFrom).not.toMatch(/miya/i);
    expect(emails[0].subject).not.toContain("[Alphonso]");
    expect(emails[0].subject).toMatch(/Support team$/);
  });
});

describe("one reply notice", () => {
  it("sends the email and the push, names the person like the chat, and marks the row delivered", async () => {
    const { world, deps, emails, pushes } = setup();
    const result = await deliverNotice(deps, world.rows[0]);
    expect(result).toEqual({ email: "sent", push: "sent", delivered: true });
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: LEARNER_EMAIL,
      from: DEFAULT_SUPPORT_FROM,
      subject: "You have a reply from Dana \u00B7 Support team",
    });
    expect(pushes).toEqual([
      {
        userId: "u-1",
        push: {
          title: "Dana \u00B7 Support team",
          body: "You have a reply in Help",
          data: { type: "support" },
        },
      },
    ]);
    expect(world.rows[0].deliveredAt).toEqual(NOW);
    expect(world.rows[0].emailSentAt).toEqual(NOW);
    expect(world.rows[0].pushSentAt).toEqual(NOW);
  });

  it("says just 'Support team' when the staff member has no usable first name, and never Miya", async () => {
    const { world, deps, emails, pushes } = setup({
      recipients: {
        1: {
          userId: "u-1",
          email: LEARNER_EMAIL,
          staff: { displayName: "Miya", email: "m@example.com" },
        },
      },
    });
    await deliverNotice(deps, world.rows[0]);
    expect(emails[0].subject).toBe("You have a reply from Support team");
    expect((pushes[0].push as { title: string }).title).toBe("Support team");
  });

  it("writes no address or name to a log, even when both channels fail", async () => {
    const { world, deps } = setup();
    deps.failEmail = true;
    deps.failPush = true;
    const r = await deliverNotice(deps, world.rows[0]);
    expect(r).toEqual({ email: "failed", push: "failed", delivered: false });
    const log = errors.join("\n");
    expect(log).not.toContain(LEARNER_EMAIL);
    expect(log).not.toContain("Dana");
    expect(log).not.toContain("Whitfield");
    expect(log).toContain("email failed");
  });

  it("keeps a failed email for the sweep but records the push that did go out, so it is not sent twice", async () => {
    const { world, deps, pushes, emails } = setup();
    deps.failEmail = true;
    await deliverNotice(deps, world.rows[0]);
    expect(world.rows[0].pushSentAt).toEqual(NOW);
    expect(world.rows[0].emailSentAt).toBeNull();
    expect(world.rows[0].deliveredAt).toBeNull();
    expect(world.rows[0].attempts).toBe(1);
    deps.failEmail = false;
    const again = await deliverNotice(deps, world.rows[0]);
    expect(again).toEqual({ email: "sent", push: "done", delivered: true });
    expect(pushes).toHaveLength(1);
    expect(emails).toHaveLength(1);
    expect(world.rows[0].deliveredAt).toEqual(NOW);
  });

  it("an Apple private relay address is mailed like any other", async () => {
    const relay = "abc123xyz@privaterelay.appleid.com";
    const { world, deps, emails } = setup({
      recipients: { 1: { userId: "u-1", email: relay, staff: null } },
    });
    await deliverNotice(deps, world.rows[0]);
    expect(emails[0].to).toBe(relay);
  });

  it("an account with no address gets the push only, and the row still finishes", async () => {
    const { world, deps, emails, pushes } = setup({
      recipients: { 1: { userId: "u-1", email: null, staff: null } },
    });
    const r = await deliverNotice(deps, world.rows[0]);
    expect(r).toEqual({ email: "skipped", push: "sent", delivered: true });
    expect(emails).toHaveLength(0);
    expect(pushes).toHaveLength(1);
  });

  it("a learner with no device is fine: the push sender does nothing and the row finishes", async () => {
    const { world, deps } = setup();
    // The send-push function answers 200 with sent: 0 for a learner with no tokens; the wrapper treats 200 as done.
    deps.sendPush = (userId, push) =>
      sendPushViaEdgeFunction(
        userId,
        push,
        (async () =>
          new Response(JSON.stringify({ sent: 0, skipped: null }), {
            status: 200,
          })) as unknown as typeof fetch,
      );
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k".repeat(40));
    const r = await deliverNotice(deps, world.rows[0]);
    expect(r.push).toBe("sent");
    expect(r.delivered).toBe(true);
    vi.unstubAllEnvs();
  });

  it("holds the email back at the hourly cap and still sends the push", async () => {
    const { world, deps, emails, pushes } = setup({ emailsInLastHour: 30 });
    const r = await deliverNotice(deps, world.rows[0]);
    expect(r).toEqual({ email: "failed", push: "sent", delivered: false });
    expect(emails).toHaveLength(0);
    expect(pushes).toHaveLength(1);
    expect(world.rows[0].emailSentAt).toBeNull();
  });

  it("does nothing, and finishes, when the reply or the account is gone", async () => {
    const { world, deps, emails, pushes } = setup({ recipients: { 1: null } });
    const r = await deliverNotice(deps, world.rows[0]);
    expect(r.delivered).toBe(true);
    expect(emails).toHaveLength(0);
    expect(pushes).toHaveLength(0);
    expect(world.rows[0].deliveredAt).toEqual(NOW);
  });

  it("never sends again for a row that was delivered or given up", async () => {
    const { world, deps, emails, pushes } = setup({
      rows: [row({ deliveredAt: ago(5) }), row({ id: 2, gaveUpAt: ago(5) })],
    });
    await deliverNotice(deps, world.rows[0]);
    await deliverNotice(deps, world.rows[1]);
    expect(emails).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });
});

describe("the push call", () => {
  it("posts the generic payload to the send-push function with the service role key", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co/");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k".repeat(40));
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await sendPushViaEdgeFunction(
      "u-1",
      { title: "Support team", body: "You have a reply in Help", data: { type: "support" } },
      fetchImpl,
    );
    expect(calls[0].url).toBe("https://example.supabase.co/functions/v1/send-push");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      userId: "u-1",
      title: "Support team",
      body: "You have a reply in Help",
      data: { type: "support" },
    });
    vi.unstubAllEnvs();
  });

  it("throws on a failed call with the status only, and when it is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k".repeat(40));
    const bad = (async () =>
      new Response("secret body", { status: 502 })) as unknown as typeof fetch;
    await expect(
      sendPushViaEdgeFunction("u", { title: "t", body: "b", data: { type: "support" } }, bad),
    ).rejects.toThrow("send-push 502");
    vi.stubEnv("SUPABASE_URL", "");
    await expect(
      sendPushViaEdgeFunction("u", { title: "t", body: "b", data: { type: "support" } }),
    ).rejects.toThrow("not configured");
    vi.unstubAllEnvs();
  });
});

describe("POST /api/internal/support-notify", () => {
  const req = (headers: Record<string, string>, body: unknown) =>
    new Request("https://x.test/api/internal/support-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  beforeEach(() => vi.stubEnv("REPORT_NOTIFY_SECRET", SECRET));
  afterEach(() => vi.unstubAllEnvs());

  it("answers 401 for a missing or wrong secret and sends nothing", async () => {
    const { deps, emails, pushes } = setup();
    const make = async () => deps;
    expect((await handleSupportNotify(req({}, { queueId: 1 }), make)).status).toBe(401);
    expect(
      (
        await handleSupportNotify(
          req({ [REPORT_NOTIFY_HEADER]: "wrong".repeat(10) }, { queueId: 1 }),
          make,
        )
      ).status,
    ).toBe(401);
    expect(emails).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });

  it("answers 503 when the server secret is not configured, even for a request that sends one", async () => {
    vi.stubEnv("REPORT_NOTIFY_SECRET", "short");
    const { deps } = setup();
    const res = await handleSupportNotify(
      req({ [REPORT_NOTIFY_HEADER]: "short" }, { queueId: 1 }),
      async () => deps,
    );
    expect(res.status).toBe(503);
  });

  it("answers 400 for a body that is not a queue id", async () => {
    const { deps } = setup();
    const make = async () => deps;
    const h = { [REPORT_NOTIFY_HEADER]: SECRET };
    expect((await handleSupportNotify(req(h, "not json"), make)).status).toBe(400);
    expect((await handleSupportNotify(req(h, { queueId: "1" }), make)).status).toBe(400);
    expect((await handleSupportNotify(req(h, { queueId: -3 }), make)).status).toBe(400);
    expect((await handleSupportNotify(req(h, {}), make)).status).toBe(400);
  });

  it("delivers the queued notice and answers with words only", async () => {
    const { world, deps, emails } = setup();
    const res = await handleSupportNotify(
      req({ [REPORT_NOTIFY_HEADER]: SECRET }, { queueId: 1 }),
      async () => deps,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, email: "sent", push: "sent", delivered: true });
    expect(text).not.toContain(LEARNER_EMAIL);
    expect(emails).toHaveLength(1);
    expect(world.rows[0].deliveredAt).toEqual(NOW);
  });

  it("answers 200 and sends nothing for a queue id that does not exist", async () => {
    const { deps, emails } = setup();
    const res = await handleSupportNotify(
      req({ [REPORT_NOTIFY_HEADER]: SECRET }, { queueId: 99 }),
      async () => deps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, found: false });
    expect(emails).toHaveLength(0);
  });

  it("answers 500 without leaking the failure's text when the store throws", async () => {
    const { deps } = setup();
    deps.store.getRow = async () => {
      throw new Error(`boom for ${LEARNER_EMAIL}`);
    };
    const res = await handleSupportNotify(
      req({ [REPORT_NOTIFY_HEADER]: SECRET }, { queueId: 1 }),
      async () => deps,
    );
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(LEARNER_EMAIL);
  });
});

describe("the sweep", () => {
  it("retries a notice the route did not finish after 10 minutes, leaves a fresh one alone", async () => {
    const { world, deps, emails } = setup({
      rows: [row({ id: 1, queuedAt: ago(11) }), row({ id: 2, queuedAt: ago(5) })],
      recipients: {
        1: { userId: "u-1", email: LEARNER_EMAIL, staff: null },
        2: { userId: "u-2", email: "two@example.com", staff: null },
      },
    });
    const r = await sweepSupport(deps);
    expect(r).toMatchObject({ retried: 1, delivered: 1, gaveUp: 0 });
    expect(emails.map((e) => e.to)).toEqual([LEARNER_EMAIL]);
    expect(world.rows[1].deliveredAt).toBeNull();
  });

  it("gives up on a notice older than 24 hours without sending it", async () => {
    const { world, deps, emails, pushes } = setup({ rows: [row({ queuedAt: ago(24 * 60 + 1) })] });
    const r = await sweepSupport(deps);
    expect(r).toMatchObject({ retried: 0, gaveUp: 1 });
    expect(world.rows[0].gaveUpAt).toEqual(NOW);
    expect(emails).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });

  it("sends only the channel still owed on a retry", async () => {
    const { world, deps, emails, pushes } = setup({
      rows: [row({ queuedAt: ago(30), pushSentAt: ago(29) })],
    });
    await sweepSupport(deps);
    expect(emails).toHaveLength(1);
    expect(pushes).toHaveLength(0);
    expect(world.rows[0].deliveredAt).toEqual(NOW);
  });
});

describe("the owner's new-ticket digest", () => {
  it("sends one note with the count, marks those tickets as told, and never includes a learner's words", async () => {
    const { world, deps, emails } = setup({ rows: [], newTickets: ["c-a", "c-b", "c-c"] });
    const n = await sendDigest(deps);
    expect(n).toBe(3);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: "owner@example.com",
      subject: "[Alphonso] 3 new support tickets",
    });
    expect(emails[0].text).not.toMatch(/c-a|c-b|c-c/);
    expect([...world.seen.keys()].sort()).toEqual(["c-a", "c-b", "c-c"]);
  });

  it("tells the owner about a ticket once, and not again within 15 minutes", async () => {
    const { world, deps, emails } = setup({ rows: [], newTickets: ["c-a"] });
    await sendDigest(deps);
    expect(await sendDigest(deps)).toBe(0);
    world.newTickets.push("c-b");
    expect(await sendDigest(deps)).toBe(0); // still inside the 15 minutes
    expect(emails).toHaveLength(1);
    // Later, only the new one is counted.
    const later = { ...deps, now: () => new Date(NOW.getTime() + 16 * 60_000) };
    expect(await sendDigest(later)).toBe(1);
    expect(emails[1].subject).toBe("[Alphonso] 1 new support ticket");
  });

  it("sends nothing with no new tickets or no owner address, and retries after a failed send", async () => {
    const none = setup({ rows: [], newTickets: [] });
    expect(await sendDigest(none.deps)).toBe(0);
    expect(none.emails).toHaveLength(0);

    const noOwner = setup({ rows: [], newTickets: ["c-a"] });
    noOwner.deps.ownerEmail = "";
    expect(await sendDigest(noOwner.deps)).toBe(0);
    expect(noOwner.emails).toHaveLength(0);

    const failing = setup({ rows: [], newTickets: ["c-a"] });
    failing.deps.failEmail = true;
    expect(await sendDigest(failing.deps)).toBe(0);
    expect(failing.world.seen.size).toBe(0);
    failing.deps.failEmail = false;
    expect(await sendDigest(failing.deps)).toBe(1);
  });
});

describe("the production store never reads a reply's text", () => {
  /** A service client over fixed tables. A column list that asks for the text (or everything) gets the sentinel back. */
  function fakeAdmin() {
    const selects: { table: string; columns: string }[] = [];
    const tables: Record<string, Record<string, unknown>[]> = {
      support_conversations: [{ id: "c-1", user_id: "u-1" }],
      support_messages: [
        {
          id: 10,
          author_id: "staff-1",
          user_id: "u-1",
          author_kind: "staff",
          body: `${BODY_SENTINEL} [[link:subscription]]`,
        },
      ],
      profiles: [{ id: "staff-1", display_name: "Dana Whitfield" }],
    };
    const admin = {
      rpc: async () => ({ data: null, error: null }),
      from(table: string) {
        let cols = "";
        let filter: [string, unknown] | null = null;
        const q = {
          select(c: string) {
            cols = c;
            selects.push({ table, columns: c });
            return q;
          },
          eq(k: string, v: unknown) {
            filter = [k, v];
            return q;
          },
          limit() {
            return q;
          },
          then(resolve: (v: unknown) => void) {
            const wantsAll = cols === "*" || /\bbody\b/.test(cols);
            const data = (tables[table] ?? [])
              .filter((r) => !filter || r[filter[0]] === filter[1])
              .map((r) => {
                const out: Record<string, unknown> = {};
                for (const k of Object.keys(r))
                  if (
                    wantsAll ||
                    cols
                      .split(",")
                      .map((x) => x.trim())
                      .includes(k)
                  )
                    out[k] = r[k];
                return out;
              });
            resolve({ data, error: null });
          },
        };
        return q;
      },
      auth: {
        admin: {
          async getUserById(id: string) {
            return {
              data: { user: { email: id === "staff-1" ? "dw@example.com" : LEARNER_EMAIL } },
            };
          },
        },
      },
    };
    return { admin: admin as unknown as LooseAdmin, selects };
  }

  it("selects only the reply's author, so the text can never reach the notice", async () => {
    const { admin, selects } = fakeAdmin();
    const store = supabaseNotifyStore(admin);
    const who = await store.recipient(row());
    expect(who).toEqual({
      userId: "u-1",
      email: LEARNER_EMAIL,
      staff: { displayName: "Dana Whitfield", email: "dw@example.com" },
    });
    const messageReads = selects.filter((s) => s.table === "support_messages");
    expect(messageReads).toEqual([{ table: "support_messages", columns: "author_id" }]);
    expect(JSON.stringify(who)).not.toContain(BODY_SENTINEL);
  });

  it("end to end: a reply whose text holds a sentinel and a link marker leaves neither in the email or the push", async () => {
    const { admin } = fakeAdmin();
    const { deps, emails, pushes } = setup();
    deps.store = supabaseNotifyStore(admin);
    // The save and the lookups other than recipient are not under test here.
    deps.store.save = async () => {};
    deps.store.emailsSentSince = async () => 0;
    await deliverNotice(deps, row());
    const sent = JSON.stringify({
      emails: emails.map((e) => ({ subject: e.subject, text: e.text, from: e.from })),
      pushes,
    });
    expect(emails).toHaveLength(1);
    expect(sent).not.toContain(BODY_SENTINEL);
    expect(sent).not.toContain("[[link:");
    expect(sent).toContain("Dana \u00B7 Support team");
  });
});
