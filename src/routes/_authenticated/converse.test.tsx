// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// The pre-call sheet checks the network before it starts a call; the check settles on the next tick.
beforeEach(() => {
  vi.stubGlobal("fetch", async () => new Response(""));
});
const settle = () => new Promise((r) => setTimeout(r, 0));
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/components/HectorInvite", () => ({
  HectorInvite: ({ source, look }: { source: string; look?: string }) => (
    <div data-testid="hector-invite" data-source={source} data-look={look} />
  ),
}));

vi.mock("../../components/practice/SayThePicture", () => ({
  SayThePicture: () => <div data-testid="say-the-picture" />,
}));
vi.mock("../../components/practice/SayItRight", () => ({
  SayItRight: () => <div data-testid="say-it-right" />,
}));

const { PracticeHub } = await import("../../components/practice/PracticeHub");
const { SCENARIOS, scenariosFor } = await import("../../data/scenarios");
const { CAMPAIGNS, campaignsFor } = await import("../../data/campaigns");
const { maxStarsInCourse, sceneKey, personaOf } = await import("../../lib/practice-catalog");
const { STAR_RULE } = await import("../../lib/practice-stars");
type HubData = import("../../lib/practice-hub").PracticeHubData;

const NEW_LEARNER: HubData = { stars: [], cefrLevel: "A2", weaknessEvents: [] };
const PLAYED: HubData = {
  cefrLevel: "B1",
  weaknessEvents: [
    { category: "past-tense", eventType: "detected", createdAt: "2026-11-01T10:00:00.000Z" },
  ],
  stars: [
    { kind: "scenario", itemKey: "coffee", bestStars: 2, lastPlayedAt: "2026-11-02T10:00:00.000Z" },
    {
      kind: "scenario",
      itemKey: "airport",
      bestStars: 3,
      lastPlayedAt: "2026-11-02T10:00:00.000Z",
    },
    {
      kind: "scene",
      itemKey: "doctors-visit/doctor-book-phone",
      bestStars: 3,
      lastPlayedAt: "2026-11-05T10:00:00.000Z",
    },
  ],
};

function hub(data: HubData | null, course: "en" | "fr" | "es" = "es") {
  const onStart = vi.fn();
  const utils = render(
    <PracticeHub course={course} data={data} initialMode="call" onStart={onStart} />,
  );
  return { ...utils, onStart };
}

describe("Practice hub: a new learner", () => {
  it("counts zero stars out of the catalog's total", async () => {
    const { container } = hub(NEW_LEARNER);
    const tallies = container.querySelectorAll("[data-star-tally]");
    expect(tallies.length).toBe(1);
    for (const t of tallies)
      expect(t).toHaveAccessibleName(`0 of ${maxStarsInCourse()} stars earned`);
  });
  it("has nothing to continue", async () => {
    hub(NEW_LEARNER);
    expect(document.querySelector("[data-continue]")).toBeNull();
  });
  it("still gets a pick at their level, without claiming a weak spot", async () => {
    const { container } = hub(NEW_LEARNER);
    const pick = container.querySelector("[data-todays-pick]") as HTMLElement;
    const s = SCENARIOS.find((x) => x.id === pick.dataset.todaysPick)!;
    expect(s.level).toBe("Beginner");
    expect(pick).toHaveTextContent("Beginner scene at your level");
    expect(pick).not.toHaveTextContent("your top weak spot");
  });
  it("shows every campaign and every scenario in the course language, with no stars", async () => {
    const { container } = hub(NEW_LEARNER);
    for (const c of campaignsFor("es"))
      expect(screen.getAllByText(c.title).length).toBeGreaterThan(0);
    const tiles = container.querySelectorAll("[data-scenario-tile]");
    expect(tiles.length).toBe(SCENARIOS.length);
    for (const t of tiles)
      expect(t.querySelector("[data-stars]")).toHaveAttribute("data-stars", "0");
    expect(screen.getByText(`Campaigns · ${CAMPAIGNS.length} stories`)).toBeInTheDocument();
  });
  it("offers Hector with his own card (practice_hector_card)", async () => {
    hub(NEW_LEARNER);
    const card = screen.getByTestId("hector-invite");
    expect(card).toHaveAttribute("data-source", "practice_hector_card");
    expect(card).toHaveAttribute("data-look", "hub");
  });
  it("greets in the course language with an English gloss", async () => {
    hub(NEW_LEARNER, "es");
    expect(screen.getByText("¿Practicamos un poco hoy?")).toHaveAttribute("lang", "es");
    expect(screen.getByText("Shall we practice a bit today?")).toBeInTheDocument();
  });
});

