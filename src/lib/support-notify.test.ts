import { describe, expect, it } from "vitest";
import {
  DIGEST_EVERY_MINUTES,
  NOTIFY_BATCH_MINUTES,
  NOTIFY_EMAILS_PER_HOUR,
  NOTIFY_GIVE_UP_HOURS,
  NOTIFY_RETRY_AFTER_MINUTES,
  SUPPORT_RETENTION_MONTHS,
  buildReplyNotice,
  buildTicketDigest,
  digestDue,
  emailBudgetLeft,
  isPurgeable,
  monthsBefore,
  notifyLabel,
  shouldQueueNotice,
  supportRetentionCutoff,
  sweepDecision,
  type MessageKind,
} from "./support-notify";

const NOW = new Date("2026-11-15T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const hoursAgo = (h: number) => minutesAgo(h * 60);
const idle = { hasPending: false, lastDeliveredAt: null };

describe("who gets a notice, for which kind of message", () => {
  it("a person's reply queues a notice", () => {
    expect(shouldQueueNotice("staff", idle, NOW)).toBe(true);
  });

  it.each<MessageKind>(["learner", "ai", "system"])("a %s message never does", (kind) => {
    expect(shouldQueueNotice(kind, idle, NOW)).toBe(false);
  });

  it("a notice already waiting for this conversation absorbs the next reply", () => {
    expect(shouldQueueNotice("staff", { hasPending: true, lastDeliveredAt: null }, NOW)).toBe(
      false,
    );
  });

  it("a notice delivered less than 30 minutes ago absorbs it; at 30 minutes the next reply notifies again", () => {
    expect(NOTIFY_BATCH_MINUTES).toBe(30);
    const at = (m: number) => ({ hasPending: false, lastDeliveredAt: minutesAgo(m) });
    expect(shouldQueueNotice("staff", at(29), NOW)).toBe(false);
    expect(shouldQueueNotice("staff", at(30), NOW)).toBe(true);
    expect(shouldQueueNotice("staff", at(300), NOW)).toBe(true);
  });
});

describe("what the sweep does with a row", () => {
  const row = (queuedMinutesAgo: number, over: object = {}) => ({
    queuedAt: minutesAgo(queuedMinutesAgo),
    deliveredAt: null,
    gaveUpAt: null,
    ...over,
  });

  it("leaves a fresh row to the route, retries after 10 minutes, gives up after 24 hours", () => {
    expect(NOTIFY_RETRY_AFTER_MINUTES).toBe(10);
    expect(NOTIFY_GIVE_UP_HOURS).toBe(24);
    expect(sweepDecision(row(9), NOW)).toBe("wait");
    expect(sweepDecision(row(10), NOW)).toBe("retry");
    expect(sweepDecision(row(24 * 60 - 1), NOW)).toBe("retry");
    expect(sweepDecision(row(24 * 60), NOW)).toBe("give_up");
  });

  it("never touches a row that was delivered or given up", () => {
    expect(sweepDecision(row(60, { deliveredAt: NOW }), NOW)).toBe("skip");
    expect(sweepDecision(row(60 * 48, { gaveUpAt: NOW }), NOW)).toBe("skip");
  });
});

describe("the hourly email cap", () => {
  it("allows an email until 30 went out in the last hour", () => {
    expect(NOTIFY_EMAILS_PER_HOUR).toBe(30);
    expect(emailBudgetLeft(0)).toBe(true);
    expect(emailBudgetLeft(29)).toBe(true);
    expect(emailBudgetLeft(30)).toBe(false);
    expect(emailBudgetLeft(31)).toBe(false);
  });
});

describe("the person's name on the notice (the chat's rules)", () => {
  it("is '<first name> middle dot Support team' for a staff member with a usable first name", () => {
    expect(notifyLabel("Dana Whitfield", "d.whitfield@example.com")).toBe("Dana · Support team");
    expect(notifyLabel("sam", "ops@example.com")).toBe("Sam · Support team");
  });

  it("is just 'Support team' when there is no name, or the name is the email's own local part", () => {
    expect(notifyLabel(null, "dana@example.com")).toBe("Support team");
    expect(notifyLabel("", "dana@example.com")).toBe("Support team");
    expect(notifyLabel("jane.doe99", "jane.doe99@example.com")).toBe("Support team");
    // Without the email the leak check cannot be made, so no name shows.
    expect(notifyLabel("Dana", null)).toBe("Support team");
  });

  it("never carries Miya's name, even for a staff member called Miya", () => {
    expect(notifyLabel("Miya Tan", "tan@example.com")).toBe("Support team");
    expect(notifyLabel("miya", "x@example.com")).toBe("Support team");
  });
});

describe("the notice itself", () => {
  const dana = buildReplyNotice("Dana · Support team");
  const plain = buildReplyNotice("Support team");

  it("names the person in the push title and the email, and the push body is fixed", () => {
    expect(dana.push).toEqual({
      title: "Dana · Support team",
      body: "You have a reply in Help",
      data: { type: "support" },
    });
    expect(dana.email.subject).toBe("You have a reply from Dana · Support team");
    expect(dana.email.text).toContain("You have a reply from Dana · Support team.");
    expect(plain.push.title).toBe("Support team");
    expect(plain.email.subject).toBe("You have a reply from Support team");
  });

  it("tells the learner where to read it and that replying to the mail does not reach us", () => {
    expect(dana.email.text).toContain("go to Help");
    expect(dana.email.text).toContain("Replying to this email will not reach us.");
  });

  it("is a function of the label alone: the same label gives the same words, nothing else can get in", () => {
    expect(buildReplyNotice("Dana · Support team")).toEqual(dana);
    // Two different labels differ only where the label sits.
    const a = buildReplyNotice("AAAA");
    const b = buildReplyNotice("BBBB");
    expect(a.email.text.replaceAll("AAAA", "#")).toBe(b.email.text.replaceAll("BBBB", "#"));
    expect(a.push.body).toBe(b.push.body);
  });

  it("never says Miya on a person's notice", () => {
    expect(JSON.stringify(dana)).not.toMatch(/miya/i);
    expect(JSON.stringify(plain)).not.toMatch(/miya/i);
  });
});

describe("the owner's new-ticket note", () => {
  it("is a count and nothing the learner wrote", () => {
    expect(buildTicketDigest(1)).toEqual({
      subject: "[Alphonso] 1 new support ticket",
      text: expect.stringContaining("1 new support ticket waiting."),
    });
    expect(buildTicketDigest(7)?.subject).toBe("[Alphonso] 7 new support tickets");
  });

  it("is not sent for zero or a nonsense count", () => {
    expect(buildTicketDigest(0)).toBeNull();
    expect(buildTicketDigest(-2)).toBeNull();
    expect(buildTicketDigest(1.5)).toBeNull();
  });

  it("goes at most once every 15 minutes", () => {
    expect(DIGEST_EVERY_MINUTES).toBe(15);
    expect(digestDue(null, NOW)).toBe(true);
    expect(digestDue(minutesAgo(14), NOW)).toBe(false);
    expect(digestDue(minutesAgo(15), NOW)).toBe(true);
  });
});

describe("how long a support chat is kept", () => {
  it("is 12 months after it was solved", () => {
    expect(SUPPORT_RETENTION_MONTHS).toBe(12);
    expect(supportRetentionCutoff(new Date("2026-11-15T12:00:00Z")).toISOString()).toBe(
      "2025-11-15T12:00:00.000Z",
    );
  });

  it("counts calendar months, clamped at the end of a short month", () => {
    expect(monthsBefore(new Date("2026-03-31T00:00:00Z"), 1).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(monthsBefore(new Date("2028-02-29T10:00:00Z"), 12).toISOString()).toBe(
      "2027-02-28T10:00:00.000Z",
    );
    expect(monthsBefore(new Date("2026-01-15T00:00:00Z"), 2).toISOString()).toBe(
      "2025-11-15T00:00:00.000Z",
    );
  });

  describe("the deletion rule", () => {
    const solved = (solvedAt: string | null, status = "solved") => ({
      status,
      solvedAt: solvedAt ? new Date(solvedAt) : null,
    });

    it("deletes a solved chat only once it was solved more than 12 months ago", () => {
      expect(isPurgeable(solved("2025-11-15T11:59:59Z"), NOW)).toBe(true);
      expect(isPurgeable(solved("2025-11-15T12:00:00Z"), NOW)).toBe(false);
      expect(isPurgeable(solved("2026-06-01T00:00:00Z"), NOW)).toBe(false);
      expect(isPurgeable(solved("2024-01-01T00:00:00Z"), NOW)).toBe(true);
    });

    it("never deletes a chat that is not solved, however old", () => {
      for (const status of ["ai", "new", "open", "waiting_learner"]) {
        expect(isPurgeable(solved("2020-01-01T00:00:00Z", status), NOW)).toBe(false);
      }
    });

    it("never deletes a solved chat that has no solved time", () => {
      expect(isPurgeable(solved(null), NOW)).toBe(false);
    });
  });
});
