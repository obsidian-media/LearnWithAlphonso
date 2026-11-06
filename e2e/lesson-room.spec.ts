import { expect, test, type Page } from "@playwright/test";
import { getCourse } from "../src/data/courses";
import type { Question } from "../src/data/curriculum";
import { VOCAB_IMAGES } from "../src/data/vocab-images";
import { LONG_PROMPT_CHARS, roomSrcForUnit } from "../src/lib/lesson-stage";
import { fakeLessonServer, signInAsFakeUser } from "./lesson-helpers";

/**
 * The round-6 lesson (the approved A+B mix): every kind of question stands in its unit's room, and on every phone
 * height the way on (Check) is on screen and no answer is lost under it. Needs no backend. Set LESSON_SHOTS_DIR to
 * also write the owner's sign-off screenshots of every lesson screen at phone width (393 x 852).
 */
const SHOTS = process.env.LESSON_SHOTS_DIR;

const units = getCourse("en").curriculum;
const lessons = units.flatMap((u) => u.lessons.map((l) => ({ unit: u.id, lesson: l })));
const opening = (match: (q: Question) => boolean) => {
  const hit = lessons.find(({ lesson }) => match(lesson.questions[0]));
  if (!hit) throw new Error("no lesson opens with this kind of question any more");
  return hit;
};
const CASES = {
  mc: opening(
    (q) =>
      q.type === "mc" &&
      !(q.imageKey && VOCAB_IMAGES[q.imageKey]) &&
      q.prompt.length <= LONG_PROMPT_CHARS &&
      q.choices.length >= 3,
  ),
  "mc-with-image": opening((q) => q.type === "mc" && !!q.imageKey && !!VOCAB_IMAGES[q.imageKey]),
  "long-question": opening((q) => q.type === "mc" && q.prompt.length > LONG_PROMPT_CHARS),
  fill: opening((q) => q.type === "fill"),
  listening: opening((q) => q.type === "listening"),
  speak: opening((q) => q.type === "speak"),
  translate: opening((q) => q.type === "translate"),
};
const VIEWPORTS = [
  { width: 393, height: 852 },
  { width: 375, height: 667 },
  { width: 360, height: 640 },
];

async function openFirstQuestion(page: Page, lessonId: string, prompt: string) {
  await page.goto(`/lesson/${lessonId}`);
  await page.getByRole("button", { name: "Start lesson" }).click();
  // Some lessons open straight on the questions; the rest show their word deck first.
  const heading = page.getByRole("heading", { level: 2, name: prompt });
  const toPractice = page
    .getByRole("button", { name: "Skip to practice" })
    .or(page.getByRole("button", { name: "Start practice" }));
  await expect(heading.or(toPractice)).toBeVisible();
  if (await toPractice.isVisible()) await toPractice.click();
  await expect(heading).toBeVisible();
}

for (const vp of VIEWPORTS) {
  for (const [name, { unit, lesson }] of Object.entries(CASES)) {
    test(`${name} at ${vp.width}x${vp.height}: in the unit's room, Check on screen, no answer under it`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await signInAsFakeUser(page);
      await fakeLessonServer(page);
      const q = lesson.questions[0];
      await openFirstQuestion(page, lesson.id, q.prompt);

      await expect(page.locator("[data-room]").first()).toHaveAttribute(
        "data-room",
        roomSrcForUnit(unit),
      );
      const check = page.getByRole("button", { name: "Check", exact: true });
      await expect(check).toBeInViewport();

      // The last answer can always be brought out from under the pinned Check bar.
      const last =
        q.type === "mc" || q.type === "listening"
          ? page.locator("[data-answers] button").last()
          : page.locator("[data-answers] input, [data-answers] textarea").last();
      await last.scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 2000);
      const lastBox = (await last.boundingBox())!;
      const checkBox = (await check.boundingBox())!;
      expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(checkBox.y);

      // On a full-size phone a plain question fits without scrolling.
      if (name === "mc" && vp.height >= 800) {
        const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        expect(scrollHeight).toBeLessThanOrEqual(vp.height);
      }
    });
  }
}