describe("Practice hub: a learner with stars and a campaign in progress", () => {
  it("adds up the stars held", async () => {
    const { container } = hub(PLAYED);
    expect(container.querySelector("[data-star-tally]")).toHaveAccessibleName(
      `8 of ${maxStarsInCourse()} stars earned`,
    );
  });
  it("shows each scenario's best stars on its tile and each scene's under its room", async () => {
    const { container } = hub(PLAYED);
    expect(container.querySelector('[data-scenario-tile="coffee"] [data-stars]')).toHaveAttribute(
      "data-stars",
      "2",
    );
    expect(container.querySelector('[data-scenario-tile="airport"] [data-stars]')).toHaveAttribute(
      "data-stars",
      "3",
    );
  });
  it("Continue resumes the campaign at its first scene without stars", async () => {
    const { container, onStart } = hub(PLAYED);
    const card = container.querySelector("[data-continue]") as HTMLElement;
    expect(card.dataset.continue).toBe("doctors-visit:1");
    const doctor = campaignsFor("es").find((c) => c.id === "doctors-visit")!;
    expect(card).toHaveTextContent(`Scene 2 of ${doctor.scenes.length}`);
    fireEvent.click(within(card).getByRole("button", { name: /^Call Alphonso/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(doctor.scenes[1].opener);
    fireEvent.click(within(dialog).getByRole("button", { name: /Start the call/ }));
    await settle();
    expect(onStart).toHaveBeenCalledWith({
      kind: "scene",
      campaignId: "doctors-visit",
      sceneIndex: 1,
      mode: "call",
    });
  });
  it("Today's pick names the learner's real top weak spot, at their level", async () => {
    const { container } = hub(PLAYED);
    const pick = container.querySelector("[data-todays-pick]") as HTMLElement;
    expect(pick).toHaveTextContent("Makes you use the past tense, your top weak spot");
    expect(SCENARIOS.find((s) => s.id === pick.dataset.todaysPick)!.level).toBe("Intermediate");
  });
  it("while the rows load there is no counter and no pick, never a false zero", async () => {
    const { container } = hub(null);
    expect(container.querySelector("[data-star-tally]")).toBeNull();
    expect(container.querySelector("[data-todays-pick]")).toBeNull();
  });
});

describe("Practice hub: level chips", () => {
  it("filter the scenarios to one level and back to all", async () => {
    const { container } = hub(NEW_LEARNER);
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const shown = [...container.querySelectorAll<HTMLElement>("[data-scenario-tile]")].map(
      (t) => t.dataset.scenarioTile,
    );
    expect(shown).toEqual(SCENARIOS.filter((s) => s.level === "Advanced").map((s) => s.id));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(container.querySelectorAll("[data-scenario-tile]").length).toBe(SCENARIOS.length);
  });
  it("Advanced scenarios are open: their tiles open the pre-call sheet like any other", async () => {
    const { container } = hub(NEW_LEARNER);
    fireEvent.click(container.querySelector('[data-scenario-tile="negotiation"]')!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("the pre-call sheet", () => {
  it("shows the persona, the real opener and the star rule from the tuning constants", async () => {
    const { container } = hub(NEW_LEARNER);
    fireEvent.click(container.querySelector('[data-scenario-tile="coffee"]')!);
    const dialog = screen.getByRole("dialog");
    const es = scenariosFor("es").find((s) => s.id === "coffee")!;
    expect(dialog).toHaveAccessibleName(es.title);
    expect(dialog).toHaveTextContent(personaOf("scenario", "coffee", "es")!);
    expect(dialog.querySelector("[data-opener]")).toHaveTextContent(es.opener);
    expect(dialog).toHaveTextContent("Valeria starts the call:");
    expect(dialog).toHaveTextContent(`${STAR_RULE.twoStarMinRightPercent}% of your replies right`);
    expect(dialog).toHaveTextContent(`${STAR_RULE.threeStarMinWords}+ words`);
  });
  it("chooses call or chat, and starts the chosen one", async () => {
    const { container, onStart } = hub(NEW_LEARNER);
    fireEvent.click(container.querySelector('[data-scenario-tile="hotel"]')!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Call (speak)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(within(dialog).getByRole("radio", { name: "Chat (type)" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Start the chat/ }));
    await settle();
    expect(onStart).toHaveBeenCalledWith({ kind: "scenario", scenarioId: "hotel", mode: "chat" });
  });
  it("offline, Start shows an in-app offline state with Retry instead of navigating, and Retry starts once back online", async () => {
    const { container, onStart } = hub(NEW_LEARNER);
    fireEvent.click(container.querySelector('[data-scenario-tile="hotel"]')!);
    const dialog = screen.getByRole("dialog");
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fireEvent.click(within(dialog).getByRole("button", { name: /Start the call/ }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Can’t reach the server");
    expect(onStart).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    await vi.waitFor(() =>
      expect(onStart).toHaveBeenCalledWith({ kind: "scenario", scenarioId: "hotel", mode: "call" }),
    );
    online.mockRestore();
  });
  it("a campaign card starts at its first scene without stars", async () => {
    const { container, onStart } = hub(PLAYED);
    fireEvent.click(container.querySelector('[data-campaign-card="doctors-visit"]')!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Start/ }));
    await settle();
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "doctors-visit", sceneIndex: 1 }),
    );
  });
  it("closes without starting", async () => {
    const { container, onStart } = hub(NEW_LEARNER);
    fireEvent.click(container.querySelector('[data-scenario-tile="hotel"]')!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onStart).not.toHaveBeenCalled();
  });
});

it("scene keys in the hub are the server's keys", async () => {
  expect(sceneKey("doctors-visit", "doctor-book-phone")).toBe(PLAYED.stars[2].itemKey);
});

describe("the call-card carousel", () => {
  it("is a labelled carousel of up to three slides, each announcing its scene, reason and both actions", async () => {
    const { container } = hub(NEW_LEARNER);
    const region = screen.getByRole("region", { name: "Calls picked for you" });
    expect(region).toHaveAttribute("aria-roledescription", "carousel");
    const slides = container.querySelectorAll<HTMLElement>("[data-hero-card]");
    expect(slides.length).toBe(3);
    slides.forEach((slide, i) => {
      expect(slide).toHaveAttribute("role", "group");
      expect(slide).toHaveAttribute("aria-roledescription", "slide");
      expect(slide.getAttribute("aria-label")).toMatch(new RegExp(`^${i + 1} of 3: `));
      expect(within(slide).getByRole("button", { name: /^Call Alphonso: / })).toBeInTheDocument();
      expect(
        within(slide).getByRole("button", { name: /^Chat with Alphonso: / }),
      ).toBeInTheDocument();
      expect(slide).toHaveTextContent("Alphonso is ready");
      expect(slide).toHaveTextContent("Beginner scene at your level");
    });
    // Three different scenarios.
    expect(new Set([...slides].map((s) => s.dataset.heroCard)).size).toBe(3);
  });
  it("the first slide is Today's pick; a learner with a campaign in progress gets Continue first", async () => {
    const { container } = hub(PLAYED);
    const slides = [...container.querySelectorAll<HTMLElement>("[data-hero-card]")];
    expect(slides.length).toBe(3);
    expect(slides[0].dataset.continue).toBe("doctors-visit:1");
    expect(slides[0]).toHaveTextContent("Pick up where you left off");
    expect(slides[1].dataset.todaysPick).toBeTruthy();
    expect(slides[2].dataset.todaysPick).toBeUndefined();
    expect(slides[2]).toHaveTextContent("Also for you");
  });
  it("has page dots that work without swiping, and the current one is marked", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container } = hub(NEW_LEARNER);
    const dots = within(screen.getByRole("group", { name: "Choose a call" })).getAllByRole(
      "button",
    );
    expect(dots.map((d) => d.getAttribute("aria-label"))).toEqual([
      "Show call 1 of 3",
      "Show call 2 of 3",
      "Show call 3 of 3",
    ]);
    expect(dots[0]).toHaveAttribute("aria-current", "true");
    fireEvent.click(dots[2]);
    expect(dots[2]).toHaveAttribute("aria-current", "true");
    expect(dots[0]).not.toHaveAttribute("aria-current");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(
      container.querySelector("[data-hero-track]")!.children[2],
    );
  });
  it("never moves by itself", async () => {
    vi.useFakeTimers();
    try {
      hub(NEW_LEARNER);
      const first = screen.getByRole("button", { name: "Show call 1 of 3" });
      vi.advanceTimersByTime(60_000);
      expect(first).toHaveAttribute("aria-current", "true");
    } finally {
      vi.useRealTimers();
    }
  });
  it("Call opens the pre-call sheet on the call choice, with the star rules, and starts the call", async () => {
    const { container, onStart } = hub(NEW_LEARNER);
    const slide = container.querySelector<HTMLElement>("[data-hero-card]")!;
    fireEvent.click(within(slide).getByRole("button", { name: /^Call Alphonso/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Call (speak)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(dialog).toHaveTextContent("How to earn stars");
    fireEvent.click(within(dialog).getByRole("button", { name: /Start the call/ }));
    await settle();
    expect(onStart).toHaveBeenCalledWith({
      kind: "scenario",
      scenarioId: slide.dataset.heroCard,
      mode: "call",
    });
  });
  it("Chat opens the same sheet on the chat choice, even when calls are the default", async () => {
    const { container, onStart } = hub(NEW_LEARNER);
    const slide = container.querySelector<HTMLElement>("[data-hero-card]")!;
    fireEvent.click(within(slide).getByRole("button", { name: /^Chat with Alphonso/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Chat (type)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /Start the chat/ }));
    await settle();
    expect(onStart).toHaveBeenCalledWith({
      kind: "scenario",
      scenarioId: slide.dataset.heroCard,
      mode: "chat",
    });
  });
  it("while the rows load there is a quiet placeholder, not a zero-height hole", async () => {
    const { container } = hub(null);
    expect(container.querySelector("[data-hero-loading]")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector("[data-hero-card]")).toBeNull();
  });
});

describe("conversations", () => {
  it("come right after the hero and before the campaigns, with a Mastered badge at three stars only", async () => {
    const { container } = hub(PLAYED);
    const order = [...container.querySelectorAll("h2")].map((h) => h.textContent);
    expect(order).toEqual([
      "Conversations",
      `Campaigns · ${CAMPAIGNS.length} stories`,
      "Quick practice",
    ]);
    const airport = container.querySelector('[data-scenario-tile="airport"]')!;
    expect(airport.querySelector("[data-mastered]")).toHaveTextContent("Mastered");
    const coffee = container.querySelector('[data-scenario-tile="coffee"]')!;
    expect(coffee.querySelector("[data-mastered]")).toBeNull();
  });
});

describe("the campaigns rail", () => {
  it("is one card per campaign, each with its own room, a level and scene count, and a progress label", async () => {
    const { container } = hub(PLAYED);
    const rail = container.querySelector("[data-campaign-rail]")!;
    const cards = rail.querySelectorAll<HTMLElement>("[data-campaign-card]");
    expect(cards.length).toBe(CAMPAIGNS.length);
    const doctor = rail.querySelector('[data-campaign-card="doctors-visit"]') as HTMLElement;
    expect(doctor.querySelector("[data-campaign-progress]")).toHaveTextContent("1/3");
    expect(doctor).toHaveAccessibleName(/1 of 3 scenes done/);
    expect(
      [...doctor.querySelectorAll("[data-scene-dot]")].map((d) => d.getAttribute("data-scene-dot")),
    ).toEqual(["done", "todo", "todo"]);
    const fresh = rail.querySelector('[data-campaign-card="gym-join"]') as HTMLElement;
    expect(fresh.querySelector("[data-campaign-progress]")).toHaveTextContent("New");
    // Stars are not repeated on the rail: they live in the campaign's detail.
    expect(rail.querySelector("[data-stars]")).toBeNull();
    const backgrounds = new Set([...cards].map((c) => c.style.backgroundImage));
    expect(backgrounds.size).toBeGreaterThan(1);
  });
  it("its detail (the pre-call sheet) lists every scene with the stars it holds", async () => {
    const { container } = hub(PLAYED);
    fireEvent.click(container.querySelector('[data-campaign-card="doctors-visit"]')!);
    const list = within(screen.getByRole("dialog")).getByRole("list", {
      name: "Scenes in this campaign",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items.length).toBe(3);
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items.map((li) => li.querySelector("[data-stars]")!.getAttribute("data-stars"))).toEqual(
      ["3", "0", "0"],
    );
  });
});

describe("the drills", () => {
  it("are two separate featured cards, each with a picture and a Start button", async () => {
    const { container } = hub(NEW_LEARNER);
    const picture = container.querySelector("[data-say-the-picture-card]") as HTMLElement;
    const right = container.querySelector("[data-say-it-right-card]") as HTMLElement;
    expect(picture).not.toBe(right);
    expect(picture).toHaveTextContent("Say the picture");
    expect(right).toHaveTextContent("Say it right");
    for (const card of [picture, right]) expect(card).toHaveTextContent("Start");
    expect(picture.querySelectorAll("img").length).toBe(4);
    fireEvent.click(picture);
    expect(screen.getByTestId("say-the-picture")).toBeInTheDocument();
  });
  it("Say it right opens its own drill", async () => {
    const { container } = hub(NEW_LEARNER);
    fireEvent.click(container.querySelector("[data-say-it-right-card]")!);
    expect(screen.getByTestId("say-it-right")).toBeInTheDocument();
  });
});

describe("the Pro nudge", () => {
  it("comes last, after the drills", async () => {
    const { container } = hub(NEW_LEARNER);
    const nudge = screen.getByTestId("hector-invite");
    const drills = container.querySelector("[data-say-it-right-card]")!;
    expect(drills.compareDocumentPosition(nudge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("[data-practice-hub]")!.lastElementChild).toBe(nudge);
  });
});
