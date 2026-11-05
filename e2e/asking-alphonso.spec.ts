import { expect, test, type Page } from "@playwright/test";
import { getCourse } from "../src/data/courses";
import { VOCAB_IMAGES } from "../src/data/vocab-images";
import { ASK_LONG_PROMPT_CHARS } from "../src/lib/asking-alphonso";

/**
 * Alphonso asks the question: on every phone height, in every shape of question card, the last answer option must
 * end above the Check button, so the portrait never pushes the answers under the bar. (The page is a column and
 * Check sits at its foot, so an overlap would mean the options overflowed their container.)
 *
 * Needs no backend: the lesson content is bundled, and the one thing the signed-in shell asks the network for (who
 * is signed in) is answered here with a fake user. Set ASK_SHOTS_DIR to also write a screenshot of each case.
 */
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://placeholder.supabase.co";
const SHOTS = process.env.ASK_SHOTS_DIR;

type Q = {
  type: string;
  prompt: string;
  imageKey?: string;
  audioText?: string;
  choices?: string[];
};
const firstQuestions = getCourse("en").curriculum.flatMap((u) =>
  u.lessons.map((l) => ({ id: l.id, q: l.questions[0] as Q })),
);
const pick = (match: (q: Q) => boolean) => {
  const hit = firstQuestions.find((f) => match(f.q));
  if (!hit) throw new Error("no lesson opens with this kind of question any more");
  return hit;
};
const CASES = {
  mc: pick(
    (q) =>
      q.type === "mc" &&
      !q.audioText &&
      !(q.imageKey && VOCAB_IMAGES[q.imageKey]) &&
      q.prompt.length <= ASK_LONG_PROMPT_CHARS &&
      (q.choices?.length ?? 0) >= 3,
  ),
  "mc-with-image": pick((q) => q.type === "mc" && !!q.imageKey && !!VOCAB_IMAGES[q.imageKey]),
  listening: pick((q) => q.type === "listening"),
  "long-prompt": pick(
    (q) => q.type === "mc" && q.prompt.length > ASK_LONG_PROMPT_CHARS && !q.audioText,
  ),
};
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 375, height: 550 },
];

async function signInAsFakeUser(page: Page) {
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "layout@example.test",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = 4_000_000_000;
  const session = {
    access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, role: "authenticated", exp })}.x`,
    refresh_token: "layout-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user,
  };
  const key = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await page.addInitScript(
    ([k, v]) => {
      localStorage.setItem(k, v);
      // Answer the cookie banner before the app starts, so it never sits over the Check bar.
      localStorage.setItem("lingua.cookie-consent.v1", "essential");
    },
    [key, JSON.stringify(session)],
  );
  await page.route(`${new URL(SUPABASE_URL).origin}/**`, (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/user")) return route.fulfill({ json: user });
    return route.fulfill({ status: 200, json: [] });
  });
}

for (const vp of VIEWPORTS) {
  for (const [name, { id, q }] of Object.entries(CASES)) {
    test(`${name} at ${vp.width}x${vp.height}: the last option ends above the Check bar`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await signInAsFakeUser(page);
      await page.goto(`/lesson/${id}`);
      await page.getByRole("button", { name: "Begin lesson" }).click();
      // Some lessons open straight on the questions; the rest show their word deck first.
      const prompt = page.getByRole("heading", { level: 2, name: q.prompt });
      const toPractice = page
        .getByRole("button", { name: "Skip to practice" })
        .or(page.getByRole("button", { name: "Start practice" }));
      await expect(prompt.or(toPractice)).toBeVisible();
      if (await toPractice.isVisible()) await toPractice.click();

      await expect(prompt).toBeVisible();
      const check = page.getByRole("button", { name: "Check", exact: true });
      await expect(check).toBeVisible();

      const lastChoice = q.choices?.at(-1);
      const lastOption = lastChoice
        ? page.getByRole("button").filter({ hasText: lastChoice }).last()
        : page.locator("input").last();
      const optionBox = (await lastOption.boundingBox())!;
      const checkBox = (await check.boundingBox())!;
      expect(optionBox.y + optionBox.height).toBeLessThanOrEqual(checkBox.y);

      // The Check bar stays on screen without scrolling wherever the content itself fits: a plain question on any
      // phone, and every shape of card on a tall one. (An image or a long prompt adds its own height on a short one.)
      if (name === "mc" || vp.height >= 800) {
        const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        expect(scrollHeight).toBeLessThanOrEqual(vp.height);
      }

      // At most one portrait is on the page, and it is gone on the shortest screen.
      const portraits = await page.locator("[data-ask-mascot]").count();
      expect(portraits).toBeLessThanOrEqual(1);
      if (vp.height < 600) expect(portraits).toBe(0);
      // A long prompt on a card with an image, audio or listening button never gets the large figure.
      if (portraits === 1 && name !== "mc") {
        expect(await page.locator("[data-ask-mascot]").getAttribute("data-ask-size")).toBe("56");
      }

      if (SHOTS) {
        await page.screenshot({
          path: `${SHOTS}/v2-${name}-${vp.width}x${vp.height}.png`,
          fullPage: true,
        });
      }
    });
  }
}
