import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL } from "./legal-required-phrases";
import { guardSupportReply } from "./support-ai.server";

const NBSP = "\u00A0";
const ZW = "\u200B";

describe("Miya link allow-list", () => {
  it.each([
    "Go to evil.co now",
    "Log in at evil.me/login",
    "Join t.me/x for help",
    "Visit evil dot com",
    "Visit evil (dot) com/login",
    "Visit evil punto com",
    "Write to evil at gmail dot com",
    "Open evil.example.org/x",
    `Open evil${ZW}.com`,
    `Open evil.${NBSP}com`.replace(`.${NBSP}`, "."),
    "Open ｅｖｉｌ.ｃｏｍ",
    "Open 203.0.113.9/login",
    "Visit alphonsoecosystem.app.evil.co",
    "See learnwithalphonso.com.evil.me/x",
    "Visit http://learnwithalphonso.com/privacy",
  ])("blocks %j", (text) => {
    expect(guardSupportReply(text).ok).toBe(false);
  });

  it.each([
    "See https://learnwithalphonso.com/privacy for the details.",
    "See learnwithalphonso.com/support",
    "Our site is alphonsoecosystem.app",
    `Write to ${SUPPORT_EMAIL}.`,
    "Tap Settings, e.g. Subscription. Then wait.",
    "A polka dot dress is not a link.",
    "Open the app at 9.30 or 10.45",
    "That is i.e. fine, etc.",
  ])("keeps %j", (text) => {
    expect(guardSupportReply(text)).toEqual({ ok: true, reply: text });
  });

  it("returns the model's own text, not the flattened copy", () => {
    const text = `Tap${NBSP}Restore.`;
    expect(guardSupportReply(text)).toEqual({ ok: true, reply: text });
  });
});