// ---------------------------------------------------------------- the owner's sign-off screenshots

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  // Let the sheet's slide and the expression crossfade settle.
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function answer(page: Page, q: Question, right: boolean) {
  if (q.type === "mc") {
    const choice = right ? q.choices[q.answer] : q.choices.find((_, i) => i !== q.answer)!;
    await page.locator("[data-answers] button").filter({ hasText: choice }).first().click();
  } else if (q.type === "listening") {
    const choice = right ? q.answer : q.choices.find((c) => c !== q.answer)!;
    await page.locator("[data-answers] button").filter({ hasText: choice }).first().click();
  } else if (q.type === "fill") {
    await page.getByPlaceholder("Type your answer").fill(right ? q.answer : "xyz");
  } else if (q.type === "translate") {
    await page.getByLabel("Your answer").fill(right ? q.acceptableAnswers[0] : "xyz");
  } else if (q.type === "speak") {
    await page.getByLabel("Type the phrase").fill(right ? q.answer : "xyz");
  } else if (q.type === "reorder") {
    const order = right ? q.answer.split(" ") : [...q.answer.split(" ")].reverse();
    for (const word of order) {
      await page
        .locator("[data-answers] > div > div:last-child button")
        .filter({ hasText: new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
        .first()
        .click();
    }
  }
}

/** Every question in the course: a missed answer can bring in a reinforcement from another lesson. */
const ALL_QUESTIONS = lessons.flatMap(({ lesson }) => lesson.questions);

async function currentQuestion(page: Page, own: Question[]): Promise<Question> {
  const heading = page.locator("[data-bubble] h2");
  await heading.waitFor();
  const prompt = (await heading.innerText()).trim();
  // Prompts repeat ("Which sentence did you hear?"), so a choice question is matched by its choices too.
  const shown = (await page.locator("[data-answers] button[aria-pressed]").allInnerTexts()).map(
    (t) => t.replace(/^\d+\s*/, "").trim(),
  );
  const fits = (q: Question) =>
    q.prompt === prompt &&
    (!("choices" in q) || shown.length === 0 || q.choices.every((c) => shown.includes(c)));
  const q = own.find(fits) ?? ALL_QUESTIONS.find(fits);
  if (!q) throw new Error(`no known question: ${prompt}`);
  return q;
}

test.describe("sign-off screenshots", () => {
  test.skip(!SHOTS, "set LESSON_SHOTS_DIR to write them");
  test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });

  test("the whole lesson: start, words, question, picked, right, wrong, complete", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signInAsFakeUser(page);
    await fakeLessonServer(page);
    const { lesson } = CASES.mc;
    await page.goto(`/lesson/${lesson.id}`);
    await page.getByRole("button", { name: "Start lesson" }).waitFor();
    await shot(page, "01-start");
    await page.getByRole("button", { name: "Start lesson" }).click();
    if (await page.locator("[data-vocab-card]").isVisible()) {
      await shot(page, "02-words");
      await page.getByRole("button", { name: "Skip to practice" }).click();
    }
    const q1 = await currentQuestion(page, lesson.questions);
    await shot(page, "03-question");
    await answer(page, q1, true);
    await shot(page, "04-picked");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await shot(page, "05-right");
    await page.getByRole("button", { name: /^(Continue|Got it|Finish)$/ }).click();
    const q2 = await currentQuestion(page, lesson.questions);
    await answer(page, q2, false);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await shot(page, "06-wrong");
    // Play the rest right, to the celebration.
    for (let i = 0; i < 40; i++) {
      if (await page.locator('[data-stage="complete"]').isVisible()) break;
      const next = page.getByRole("button", { name: /^(Continue|Got it|Finish)$/ });
      if (await next.isVisible()) {
        // The last Finish swaps the screen out while it is clicked; the next loop sees the celebration.
        await next.click({ timeout: 5_000 }).catch(() => {});
        continue;
      }
      if (await page.locator('[data-stage="complete"]').isVisible()) break;
      await answer(page, await currentQuestion(page, lesson.questions), true);
      await page.getByRole("button", { name: "Check", exact: true }).click();
    }
    await page.locator('[data-stage="complete"]').waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/07-complete-burst.png` });
    await page.waitForTimeout(2600);
    await shot(page, "08-complete");
    await page.screenshot({ path: `${SHOTS}/08b-complete-scrolled.png`, fullPage: true });
  });

  for (const [name, { lesson }] of Object.entries(CASES)) {
    if (name === "mc") continue;
    test(`question type: ${name}`, async ({ page }) => {
      await signInAsFakeUser(page);
      await fakeLessonServer(page);
      const q = lesson.questions[0];
      await openFirstQuestion(page, lesson.id, q.prompt);
      await shot(page, `q-${name}`);
      await answer(page, q, true);
      await shot(page, `q-${name}-answered`);
      await page.getByRole("button", { name: "Check", exact: true }).click();
      await shot(page, `q-${name}-verdict`);
    });
  }

  test("question type: reorder (sentence building)", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsFakeUser(page);
    await fakeLessonServer(page);
    const hit = lessons.find(({ lesson }) => lesson.questions.some((q) => q.type === "reorder"))!;
    await page.goto(`/lesson/${hit.lesson.id}`);
    await page.getByRole("button", { name: "Start lesson" }).click();
    const skip = page.getByRole("button", { name: "Skip to practice" });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    for (let i = 0; i < 30; i++) {
      const q = await currentQuestion(page, hit.lesson.questions);
      if (q.type === "reorder") {
        await shot(page, "q-reorder");
        const words = q.answer.split(" ");
        await answer(page, { ...q, answer: words.slice(0, 2).join(" ") }, true);
        await shot(page, "q-reorder-building");
        return;
      }
      await answer(page, q, true);
      await page.getByRole("button", { name: "Check", exact: true }).click();
      await page.getByRole("button", { name: /^(Continue|Got it|Finish)$/ }).click();
    }
    throw new Error("never reached the reorder question");
  });

  test("small phone (360 x 640) and the Meadow palette", async ({ page }) => {
    await signInAsFakeUser(page);
    await fakeLessonServer(page);
    const { lesson } = CASES.mc;
    const q = lesson.questions[0];
    await page.setViewportSize({ width: 360, height: 640 });
    await openFirstQuestion(page, lesson.id, q.prompt);
    await answer(page, q, true);
    await shot(page, "small-phone-picked");
    await page.addInitScript(() => localStorage.setItem("palette", "meadow"));
    await page.setViewportSize({ width: 393, height: 852 });
    await openFirstQuestion(page, lesson.id, q.prompt);
    await answer(page, q, true);
    await shot(page, "meadow-picked");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await shot(page, "meadow-right");
  });
});
