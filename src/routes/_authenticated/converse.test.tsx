// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/components/HectorInvite", () => ({
  HectorInvite: ({ source, look }: { source: string; look?: string }) => (
    <div data-testid="hector-invite" data-source={source} data-look={look} />
  ),
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
  it("counts zero stars out of the catalog's total", () => {
    const { container } = hub(NEW_LEARNER);
    const tallies = container.querySelectorAll("[data-star-tally]");
    expect(tallies.length).toBe(2);
    for (const t of tallies)
      expect(t).toHaveAccessibleName(`0 of ${maxStarsInCourse()} stars earned`);
  });
  it("has nothing to continue", () => {
    hub(NEW_LEARNER);
    expect(screen.queryByRole("heading", { name: "Continue" })).toBeNull();
  });
  it("still gets a pick at their level, without claiming a weak spot", () => {
    const { container } = hub(NEW_LEARNER);
    const pick = container.querySelector("[data-todays-pick]") as HTMLElement;
    const s = SCENARIOS.find((x) => x.id === pick.dataset.todaysPick)!;
    expect(s.level).toBe("Beginner");
    expect(pick).toHaveTextContent("A beginner scene at your level.");
    expect(pick).not.toHaveTextContent("your top weak spot");
  });
  it("shows every campaign and every scenario in the course language, with no stars", () => {
    const { container } = hub(NEW_LEARNER);
    for (const c of campaignsFor("es"))
      expect(screen.getAllByText(c.title).length).toBeGreaterThan(0);
    const tiles = container.querySelectorAll("[data-scenario-tile]");
    expect(tiles.length).toBe(SCENARIOS.length);
    for (const t of tiles)
      expect(t.querySelector("[data-stars]")).toHaveAttribute("data-stars", "0");
    expect(screen.getByText(`${CAMPAIGNS.length} stories`)).toBeInTheDocument();
  });
  it("offers Hector with his own card (practice_hector_card)", () => {
    hub(NEW_LEARNER);
    const card = screen.getByTestId("hector-invite");
    expect(card).toHaveAttribute("data-source", "practice_hector_card");
    expect(card).toHaveAttribute("data-look", "hub");
  });
  it("greets in the course language with an English gloss", () => {
    hub(NEW_LEARNER, "es");
    expect(screen.getByText("¿Practicamos un poco hoy?")).toHaveAttribute("lang", "es");
    expect(screen.getByText("Shall we practice a bit today?")).toBeInTheDocument();
  });
});

describe("Practice hub: a learner with stars and a campaign in progress", () => {
  it("adds up the stars held", () => {
    const { container } = hub(PLAYED);
    expect(container.querySelector("[data-star-tally]")).toHaveAccessibleName(
      `8 of ${maxStarsInCourse()} stars earned`,
    );
  });
  it("shows each scenario's best stars on its tile and each scene's under its room", () => {
    const { container } = hub(PLAYED);
    expect(container.querySelector('[data-scenario-tile="coffee"] [data-stars]')).toHaveAttribute(
      "data-stars",
      "2",
    );
    expect(container.querySelector('[data-scenario-tile="airport"] [data-stars]')).toHaveAttribute(
      "data-stars",
      "3",
    );
    const doctor = container.querySelector('[data-campaign-card="doctors-visit"]')!;
    expect(
      [...doctor.querySelectorAll("[data-stars]")].map((e) => e.getAttribute("data-stars")),
    ).toEqual(["3", "0", "0"]);
  });
  it("Continue resumes the campaign at its first scene without stars", () => {
    const { container, onStart } = hub(PLAYED);
    const card = container.querySelector("[data-continue]") as HTMLElement;
    expect(card.dataset.continue).toBe("doctors-visit:1");
    const doctor = campaignsFor("es").find((c) => c.id === "doctors-visit")!;
    expect(card).toHaveTextContent(`Scene 2 of ${doctor.scenes.length}`);
    fireEvent.click(card);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(doctor.scenes[1].opener);
    fireEvent.click(within(dialog).getByRole("button", { name: /Start the call/ }));
    expect(onStart).toHaveBeenCalledWith({
      kind: "scene",
      campaignId: "doctors-visit",
      sceneIndex: 1,
      mode: "call",
    });
  });
  it("Today's pick names the learner's real top weak spot, at their level", () => {
    const { container } = hub(PLAYED);
    const pick = container.querySelector("[data-todays-pick]") as HTMLElement;
    expect(pick).toHaveTextContent("makes you use the past tense, your top weak spot");
    expect(SCENARIOS.find((s) => s.id === pick.dataset.todaysPick)!.level).toBe("Intermediate");
  });
  it("while the rows load there is no counter and no pick, never a false zero", () => {
    const { container } = hub(null);
    expect(container.querySelector("[data-star-tally]")).toBeNull();
    expect(container.querySelector("[data-todays-pick]")).toBeNull();
  });
});

describe("Practice hub: level chips", () => {
  it("filter the scenarios to one level and back to all", () => {
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
  it("Advanced scenarios are open: their tiles open the pre-call sheet like any other", () => {
    const { container } = hub(NEW_LEARNER);
    fireEvent.click(container.querySelector('[data-scenario-tile="negotiation"]')!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("the pre-call sheet", () => {
  it("shows the persona, the real opener and the star rule from the tuning constants", () => {
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
  it("chooses call or chat, and starts the chosen one", () => {
    const { container, onStart } = hub(NEW_LEARNER);
    fireEvent.click(container.querySelector('[data-scenario-tile="hotel"]')!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Call (speak)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(within(dialog).getByRole("radio", { name: "Chat (type)" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Start the chat/ }));
    expect(onStart).toHaveBeenCalledWith({ kind: "scenario", scenarioId: "hotel", mode: "chat" });
  });
  it("a campaign card starts at its first scene without stars", () => {
    const { container, onStart } = hub(PLAYED);
    fireEvent.click(container.querySelector('[data-campaign-card="doctors-visit"]')!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Start/ }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "doctors-visit", sceneIndex: 1 }),
    );
  });
  it("closes without starting", () => {
    const { container, onStart } = hub(NEW_LEARNER);
    fireEvent.click(container.querySelector('[data-scenario-tile="hotel"]')!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onStart).not.toHaveBeenCalled();
  });
});

it("scene keys in the hub are the server's keys", () => {
  expect(sceneKey("doctors-visit", "doctor-book-phone")).toBe(PLAYED.stars[2].itemKey);
});
