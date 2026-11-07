/**
 * Profile's "Share your week" card (BACKLOG 0.0-bi): a picture of the learner's real week, drawn on a canvas in the
 * browser. Nothing is uploaded or stored. It is an image only, by the owner's decision: no link, no referral code,
 * just the app's name.
 */

export const SHARE_CARD_APP_NAME = "Learn with Alphonso";
export const SHARE_CARD_SIZE = { width: 1080, height: 1350 } as const;
const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export type ShareCardData = {
  name: string;
  courseLabel: string;
  level: string;
  streak: number;
  minutesSpoken: number;
  xpThisWeek: number;
  /** Monday to Sunday: a day that earned XP. */
  weekDone: boolean[];
};

/** Colours and fonts, read from the design tokens at draw time (a canvas cannot read CSS variables itself). */
export type ShareCardPalette = {
  heroA: string;
  heroB: string;
  onHero: string;
  onHeroSoft: string;
  kick: string;
  action: string;
  displayFont: string;
  bodyFont: string;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The stat rows, as [number, label]. */
export function shareCardStats(d: ShareCardData): [string, string][] {
  return [
    [d.streak.toLocaleString("en-US"), plural(d.streak, "day streak", "day streak")],
    [
      d.minutesSpoken.toLocaleString("en-US"),
      plural(d.minutesSpoken, "minute spoken", "minutes spoken"),
    ],
    [d.xpThisWeek.toLocaleString("en-US"), "XP this week"],
  ];
}

/** Every line of text on the card, in drawing order. */
export function shareCardLines(d: ShareCardData): string[] {
  return [
    SHARE_CARD_APP_NAME,
    `${d.name}'s week`,
    `${d.courseLabel} ${d.level}`,
    ...shareCardStats(d).flat(),
  ];
}

export function drawShareCard(
  ctx: CanvasRenderingContext2D,
  d: ShareCardData,
  p: ShareCardPalette,
  mascot: CanvasImageSource | null,
): void {
  const { width: W, height: H } = SHARE_CARD_SIZE;
  const pad = 88;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, p.heroA);
  bg.addColorStop(1, p.heroB);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (mascot) ctx.drawImage(mascot, W - 560, H - 620, 620, 620);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = p.onHeroSoft;
  ctx.font = `700 34px ${p.bodyFont}`;
  ctx.fillText(SHARE_CARD_APP_NAME, pad, pad + 30);

  ctx.fillStyle = p.onHero;
  ctx.font = `800 96px ${p.displayFont}`;
  ctx.fillText(`${d.name}'s week`, pad, 270, W - pad * 2);
  ctx.fillStyle = p.kick;
  ctx.font = `700 40px ${p.bodyFont}`;
  ctx.fillText(`${d.courseLabel} ${d.level}`, pad, 336);

  // The week: a filled ring for a day that counted toward the streak.
  const ringY = 450;
  const gap = (W - pad * 2) / 7;
  d.weekDone.forEach((done, i) => {
    const x = pad + gap * i + gap / 2;
    ctx.beginPath();
    ctx.arc(x, ringY, 40, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = done ? p.action : p.onHeroSoft;
    ctx.globalAlpha = done ? 1 : 0.35;
    ctx.stroke();
    if (done) {
      ctx.fillStyle = p.action;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.onHeroSoft;
    ctx.font = `700 28px ${p.bodyFont}`;
    ctx.textAlign = "center";
    ctx.fillText(WEEKDAY_LETTERS[i]!, x, ringY + 86);
    ctx.textAlign = "left";
  });

  let y = 720;
  for (const [n, label] of shareCardStats(d)) {
    ctx.fillStyle = p.onHero;
    ctx.font = `800 132px ${p.displayFont}`;
    ctx.fillText(n, pad, y);
    const w = ctx.measureText(n).width;
    ctx.fillStyle = p.onHeroSoft;
    ctx.font = `700 40px ${p.bodyFont}`;
    ctx.fillText(label, pad + w + 24, y);
    y += 190;
  }
}

type ShareNav = {
  share?: (data: { files: File[]; title?: string }) => Promise<void>;
  canShare?: (data: { files: File[] }) => boolean;
};

/** Shares the image with the Web Share API where the browser can share files, otherwise downloads it. */
export async function shareOrDownload(
  blob: Blob,
  filename: string,
  nav: ShareNav,
  download: (blob: Blob, filename: string) => void,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: SHARE_CARD_APP_NAME });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
    }
  }
  download(blob, filename);
  return "downloaded";
}

/** The browser's download: a temporary object URL on an anchor. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
