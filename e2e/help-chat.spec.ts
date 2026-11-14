import { expect, test, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fakeServerFns, signInAsFakeUser } from "./lesson-helpers";

/**
 * The web Help chat at phone width with no backend: the entry points, first open (AI on and off), the conversation,
 * the hand-off, the ticket states, and the errors and limits. Every `/api/support/*` answer is made up here in the
 * browser; the real routes are tested in src/routes/api/support and src/lib/support-chat.test.ts.
 *
 * Set HELP_SHOTS_DIR to also write each screen in light and night (the owner's mock-versus-real sign-off pages).
 */
const SHOTS = process.env.HELP_SHOTS_DIR;
const PHONE = { width: 393, height: 852 };

type Kind = "you" | "ai" | "support" | "system";
type Msg = { id: number; kind: Kind; body: string; at: string; link?: string | null };
type Convo = {
  status: "none" | "ai" | "new" | "open" | "waiting_learner" | "solved";
  unread?: number;
  aiAvailable?: boolean;
  messages?: Msg[];
};

/** Today at a local clock time, or some days ago: the labels read the way the mock draws them. */
const at = (h: number, m: number, daysAgo = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const msg = (id: number, kind: Kind, body: string, when: string, link?: string): Msg => ({
  id,
  kind,
  body,
  at: when,
  link: link ?? null,
});
const HANDOFF = "A person will reply here.";

type Handlers = {
  /** What POST /api/support/message answers; default: stores the text and hands over. */
  message?: (
    route: Route,
    body: { text: string; clientId: string },
    n: number,
  ) => Promise<void> | void;
};

async function serve(
  page: Page,
  convo: Convo,
  handlers: Handlers = {},
  opts: { declined?: boolean } = {},
) {
  let sends = 0;
  await signInAsFakeUser(page);
  await fakeServerFns(page, {
    getMyProfile: { display_name: "Sam Rivera" },
    getAiConsent: { grantedAt: opts.declined ? null : "2026-11-01T00:00:00Z" },
    getNameStatus: { displayName: "Sam Rivera", needsPrompt: false, prefill: "" },
  });
  await page.route("**/api/support/conversation", (route) =>
    route.fulfill({
      json: {
        status: convo.status,
        unread: convo.unread ?? 0,
        aiAvailable: convo.aiAvailable ?? false,
        messages: convo.messages ?? [],
      },
    }),
  );
  await page.route("**/api/support/message", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      text: string;
      clientId: string;
    };
    sends += 1;
    if (handlers.message) return handlers.message(route, body, sends);
    const base = (convo.messages ?? []).length;
    return route.fulfill({
      json: {
        status: "new",
        messages: [
          msg(base + 1, "you", body.text, new Date().toISOString()),
          msg(base + 2, "system", HANDOFF, new Date().toISOString()),
        ],
      },
    });
  });
  await page.route("**/api/support/handoff", (route) =>
    route.fulfill({
      json: { status: "new", messages: [msg(1, "system", HANDOFF, new Date().toISOString())] },
    }),
  );
  return { sends: () => sends };
}

