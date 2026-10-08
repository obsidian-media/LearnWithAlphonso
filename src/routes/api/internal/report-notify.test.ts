import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleReportNotify,
  sendEmailViaResend,
  buildReportEmail,
} from "@/lib/report-notify.server";
import { secretMatches } from "@/lib/shared-secret.server";

const SECRET = "s".repeat(40);
const payload = {
  id: "8a0c7d0e-6a8f-4f41-9d3c-2f0f6a7b1c11",
  kind: "user",
  reason: "harassment",
  context: null,
  reporterName: "Ana",
  reportedId: "1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b",
  reportedName: "Bo",
  teamName: null,
  createdAt: "2026-10-08T10:00:00Z",
};
const req = (body: unknown, secret?: string) =>
  new Request("https://learn.alphonsoecosystem.app/api/internal/report-notify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret === undefined ? {} : { "X-Report-Notify-Secret": secret }),
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("REPORT_NOTIFY_SECRET", SECRET);
  vi.stubEnv("REPORT_NOTIFY_TO", "report@alphonsoecosystem.app");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/internal/report-notify", () => {
  it("emails the owner for a well-formed, authenticated report", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const res = await handleReportNotify(req(payload, SECRET), send);
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    const msg = send.mock.calls[0][0];
    expect(msg.to).toBe("report@alphonsoecosystem.app");
    expect(msg.subject).toBe("[Alphonso] New report: a learner");
    expect(msg.text).toContain(payload.id);
    expect(msg.text).toContain("Reason: harassment");
    expect(msg.text).toContain("Respond within 24 hours");
  });
  it("401 on a wrong secret, send never called", async () => {
    const send = vi.fn();
    expect((await handleReportNotify(req(payload, "x".repeat(40)), send)).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });
  it("401 with no secret header", async () => {
    const send = vi.fn();
    expect((await handleReportNotify(req(payload), send)).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });
  it("a different-length secret is a clean 401, not a throw", async () => {
    expect((await handleReportNotify(req(payload, "short"), vi.fn())).status).toBe(401);
    expect(secretMatches(SECRET, "short")).toBe(false);
  });
  it("503 when the secret is unset or too short, so a weak secret can never authenticate", async () => {
    vi.stubEnv("REPORT_NOTIFY_SECRET", "short");
    expect((await handleReportNotify(req(payload, "short"), vi.fn())).status).toBe(503);
  });
  it("400 on a payload with an unknown kind", async () => {
    expect(
      (await handleReportNotify(req({ ...payload, kind: "chat" }, SECRET), vi.fn())).status,
    ).toBe(400);
  });
  it("502 when the email provider fails", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Resend 500"));
    expect((await handleReportNotify(req(payload, SECRET), send)).status).toBe(502);
  });
  it("an AI report names no account and shows the context", () => {
    const msg = buildReportEmail(
      {
        ...payload,
        kind: "ai_response",
        reportedId: null,
        reportedName: null,
        context: { source: "hector", course: "fr", message: "bad reply" },
      },
      "to@example.test",
    );
    expect(msg.subject).toBe("[Alphonso] New report: an AI response");
    expect(msg.text).toContain("Reported account: none (AI response)");
    expect(msg.text).toContain("bad reply");
  });
  it("compares secrets in constant time", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/shared-secret.server.ts"),
      "utf8",
    );
    expect(src).toContain("timingSafeEqual");
    expect(src).not.toMatch(/expected\s*===\s*given/);
  });
});

describe("sendEmailViaResend", () => {
  it("posts to Resend with the key as a bearer token", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await sendEmailViaResend({ to: "a@example.test", subject: "S", text: "T" }, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toMatchObject({
      to: ["a@example.test"],
      subject: "S",
      text: "T",
    });
  });
  it("throws on a non-2xx answer and when the key is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    await expect(
      sendEmailViaResend(
        { to: "a", subject: "s", text: "t" },
        vi.fn().mockResolvedValue(new Response("nope", { status: 422 })),
      ),
    ).rejects.toThrow("Resend 422");
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendEmailViaResend({ to: "a", subject: "s", text: "t" }, vi.fn())).rejects.toThrow(
      "RESEND_API_KEY",
    );
  });
});
