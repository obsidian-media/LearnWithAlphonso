import { describe, expect, it, vi } from "vitest";
import {
  drawShareCard,
  shareCardLines,
  shareOrDownload,
  SHARE_CARD_APP_NAME,
  type ShareCardData,
} from "./share-card";

const data: ShareCardData = {
  name: "Sam",
  courseLabel: "Spanish",
  level: "B1",
  streak: 12,
  minutesSpoken: 46,
  xpThisWeek: 340,
  weekDone: [true, true, false, true, true, false, false],
};

const palette = {
  heroA: "rgb(1,2,3)",
  heroB: "rgb(4,5,6)",
  onHero: "rgb(7,8,9)",
  onHeroSoft: "rgb(1,1,1)",
  kick: "rgb(2,2,2)",
  action: "rgb(3,3,3)",
  displayFont: "Display",
  bodyFont: "Body",
};

/** A canvas context that records what is written on it. */
function fakeCtx() {
  const texts: string[] = [];
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === "fillText") return (t: string) => texts.push(String(t));
      if (prop === "measureText") return (t: string) => ({ width: String(t).length * 10 });
      if (prop === "createLinearGradient") return () => ({ addColorStop: () => {} });
      return () => {};
    },
    set: () => true,
  };
  return { ctx: new Proxy({}, handler) as CanvasRenderingContext2D, texts };
}

describe("the share card", () => {
  it("is drawn from the learner's real numbers and carries the app name", () => {
    const { ctx, texts } = fakeCtx();
    drawShareCard(ctx, data, palette, null);
    const all = texts.join(" | ");
    expect(all).toContain("12");
    expect(all).toContain("46");
    expect(all).toContain("340");
    expect(all).toContain("Sam");
    expect(all).toContain("Spanish B1");
    expect(all).toContain(SHARE_CARD_APP_NAME);
  });

  it("changes when the numbers change (nothing on it is fixed)", () => {
    const a = shareCardLines(data).join("|");
    const b = shareCardLines({ ...data, streak: 3, minutesSpoken: 0, xpThisWeek: 15 }).join("|");
    expect(b).toContain("3");
    expect(b).not.toContain("46");
    expect(a).not.toBe(b);
  });

  it("is an image only: no link, referral or invite code anywhere on it", () => {
    const { ctx, texts } = fakeCtx();
    drawShareCard(ctx, data, palette, null);
    for (const t of texts) {
      expect(t).not.toMatch(/https?:|www\.|\.app\b|\.com\b|invite|referral|code/i);
    }
  });

  it("singular and plural read right", () => {
    const lines = shareCardLines({ ...data, streak: 1, minutesSpoken: 1 }).join("|");
    expect(lines).toContain("day streak");
    expect(lines).toContain("minute spoken");
    expect(lines).not.toContain("minutes spoken");
  });
});

describe("sharing", () => {
  const blob = new Blob(["x"], { type: "image/png" });

  it("uses the Web Share API with the image file when the browser can share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = { share, canShare: () => true };
    const out = await shareOrDownload(blob, "my-week.png", nav, () => {});
    expect(out).toBe("shared");
    const arg = share.mock.calls[0]![0] as { files: File[]; url?: string };
    expect(arg.files[0]!.name).toBe("my-week.png");
    expect(arg.url).toBeUndefined();
  });

  it("downloads the image when files cannot be shared", async () => {
    const download = vi.fn();
    const out = await shareOrDownload(blob, "my-week.png", { canShare: () => false }, download);
    expect(out).toBe("downloaded");
    expect(download).toHaveBeenCalledWith(blob, "my-week.png");
  });

  it("a cancelled share is not an error and does not download", async () => {
    const download = vi.fn();
    const abort = Object.assign(new Error("cancel"), { name: "AbortError" });
    const nav = { share: vi.fn().mockRejectedValue(abort), canShare: () => true };
    expect(await shareOrDownload(blob, "w.png", nav, download)).toBe("cancelled");
    expect(download).not.toHaveBeenCalled();
  });
});