async function openHelp(page: Page) {
  await page.setViewportSize(PHONE);
  await page.goto("/help");
  await expect(page.getByRole("region", { name: "Help" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Loading your messages")).toHaveCount(0);
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Light then night, one file each. */
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.evaluate(() => delete document.documentElement.dataset.dsMode);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/${name}-light.png` });
  await page.evaluate(() => (document.documentElement.dataset.dsMode = "night"));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/${name}-night.png` });
  await page.evaluate(() => delete document.documentElement.dataset.dsMode);
}

test.describe("entry points", () => {
  test("Settings has a Help row (Profile on web) that opens the chat", async ({ page }) => {
    await serve(page, { status: "none" });
    await page.setViewportSize(PHONE);
    await page.goto("/profile");
    const row = page.getByRole("link", { name: /Ask a question or talk to a person/ });
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
    await page.evaluate(() =>
      document.getElementById("help-heading")?.scrollIntoView({ block: "center" }),
    );
    await noSideScroll(page);
    await shot(page, "1a-settings-help-row");
    await row.click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole("region", { name: "Help" })).toBeVisible({ timeout: 30_000 });
  });

  test("Get help on the profile error screen opens the chat", async ({ page }) => {
    await serve(page, { status: "none" });
    // The profile numbers fail to load: the error screen (after the query's own retries) carries Get help.
    await page.route("**/_serverFn/**", (route) => {
      const id = route.request().url().split("/_serverFn/")[1]?.split("?")[0] ?? "";
      const name = Buffer.from(id, "base64url").toString("utf8");
      if (name.includes('"getProfileOverview_createServerFn'))
        return route.fulfill({ status: 500, json: {} });
      return route.fallback();
    });
    await page.setViewportSize(PHONE);
    await page.goto("/profile");
    await expect(page.getByText("Your profile didn't load.")).toBeVisible({ timeout: 45_000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, "1b-profile-error-get-help");
    await page.getByRole("link", { name: "Get help" }).click();
    await expect(page).toHaveURL(/\/help$/);
  });

  test("Get help on a paywall that could not load opens the chat", async ({ page }) => {
    await serve(page, { status: "none" });
    await page.route("**/api/pro-status", (route) =>
      route.fulfill({ json: { pro: false, store: null, trialEligible: true, manageUrl: null } }),
    );
    await page.route("**/api/pro-offering**", (route) =>
      route.fulfill({ status: 503, json: { error: "offering-unavailable" } }),
    );
    await page.setViewportSize(PHONE);
    await page.goto("/hector");
    const link = page.getByRole("link", { name: "Get help" });
    await link.scrollIntoViewIfNeeded();
    await expect(page.getByText(/Couldn't load subscription options/)).toBeVisible();
    await shot(page, "1c-paywall-get-help");
    await link.click();
    await expect(page).toHaveURL(/\/help$/);
  });
});

test.describe("first open", () => {
  test("AI on: the AI says what it is, starters fill the box and never send", async ({ page }) => {
    const fake = await serve(page, { status: "none", aiAvailable: true });
    await openHelp(page);
    await expect(page.getByRole("heading", { name: "How can I help?" })).toBeVisible();
    await expect(page.getByText("You are chatting with an AI")).toBeVisible();
    await expect(page.getByRole("button", { name: "Talk to a person" })).toBeVisible();
    await noSideScroll(page);
    await shot(page, "2-first-open-ai-on");
    await page.getByRole("button", { name: "Weekly league" }).click();
    await expect(page.getByRole("textbox")).toHaveValue("Weekly league");
    expect(fake.sends()).toBe(0);
  });

  test("AI off (the launch state): replies come from a person, no AI wording", async ({ page }) => {
    await serve(page, { status: "none", aiAvailable: false });
    await openHelp(page);
    await expect(page.getByRole("heading", { name: "Write to us" })).toBeVisible();
    await expect(page.getByText("Replies come from a person")).toBeVisible();
    await expect(page.getByText("You are chatting with an AI")).toHaveCount(0);
    await noSideScroll(page);
    await shot(page, "4a-first-open-ai-off");
  });

  test("a learner who turned AI features off is told why a person answers", async ({ page }) => {
    await serve(page, { status: "none", aiAvailable: true }, {}, { declined: true });
    await openHelp(page);
    await expect(page.getByText("AI answers are off for you")).toBeVisible();
    await shot(page, "4c-first-open-ai-declined");
  });

  test("writing with AI off keeps the message and says a person will reply", async ({ page }) => {
    await serve(page, { status: "none", aiAvailable: false });
    await openHelp(page);
    await page.getByRole("textbox").fill("I got charged but Pro is not showing. I am on iPhone.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("With our team")).toBeVisible();
    await expect(page.getByText(HANDOFF)).toBeVisible();
    await expect(page.getByText(/I got charged but Pro/)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveAttribute("placeholder", "Add something");
    await shot(page, "4b-after-first-message-ai-off");
  });
});

test.describe("the conversation with the AI", () => {
  const q1 = msg(1, "you", "My Pro disappeared after I got a new phone.", at(9, 41));

  test("the AI is writing (typing state)", async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    await serve(
      page,
      {
        status: "ai",
        aiAvailable: true,
        messages: [
          q1,
          msg(
            2,
            "ai",
            "Tap Restore Purchases on the subscription screen, and sign in the same way you did when you subscribed.",
            at(9, 41),
            "subscription",
          ),
        ],
      },
      {
        message: async (route, body) => {
          await gate;
          await route.fulfill({
            json: { status: "ai", messages: [msg(3, "you", body.text, at(9, 43))] },
          });
        },
      },
    );
    await openHelp(page);
    await page.getByRole("textbox").fill("I tried that and it still says no Pro.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("[data-typing]")).toContainText("is writing");
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
    await shot(page, "3a-ai-typing");
    release();
    await expect(page.locator("[data-typing]")).toHaveCount(0);
  });

  test("an answer with an app link: the chip opens that screen", async ({ page }) => {
    await serve(page, {
      status: "ai",
      aiAvailable: true,
      messages: [
        q1,
        msg(
          2,
          "ai",
          "That can happen after a new phone. Tap Restore Purchases on the subscription screen, and sign in the same way you did when you subscribed. I can see Pro isn't active on your account right now.\n\nIf that doesn't fix it, I can hand you to a person.",
          at(9, 41),
          "subscription",
        ),
      ],
    });
    await openHelp(page);
    await page.getByRole("textbox").fill("Restore did nothing, what now?");
    const chip = page.getByRole("link", { name: /Open the subscription screen/ });
    await expect(chip).toBeVisible();
    await noSideScroll(page);
    await shot(page, "3b-ai-answer-with-link");
    await chip.click();
    await expect(page).toHaveURL(/\/hector$/);
  });

  test("a link outside the allow-list is never drawn", async ({ page }) => {
    await serve(page, {
      status: "ai",
      aiAvailable: true,
      messages: [q1, msg(2, "ai", "Go to the site.", at(9, 41), "https://evil.example/pay")],
    });
    await openHelp(page);
    await expect(page.getByText("Go to the site.")).toBeVisible();
    await expect(page.locator("[data-support-link]")).toHaveCount(0);
    await expect(page.locator('a[href*="evil"]')).toHaveCount(0);
  });
});

test.describe("ticket states", () => {
  const first = msg(1, "you", "I got charged but Pro is not showing. I am on iPhone.", at(10, 2));
  const ai = msg(
    2,
    "ai",
    "I'm sorry about that. Pro can take a moment, and Restore Purchases usually fixes it. Billing questions go to a person, so I'm handing this over.",
    at(10, 2),
  );
  const handoff = msg(3, "system", HANDOFF, at(10, 2));

  test("handed to a person: With our team", async ({ page }) => {
    await serve(page, { status: "new", messages: [first, ai, handoff] });
    await openHelp(page);
    await expect(page.getByText("With our team")).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveAttribute("placeholder", "Add something");
    await shot(page, "5a-handed-over");
  });

  test("a person replied: Waiting for your reply, with the New reply divider", async ({ page }) => {
    await serve(page, {
      status: "waiting_learner",
      unread: 1,
      messages: [
        first,
        ai,
        handoff,
        msg(
          4,
          "support",
          "Hi, thanks for writing. I can see the charge on our side and I'm looking into why Pro hasn't switched on. Could you tell me which sign-in you used (Apple, Google or email)?",
          at(10, 41),
        ),
      ],
    });
    await openHelp(page);
    await expect(page.getByText("Waiting for your reply")).toBeVisible();
    await expect(page.locator('[data-divider="new"]')).toHaveText("New reply");
    await expect(page.locator('[data-kind="support"]')).toContainText("Alphonso support");
    await expect(page.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      "Reply to Alphonso support",
    );
    await shot(page, "5b-staff-replied");
  });

  test("solved: green banner, the box stays open and says what writing does", async ({ page }) => {
    await serve(page, {
      status: "solved",
      messages: [
        msg(1, "you", "I got charged but Pro is not showing.", at(10, 2)),
        handoff,
        msg(4, "support", "Which sign-in did you use (Apple, Google or email)?", at(10, 41)),
        msg(5, "you", "Apple.", at(10, 50)),
        msg(
          6,
          "support",
          "Thanks. Pro is switched on now. Please close and reopen the app. If it still isn't there, write back here.",
          at(11, 12),
        ),
        msg(7, "system", "This chat was marked solved.", at(11, 12)),
      ],
    });
    await openHelp(page);
    await expect(page.locator('[data-banner="done"]')).toContainText("Solved");
    await expect(page.getByText(/Writing within 7 days reopens this chat/)).toBeVisible();
    await expect(page.getByRole("textbox")).toBeEnabled();
    await shot(page, "5c-solved");
  });

  test("reopened: the learner wrote after solved and the banner is back to With our team", async ({
    page,
  }) => {
    await serve(
      page,
      {
        status: "solved",
        messages: [
          msg(
            6,
            "support",
            "Thanks. Pro is switched on now. Please close and reopen the app. If it still isn't there, write back here.",
            at(11, 12, 3),
          ),
          msg(7, "system", "This chat was marked solved.", at(11, 12, 3)),
        ],
      },
      {
        message: async (route, body) =>
          route.fulfill({
            json: {
              status: "open",
              messages: [
                msg(8, "you", body.text, new Date().toISOString()),
                msg(
                  9,
                  "system",
                  "This chat was reopened. A person will reply here.",
                  new Date().toISOString(),
                ),
              ],
            },
          }),
      },
    );
    await openHelp(page);
    await page.getByRole("textbox").fill("Pro is gone again after the update.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("With our team")).toBeVisible();
    await expect(page.getByText("This chat was reopened. A person will reply here.")).toBeVisible();
    await shot(page, "5d-reopened");
  });

  test("Talk to a person hands the chat over", async ({ page }) => {
    await serve(page, {
      status: "ai",
      aiAvailable: true,
      messages: [msg(1, "you", "hello", at(9, 0)), msg(2, "ai", "Hi, how can I help?", at(9, 0))],
    });
    await openHelp(page);
    await page.getByRole("button", { name: "Talk to a person" }).click();
    await expect(page.getByText("With our team")).toBeVisible();
    await expect(page.getByText(HANDOFF)).toBeVisible();
  });

  test("a new reply shows up on its own while the chat is open (poll every 20 s)", async ({
    page,
  }) => {
    const convo: Convo = { status: "new", messages: [first, handoff] };
    await serve(page, convo);
    await page.clock.install();
    await openHelp(page);
    await expect(page.getByText("With our team")).toBeVisible();
    convo.status = "waiting_learner";
    convo.messages = [
      first,
      handoff,
      msg(4, "support", "Hello, which sign-in did you use?", at(10, 41)),
    ];
    await page.clock.fastForward(21_000);
    await expect(page.getByText("Hello, which sign-in did you use?")).toBeVisible();
    await expect(page.getByText("Waiting for your reply")).toBeVisible();
  });
});

test.describe("errors and limits", () => {
  const open = msg(1, "you", "Can you check my league points?", at(16, 50));

  test("support unreachable: the message is kept, Try again resends it once", async ({ page }) => {
    const seen: string[] = [];
    await serve(
      page,
      { status: "ai", aiAvailable: true, messages: [] },
      {
        message: async (route, body, n) => {
          seen.push(body.clientId);
          if (n === 1)
            return route.fulfill({
              status: 503,
              json: {
                error: "support-unreachable",
                message: "We couldn't reach support. Your message is saved. Try again in a moment.",
              },
            });
          return route.fulfill({
            json: {
              status: "new",
              messages: [
                msg(1, "you", body.text, at(14, 14)),
                msg(2, "system", HANDOFF, at(14, 14)),
              ],
            },
          });
        },
      },
    );
    await openHelp(page);
    await page.getByRole("textbox").fill("My streak reset even though I did a lesson yesterday.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/We couldn't reach support\. Your message is saved/)).toBeVisible();
    await expect(
      page.getByText("My streak reset even though I did a lesson yesterday."),
    ).toBeVisible();
    await shot(page, "6a-support-unreachable");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("With our team")).toBeVisible();
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
    await expect(
      page.getByText("My streak reset even though I did a lesson yesterday."),
    ).toHaveCount(1);
  });

  test("daily limit: the box closes with the reason and the sleepy pose", async ({ page }) => {
    await serve(
      page,
      { status: "new", messages: [open, msg(2, "system", HANDOFF, at(16, 50))] },
      {
        message: (route) =>
          route.fulfill({
            status: 429,
            json: {
              error: "support-message-limit",
              which: "daily",
              message: "You have reached today's limit of messages to Help. Try again tomorrow.",
            },
          }),
      },
    );
    await openHelp(page);
    await page.getByRole("textbox").fill("One more thing");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(
      page.getByText("You have reached today's limit of messages to Help. Try again tomorrow."),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toBeDisabled();
    await expect(page.getByText("Limit: 50 messages a day.")).toBeVisible();
    await expect(page.locator('[data-limit="daily"] img')).toBeVisible();
    await noSideScroll(page);
    await shot(page, "6b-daily-limit");
  });

  test("a full conversation: this chat is full", async ({ page }) => {
    await serve(
      page,
      { status: "new", messages: [msg(1, "you", "… (message 100 of this chat)", at(9, 2, 2))] },
      {
        message: (route) =>
          route.fulfill({
            status: 429,
            json: { error: "support-message-limit", which: "conversation", message: "x" },
          }),
      },
    );
    await openHelp(page);
    await page.getByRole("textbox").fill("more");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/This conversation has reached its message limit/)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveAttribute("placeholder", "This chat is full");
    await shot(page, "6c-conversation-full");
  });

  test("offline: banner, Send off, draft kept", async ({ page, context }) => {
    await serve(page, {
      status: "new",
      messages: [
        msg(1, "you", "Hi, I need help with my account.", at(17, 20)),
        msg(2, "system", HANDOFF, at(17, 20)),
      ],
    });
    await openHelp(page);
    await context.setOffline(true);
    await expect(page.getByText("You're offline")).toBeVisible();
    await page.getByRole("textbox").fill("Also, I changed my phone number and");
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
    await expect(page.getByText("Your draft is kept on this device.")).toBeVisible();
    await shot(page, "6d-offline");
    await context.setOffline(false);
    await expect(page.getByText("You're offline")).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveValue("Also, I changed my phone number and");
  });

  test("could not load: the message and Try again", async ({ page }) => {
    await serve(page, { status: "none" });
    let failing = true;
    await page.route("**/api/support/conversation", (route) => {
      if (failing)
        return route.fulfill({ status: 500, json: { error: "Could not load your messages." } });
      return route.fulfill({
        json: { status: "none", unread: 0, aiAvailable: false, messages: [] },
      });
    });
    await page.setViewportSize(PHONE);
    await page.goto("/help");
    await expect(page.getByText("Could not load your messages.")).toBeVisible();
    await shot(page, "6e-could-not-load");
    failing = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Write to us" })).toBeVisible();
  });
});

test.describe("accessibility", () => {
  const states: [string, Convo][] = [
    ["first open, AI on", { status: "none", aiAvailable: true }],
    ["first open, AI off", { status: "none", aiAvailable: false }],
    [
      "a person replied",
      {
        status: "waiting_learner",
        unread: 1,
        messages: [
          msg(1, "you", "I got charged but Pro is not showing.", at(10, 2)),
          msg(2, "system", HANDOFF, at(10, 2)),
          msg(3, "support", "Which sign-in did you use?", at(10, 41)),
        ],
      },
    ],
    [
      "an AI answer with a link",
      {
        status: "ai",
        aiAvailable: true,
        messages: [
          msg(1, "you", "Pro is missing", at(9, 41)),
          msg(2, "ai", "Tap Restore Purchases.", at(9, 41), "subscription"),
        ],
      },
    ],
  ];
  for (const [name, convo] of states) {
    test(`${name}: no serious or critical axe violations, buttons are 44 px`, async ({ page }) => {
      await serve(page, convo);
      await openHelp(page);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
      for (const b of await page.locator("[data-help-chat] button, [data-help-chat] a").all()) {
        const box = await b.boundingBox();
        if (box) expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(43.5);
      }
    });
  }
});
