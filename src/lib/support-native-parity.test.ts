import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SUPPORT_COPY, SUPPORT_DAILY_LIMIT, SUPPORT_STARTERS } from "./support-copy";
import { SUPPORT_LINK_IDS, SUPPORT_LINK_LABELS } from "./support-links";
import { HANDOFF_NOTICE_TEXT } from "./support-view";

/**
 * The iPhone Help chat says word for word what the web's does (the round 12 mock the owner approved). The app target
 * and the Kit's tests only run in CI's macOS jobs, so this reads the Swift source: a string that drifts on either side
 * is red here, on any machine.
 */
const KIT = "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit";
const read = (p: string) => readFileSync(`${KIT}/${p}`, "utf8").replace(/\r\n/g, "\n");

/** `public static let name = "value"` lines, with Swift's escapes undone. */
function swiftStrings(source: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of source.matchAll(/public static let (\w+) = "((?:[^"\\]|\\.)*)"/g)) {
    out.set(m[1]!, m[2]!.replace(/\\(.)/g, "$1"));
  }
  return out;
}

describe("SupportCopy.swift is the web's SUPPORT_COPY", () => {
  const swift = read("SupportCopy.swift");
  const strings = swiftStrings(swift);

  it("has every string of the web copy, with the same words", () => {
    for (const [key, value] of Object.entries(SUPPORT_COPY)) {
      expect(strings.get(key), key).toBe(value);
    }
  });

  it("has no string the web does not have (a native-only line would be unreviewed copy)", () => {
    expect([...strings.keys()].sort()).toEqual(Object.keys(SUPPORT_COPY).sort());
  });

  it("has the same starters and the same daily limit", () => {
    const open = swift.indexOf("starters: [String] = [");
    expect(open).toBeGreaterThan(-1);
    const block = swift.slice(open, swift.indexOf("\n    ]", open));
    const starters = [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    expect(starters).toEqual([...SUPPORT_STARTERS]);
    expect(swift).toContain(`dailyMessageLimit = ${SUPPORT_DAILY_LIMIT}`);
  });
});

describe("SupportLinks.swift is the web's allow-list", () => {
  const swift = read("SupportLinks.swift");

  it("has the same ids in the same order", () => {
    const ids = [...swift.matchAll(/case (\w+)(?: = "([^"]+)")?\n/g)]
      .slice(0, SUPPORT_LINK_IDS.length)
      .map((m) => m[2] ?? m[1]);
    expect(ids).toEqual([...SUPPORT_LINK_IDS]);
  });

  it("has the same chip text for every id", () => {
    for (const id of SUPPORT_LINK_IDS) {
      expect(swift, id).toContain(`return "${SUPPORT_LINK_LABELS[id]}"`);
    }
  });

  it("reads the trailing marker the web reads, and only on AI rows", () => {
    // The pattern text is the web's MARKER (support-links.ts), with \z for the end of the text.
    expect(swift).toContain(String.raw`\s*\[\[link:([^\]\s]*)\]\]\s*\z`);
    expect(swift).toContain("guard kind == .ai else { return (body, nil) }");
  });
});

describe("SupportClient.swift talks to the three routes the way the web does", () => {
  const swift = read("SupportClient.swift");

  it("names the three routes and sends the channel header", () => {
    for (const path of ["api/support/conversation", "api/support/message", "api/support/handoff"]) {
      expect(swift, path).toContain(`"${path}"`);
    }
    expect(swift).toContain('setValue("ios", forHTTPHeaderField: "X-Client")');
  });

  it("a send carries only the text and the client id", () => {
    expect(swift).toContain('body: ["text": text, "clientId": clientID]');
    for (const forged of ["conversationId", "userId", "author", "kind"]) {
      expect(swift.match(new RegExp(`"${forged}"\\s*:`))).toBeNull();
    }
  });

  it("maps the same error codes", () => {
    expect(swift).toContain('"support-unreachable"');
    expect(swift).toContain('"support-message-limit"');
    expect(swift).toContain('which == "conversation"');
  });
});

describe("SupportView.kt (Android) is the web's SUPPORT_COPY and speaker rules", () => {
  const kt = readFileSync(
    "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/logic/SupportView.kt",
    "utf8",
  ).replace(/\r\n/g, "\n");
  const strings = new Map<string, string>();
  for (const m of kt.matchAll(/^ {4}const val ([A-Z_]+) = "((?:[^"\\]|\\.)*)"$/gm)) {
    strings.set(m[1]!, m[2]!.replace(/\\(.)/g, "$1"));
  }
  const snake = (k: string) => k.replace(/([A-Z])/g, "_$1").toUpperCase();

  it("has every string of the web copy, with the same words", () => {
    for (const [key, value] of Object.entries(SUPPORT_COPY)) {
      expect(strings.get(snake(key)), key).toBe(value);
    }
  });

  it("has no string the web does not have, apart from the server's hand-off line", () => {
    const own = [...strings.keys()].filter((k) => k !== "HANDOFF_NOTICE").sort();
    expect(own).toEqual(Object.keys(SUPPORT_COPY).map(snake).sort());
    expect(strings.get("HANDOFF_NOTICE")).toBe(HANDOFF_NOTICE_TEXT);
  });

  it("labels a person '<first name> middle dot Support team' and never as Miya, like the web", () => {
    expect(kt).toContain('"$name \\u00B7 ${SupportCopy.PERSON}"');
    expect(kt).toContain('name.equals("miya", ignoreCase = true)');
  });
});

describe("the Swift speaker rules are the web's", () => {
  const swift = read("SupportChat.swift");
  it("labels a person '<first name> middle dot Support team' and never as Miya", () => {
    expect(swift).toContain(String.raw`"\(name) \u{00B7} \(SupportCopy.person)"`);
    expect(swift).toContain('name.lowercased() != "miya"');
    expect(swift).toContain(`static let handoffNotice = "${HANDOFF_NOTICE_TEXT}"`);
  });
});
