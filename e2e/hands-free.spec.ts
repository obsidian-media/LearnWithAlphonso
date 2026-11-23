import { expect, test, type Page } from "@playwright/test";
import { fakeServerFns, signInAsFakeUser } from "./lesson-helpers";

/**
 * Hands-free on the call screens (Practice and Hector) at phone width with no backend. The microphone is Chromium's
 * fake device; the loudness the loop reads is set from the test (`window.__rms`), so Listening, Hearing and the
 * pauses are exact. This is not a real microphone in a real room: that stays an owner device check.
 *
 * Set HANDS_FREE_SHOTS_DIR to also write each state in Royal light, Royal night and Meadow (light).
 */
const SHOTS = process.env.HANDS_FREE_SHOTS_DIR;
const PHONE = { width: 393, height: 852 };

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

async function setup(page: Page) {
  await page.setViewportSize(PHONE);
  await signInAsFakeUser(page);
  await fakeServerFns(page, {
    getMyProfile: { display_name: "Sam Rivera" },
    getAiConsent: { grantedAt: "2026-11-01T00:00:00Z" },
    getNameStatus: { displayName: "Sam Rivera", needsPrompt: false, prefill: "" },
    fetchProgress: { cefrLevel: "B1" },
  });
  // No voice: the tutor's line is text only, so the call is idle and the mic may open.
  await page.route("**/api/tts", (route) => route.fulfill({ status: 503, json: { error: "off" } }));
  await page.route("**/api/pro-status", (route) =>
    route.fulfill({
      json: { pro: true, store: "web", trialEligible: false, manageUrl: null },
    }),
  );
  await page.addInitScript(() => {
    // The loop reads the loudness from this analyser; the test sets it.
    (window as unknown as { __rms: number }).__rms = 0.001;
    class FakeAnalyser {
      fftSize = 2048;
      getFloatTimeDomainData(out: Float32Array) {
        out.fill((window as unknown as { __rms: number }).__rms);
      }
    }
    class FakeContext {
      resume = async () => {};
      close = async () => {};
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      createAnalyser() {
        return new FakeAnalyser();
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
  });
}

const room = (page: Page, rms: number) =>
  page.evaluate((v) => ((window as unknown as { __rms: number }).__rms = v), rms);

/** One file per theme: Royal light, Royal night, Meadow (light). */
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.evaluate(() => {
    delete document.documentElement.dataset.dsMode;
    delete document.documentElement.dataset.palette;
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/${name}-royal-light.png` });
  await page.evaluate(() => (document.documentElement.dataset.dsMode = "night"));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/${name}-royal-night.png` });
  await page.evaluate(() => {
    delete document.documentElement.dataset.dsMode;
    document.documentElement.dataset.palette = "meadow";
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/${name}-meadow-light.png` });
  await page.evaluate(() => delete document.documentElement.dataset.palette);
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function turnOn(page: Page, partner: string) {
  await page.getByRole("button", { name: "Show the conversation" }).click();
  const sw = page.getByRole("switch", { name: "Hands-free" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await shot(page, "01-sheet-switch-off");
  await sw.click();
  const note = page.getByRole("dialog", { name: "Talk without holding the button" });
  await expect(note).toContainText(`${partner} listens after each reply`);
  await expect(note).toContainText("Best with earbuds or a quiet room.");
  await shot(page, "02-first-use-note");
  await note.getByRole("button", { name: "Turn on hands-free" }).click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await shot(page, "03-sheet-switch-on");
  await page.getByRole("button", { name: "Back to call" }).click();
}

test("Practice: switch, first-use note, Listening, Hearing, Pause and Resume", async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.goto("/converse/coffee?mode=call");
  await expect(page.getByTestId("call-caption")).toBeVisible({ timeout: 30_000 });
  // Off at the start: the hold button, no status.
  await expect(page.getByRole("button", { name: "Hold to talk" })).toBeVisible();
  await expect(page.getByTestId("hands-free-status")).toHaveCount(0);

  await turnOn(page, "Alphonso");
  const status = page.getByTestId("hands-free-status");
  await expect(status).toHaveText("Listening. Just talk.", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Hold to talk" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await noSideScroll(page);
  await shot(page, "04-listening");

  await room(page, 0.1);
  await expect(status).toHaveText("Hearing you...", { timeout: 5_000 });
  await shot(page, "05-hearing");
  await room(page, 0.001);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(status).toHaveText("Hands-free is paused.");
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await shot(page, "06-paused");

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(status).toHaveText("Listening. Just talk.", { timeout: 15_000 });
});

test("Hector: the same switch, Pause button and pill", async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.goto("/hector");
  await expect(page.getByTestId("call-caption")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Hold to talk" })).toBeVisible();
  await turnOn(page, "Hector");
  const status = page.getByTestId("hands-free-status");
  await expect(status).toHaveText("Listening. Just talk.", { timeout: 15_000 });
  await noSideScroll(page);
  await shot(page, "07-hector-listening");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(status).toHaveText("Hands-free is paused.");
  await shot(page, "08-hector-paused");
});

test("Hector: the hands-free chip is on the call screen itself, no sheet needed", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.goto("/hector");
  await expect(page.getByTestId("call-caption")).toBeVisible({ timeout: 30_000 });
  const chip = page.getByTestId("hands-free-chip");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText("Hands-free: Off");
  await noSideScroll(page);
  // The first press shows the once-per-device safety note; confirming turns it on.
  await chip.click();
  const note = page.getByRole("dialog", { name: "Talk without holding the button" });
  await expect(note).toContainText("Hector listens after each reply");
  await note.getByRole("button", { name: "Turn on hands-free" }).click();
  await expect(chip).toHaveText("Hands-free: On");
  await expect(page.getByTestId("hands-free-status")).toHaveText("Listening. Just talk.", {
    timeout: 15_000,
  });
});

test("Hector: once the safety note was confirmed on this device, a new call starts hands-free", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.addInitScript(() => window.localStorage.setItem("handsFree.safetyNoteSeen.v2", "1"));
  await page.goto("/hector");
  await expect(page.getByTestId("hands-free-chip")).toHaveText("Hands-free: On", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("hands-free-status")).toHaveText("Listening. Just talk.", {
    timeout: 20_000,
  });
});
