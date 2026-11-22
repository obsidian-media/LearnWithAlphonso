// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/components/HectorInvite", () => ({ HectorInvite: () => null }));
vi.mock("./SayThePicture", () => ({ SayThePicture: () => null }));
vi.mock("./SayItRight", () => ({ SayItRight: () => null }));

const { PracticeHub } = await import("./PracticeHub");
const { CAMPAIGNS } = await import("@/data/campaigns");
const { sceneRoom } = await import("@/lib/practice-catalog");

const DATA = {
  stars: [
    {
      kind: "scenario",
      itemKey: "airport",
      bestStars: 3,
      lastPlayedAt: "2026-11-02T10:00:00.000Z",
    },
  ],
  cefrLevel: "A2",
  weaknessEvents: [],
} as import("@/lib/practice-hub").PracticeHubData;

function hub(props: Partial<React.ComponentProps<typeof PracticeHub>> = {}) {
  return render(
    <PracticeHub course="fr" data={DATA} initialMode="call" onStart={() => {}} {...props} />,
  );
}

describe("Practice hub parity: carousel", () => {
  it("cards use the sheet radius, a 12px gap, and the reason pill has no border", () => {
    const { container } = hub();
    const card = container.querySelector("[data-hero-card]") as HTMLElement;
    expect(card.className).toContain("rounded-[var(--ds-radius-sheet)]");
    expect(card.className).not.toContain("26px");
    expect((container.querySelector("[data-hero-track]") as HTMLElement).className).toContain(
      "gap-3",
    );
    const pill = within(card).getByText(/scene at your level|Makes you use|Pick up/);
    expect(pill.className).toContain("bg-ds-on-hero/15");
    expect(pill.className).not.toMatch(/\bborder\b/);
    expect(pill.className).not.toContain("font-bold");
  });

  it("Call is 60px and Chat is a borderless bubble without backdrop blur", () => {
    const { container } = hub();
    const call = container.querySelector("[data-hero-call] > span") as HTMLElement;
    expect(call.className).toContain("size-[60px]");
    const chat = container.querySelector("[data-hero-chat] > span") as HTMLElement;
    expect(chat.className).not.toMatch(/border|backdrop/);
    expect(chat.querySelector("[data-glyph='bubble']")).not.toBeNull();
  });

  it("the active dot is w-5 and the scroll offset steps by card width plus the 12px gap", () => {
    const { container } = hub();
    const dot = container.querySelector("[data-hero-dot='0'] i") as HTMLElement;
    expect(dot.className).toContain("w-5");
    const track = container.querySelector("[data-hero-track]") as HTMLElement;
    const first = track.children[0] as HTMLElement;
    Object.defineProperty(first, "offsetWidth", { value: 300 });
    track.scrollLeft = 312;
    fireEvent.scroll(track);
    expect(container.querySelector("[data-hero-dot='1']")).toHaveAttribute("aria-current", "true");
  });

  it("loads as 'Loading Practice…' and shows an error with Try again that retries", () => {
    const { unmount } = hub({ data: null });
    expect(screen.getByText("Loading Practice…")).toBeInTheDocument();
    unmount();
    const onRetry = vi.fn();
    hub({ data: null, error: true, onRetry });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load Practice.");
    expect(document.querySelector("[data-hero-loading]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("Practice hub parity: header", () => {
  it("puts the French gloss on its own line", () => {
    const { container } = hub();
    const gloss = container.querySelector("[data-greeting-gloss]") as HTMLElement;
    expect(gloss).toHaveTextContent("Shall we practice a bit today?");
    expect(gloss.tagName).toBe("P");
    expect(container.querySelector("header")!.querySelectorAll("p").length).toBe(2);
  });

  it("the star tally is an xp-tint capsule with no border", () => {
    const { container } = hub();
    const t = container.querySelector("[data-star-tally]") as HTMLElement;
    expect(t.className).toContain("bg-ds-xp-tint");
    expect(t.className).toContain("text-ds-xp-text");
    expect(t.className).not.toMatch(/\bborder/);
  });
});

describe("Practice hub parity: conversations and campaigns", () => {
  it("level chips are one horizontal scroll row: choice-tint when selected, card otherwise, no borders", () => {
    const { container } = hub();
    const row = container.querySelector("[data-level-row]") as HTMLElement;
    expect(row.className).toContain("overflow-x-auto");
    expect(row.className).not.toContain("flex-wrap");
    const all = within(row).getByRole("button", { name: "All" });
    const adv = within(row).getByRole("button", { name: "Advanced" });
    expect(all.className).toContain("bg-ds-choice-tint");
    expect(all.className).toContain("text-ds-ink");
    expect(adv.className).toContain("bg-ds-card");
    for (const b of [all, adv]) {
      expect(b.className).not.toMatch(/\bborder/);
      expect(b.className).toContain("shrink-0");
    }
    fireEvent.click(adv);
    expect(adv.className).toContain("bg-ds-choice-tint");
    expect(all.className).toContain("bg-ds-card");
  });

  it("tiles carry the level as an overline above the title, with Mastered only top-right", () => {
    const { container } = hub();
    const tile = container.querySelector("[data-scenario-tile='airport']") as HTMLElement;
    const level = tile.querySelector("[data-tile-level]") as HTMLElement;
    expect(level.className).toContain("ds-type-overline");
    const title = tile.querySelector("[lang]") as HTMLElement;
    expect(level.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tile.querySelector(".left-2.top-2")).toBeNull();
    expect(tile.querySelector("[data-mastered]")!.className).toContain("right-2");
    expect(tile.className).toContain("rounded-[var(--ds-radius-control)]");
    // Grows with large text instead of clipping: a minimum height, not a fixed one.
    expect(tile.className).toContain("min-h-[144px]");
    expect(tile.className).not.toMatch(/(^|\s)h-\[/);
  });

  it("has one 'Campaigns · N stories' heading and 144px rail cards that use the first scene's room", () => {
    const { container } = hub();
    expect(screen.getByRole("heading", { name: `Campaigns · ${CAMPAIGNS.length} stories` })).toBe(
      document.getElementById("campaigns"),
    );
    for (const c of CAMPAIGNS) {
      const card = container.querySelector(`[data-campaign-card='${c.id}']`) as HTMLElement;
      expect(card.className).toContain("h-[144px]");
      expect(card.style.backgroundImage).toContain(sceneRoom(c.id, c.scenes[0].id));
    }
  });

  it("the horizontal rails scroll inside themselves, so nothing pushes the page wider than 320px", () => {
    const { container } = hub();
    for (const sel of ["[data-hero-track]", "[data-campaign-rail]", "[data-level-row]"]) {
      expect((container.querySelector(sel) as HTMLElement).className).toContain("overflow-x-auto");
    }
    for (const card of container.querySelectorAll("[data-hero-card]"))
      expect((card as HTMLElement).className).toContain("basis-[86%]");
    expect((container.querySelector("[data-practice-hub]") as HTMLElement).className).not.toMatch(
      /\bw-\[\d+px\]|min-w-\[/,
    );
  });
});

describe("Practice hub parity: quick practice", () => {
  it("uses the iPhone's strings verbatim", () => {
    hub();
    expect(
      screen.getByText(
        "See a picture and say the word. A miss shows you the word and how it sounds.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Hear a word you have learned, say it, and find out how clearly you were understood. A miss teaches, it never punishes.",
      ),
    ).toBeInTheDocument();
  });

  it("cards have a uniform border-2 with no bottom lip, real art on both, and a plain Start pill", () => {
    const { container } = hub();
    for (const sel of ["[data-say-the-picture-card]", "[data-say-it-right-card]"]) {
      const card = container.querySelector(sel) as HTMLElement;
      expect(card.className).toContain("border-2");
      expect(card.className).not.toContain("border-b-4");
      const start = within(card).getByText("Start");
      expect(start.className).toContain("bg-ds-choice");
      expect(start.className).toContain("text-ds-on-choice");
      expect(start.className).not.toMatch(/shadow/);
      expect(start.querySelector("svg")).toBeNull();
    }
    // Say the picture: two real vocab photos in frames and a mic badge (owner pick 4.1).
    const picture = container.querySelector("[data-say-the-picture-card]") as HTMLElement;
    const art = picture.querySelector("[data-say-picture-art]") as HTMLElement;
    expect(art.className).toContain("bg-ds-choice-tint");
    expect(Array.from(art.querySelectorAll("img")).map((i) => i.getAttribute("src"))).toEqual([
      "/figures/practice-say-the-picture-train.jpg",
      "/figures/practice-say-the-picture-coffee.jpg",
      "/icons3d/studio_microphone.png",
    ]);
    expect(art.querySelector("[data-mic-badge]")).not.toBeNull();
    // Say it right: Alphonso listening and a score badge in the right tokens (owner pick 4.2).
    const right = container.querySelector("[data-say-it-right-card]") as HTMLElement;
    const rightArt = right.querySelector("[data-say-right-art]") as HTMLElement;
    expect(rightArt.className).toContain("bg-ds-right-tint");
    expect(rightArt.querySelector("img")).toHaveAttribute(
      "src",
      "/figures/alphonso-listening-headphones.webp",
    );
    const badge = rightArt.querySelector("[data-score-badge]") as HTMLElement;
    expect(badge.className).toContain("bg-ds-right");
    expect(badge.className).toContain("text-ds-on-right");
    expect(right.querySelector("[data-glyph='waveform']")).toBeNull();
  });
});
