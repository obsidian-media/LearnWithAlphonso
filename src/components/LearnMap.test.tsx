// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { learnMap, mapPoint, type MapUnit } from "@/lib/learn-map";
import { LearnMap } from "./LearnMap";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a href={params ? to.replace(/\$(\w+)/, (_, k) => params[k]) : to} {...rest}>
      {children}
    </a>
  ),
}));

const L = (id: string, title: string, subtitle = "", types = ["mc"], words = 0) => ({
  id,
  title,
  subtitle,
  questionTypes: types,
  wordCount: words,
});
const units: MapUnit[] = [
  {
    id: "u1",
    title: "Everyday Basics",
    lessons: [
      L("u1l1", "Saying Hello", "Common greetings", ["mc", "mc", "fill"], 4),
      L("u1l2", "About Me", "Introductions", ["mc", "listening", "reorder", "translate"], 6),
      L("u1l3", "Numbers", "One to twenty", ["speak"]),
    ],
  },
  { id: "u2", title: "Family", lessons: [L("u2l1", "My Family", "Parents", ["fill"], 3)] },
];

function show(
  completed: string[],
  opts: { continueLessonId?: string | null; blocked?: boolean; onBlocked?: () => void } = {},
) {
  const map = learnMap(units, new Set(completed))!;
  render(
    <LearnMap
      map={map}
      greeting="Ready for today's lesson?"
      continueLessonId={
        opts.continueLessonId === undefined ? (map.next?.lessonId ?? null) : opts.continueLessonId
      }
      blocked={opts.blocked ?? false}
      onBlocked={opts.onBlocked ?? (() => {})}
    />,
  );
  return map;
}

const climb = () => screen.getByRole("list", { name: /climb, from the foot to the summit/ });

describe("LearnMap: the climbing map", () => {
  it("the unit strip names the unit's place in the level, its done count, and a progress bar", () => {
    show(["u1l1"]);
    expect(screen.getByRole("heading", { name: "Unit 1 of 2 · Everyday Basics" })).toBeTruthy();
    const strip = screen.getByRole("heading").closest("[data-learn-strip]")!;
    expect(strip.textContent).toContain("1 / 3");
    const bar = screen.getByRole("progressbar", { name: "Unit progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(bar.getAttribute("aria-valuemax")).toBe("3");
    expect((bar.firstElementChild as HTMLElement).style.width).toMatch(/^33\.3/);
  });

  it("the nodes are an ordered list in climb order, each named with its place, title and state", () => {
    show(["u1l1"]);
    const items = within(climb()).getAllByRole("listitem");
    // three lessons and the summit chest (no trailhead chest on the first unit)
    expect(
      items.map((li) => li.getAttribute("data-node") ?? li.getAttribute("data-chest")),
    ).toEqual(["done", "next", "locked", "locked"]);
    expect(screen.getByRole("link", { name: "Lesson 1 of 3, Saying Hello, done" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lesson 2 of 3, About Me, next" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lesson 3 of 3, Numbers, locked" })).toBeTruthy();
  });

  it("every node sits where the shared model puts it, so all platforms draw the same climb", () => {
    show([]);
    const items = within(climb()).getAllByRole("listitem");
    items.forEach((li, i) => {
      const p = mapPoint(i, 4);
      expect(li.style.left).toBe(`${p.x * 100}%`);
      expect(li.style.top).toBe(`${p.y * 100}%`);
    });
    // The climb is never shorter than a phone's first screen of map.
    const height = parseFloat(
      (document.querySelector("[data-learn-climb]") as HTMLElement).style.height,
    );
    expect(height).toBeGreaterThanOrEqual(360);
  });

  it("each state draws its design-system mark, never an emoji", () => {
    show(["u1l1"]);
    const map = document.querySelector("[data-learn-map]")!;
    expect(map.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const li of within(climb()).getAllByRole("listitem")) {
      expect(li.querySelector("svg")).not.toBeNull();
    }
  });

  it("the summit chest reads locked until the unit is done, and earned after", () => {
    show([]);
    expect(
      screen.getByRole("img", { name: "Unit 1 reward, locked until you finish the unit" }),
    ).toBeTruthy();
    expect(document.querySelector("[data-chest=trailhead]")).toBeNull();
  });

  it("a finished unit's chest sits at the foot of the next climb, earned; the new summit is locked", () => {
    show(["u1l1", "u1l2", "u1l3"]);
    expect(screen.getByRole("heading", { name: "Unit 2 of 2 · Family" })).toBeTruthy();
    const items = within(climb()).getAllByRole("listitem");
    expect(items[0]!.getAttribute("data-chest")).toBe("trailhead");
    expect(within(items[0]!).getByRole("img", { name: "Unit 1 reward, earned" })).toBeTruthy();
    expect(items.at(-1)!.getAttribute("data-chest")).toBe("locked");
  });

  it("a finished level shows the last summit chest earned and no next lesson", () => {
    show(["u1l1", "u1l2", "u1l3", "u2l1"]);
    expect(screen.getByRole("img", { name: "Unit 2 reward, earned" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /, next$/ })).toBeNull();
  });

  it("the next lesson glows and bobs (stilled by Reduce Motion in CSS)", () => {
    show([]);
    const next = screen.getByRole("button", { name: /, next$/ });
    expect(next.className).toContain("map-node-bounce");
    const css = readFileSync("src/styles.css", "utf8");
    const reduce = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf(".map-node-bounce {")),
    );
    expect(reduce.slice(0, 120)).toMatch(/\.map-node-bounce\s*\{\s*animation:\s*none/);
  });

  it("the next node's bounce moves it only up and down, never sideways", () => {
    // Tailwind v4 centres the node with the `translate` property; a keyframe transform with an x offset stacks on it.
    const css = readFileSync("src/styles.css", "utf8");
    const keyframes = css.slice(
      css.indexOf("@keyframes map-node-bounce"),
      css.indexOf(".map-node-bounce {"),
    );
    expect(keyframes).toContain("translateY(");
    expect(keyframes).not.toMatch(/translate\(\s*-50%/);
  });

  describe("the start sheet", () => {
    it("tapping the next lesson opens it with the title, coverage and time / XP / word chips", () => {
      show(["u1l1"]);
      fireEvent.click(screen.getByRole("button", { name: /About Me, next/ }));
      const sheet = screen.getByRole("dialog", { name: "About Me" });
      expect(sheet.textContent).toContain("Unit 1 · Lesson 2");
      expect(within(sheet).getByText("Introductions")).toBeTruthy();
      expect(sheet.getAttribute("aria-describedby")).toBeTruthy();
      const chips = sheet.querySelector("[data-start-chips]")!;
      // 20+25+30+45 s + 6 words * 8 s = 168 s -> 3 min; 4 answers * 10 + 20 perfect = 60 XP; 6 words
      expect([...chips.querySelectorAll("div")].map((d) => d.textContent)).toEqual([
        "Time3 min",
        "XP+60",
        "Words6",
      ]);
    });

    it("says Continue lesson when the next lesson is the course-wide Continue lesson", () => {
      show(["u1l1"], { continueLessonId: "u1l2" });
      fireEvent.click(screen.getByRole("button", { name: /, next$/ }));
      const cta = screen.getByRole("link", { name: "Continue lesson" });
      expect(cta.getAttribute("href")).toBe("/lesson/u1l2");
    });

    it("says Start lesson, never Continue, when the learner's place is elsewhere (another level)", () => {
      show(["u1l1"], { continueLessonId: "b2u4l1" });
      fireEvent.click(screen.getByRole("button", { name: /, next$/ }));
      expect(screen.queryByRole("link", { name: /Continue/ })).toBeNull();
      expect(screen.getByRole("link", { name: "Start lesson" }).getAttribute("href")).toBe(
        "/lesson/u1l2",
      );
    });

    it("says Start lesson when there is no course-wide Continue lesson at all", () => {
      show([], { continueLessonId: null });
      fireEvent.click(screen.getByRole("button", { name: /, next$/ }));
      expect(screen.getByRole("link", { name: "Start lesson" })).toBeTruthy();
    });

    it("out of hearts, the sheet's button opens the hearts modal instead of starting", () => {
      const onBlocked = vi.fn();
      show([], { blocked: true, onBlocked });
      fireEvent.click(screen.getByRole("button", { name: /, next$/ }));
      expect(screen.queryByRole("link", { name: /lesson$/ })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Continue lesson (out of hearts)" }));
      expect(onBlocked).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("Not now and Escape close it", () => {
      show([]);
      fireEvent.click(screen.getByRole("button", { name: /, next$/ }));
      fireEvent.click(screen.getByRole("button", { name: "Not now" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /, next$/ }));
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("an empty coverage line is left out, not drawn blank", () => {
      const map = learnMap([{ id: "x", title: "X", lessons: [L("x1", "Plain")] }], new Set())!;
      render(
        <LearnMap
          map={map}
          greeting="Hi"
          continueLessonId={null}
          blocked={false}
          onBlocked={() => {}}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /, next$/ }));
      expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBeNull();
    });
  });

  it("a locked lesson is announced and says gently which lesson to finish first (no dead tap)", () => {
    show(["u1l1"]);
    expect(screen.getByRole("status").textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /Numbers, locked/ }));
    expect(screen.getByRole("status").textContent).toBe(
      "Finish About Me first, then this one opens.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the hint clears itself after a few seconds, so the live region never keeps a stale instruction", () => {
    vi.useFakeTimers();
    try {
      show(["u1l1"]);
      fireEvent.click(screen.getByRole("button", { name: /Numbers, locked/ }));
      expect(screen.getByRole("status").textContent).not.toBe("");
      act(() => {
        vi.advanceTimersByTime(5900);
      });
      expect(screen.getByRole("status").textContent).not.toBe("");
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByRole("status").textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the hint clears at once when the next lesson changes", () => {
    const props = { greeting: "Hi", continueLessonId: null, blocked: false, onBlocked: () => {} };
    const { rerender } = render(<LearnMap map={learnMap(units, new Set(["u1l1"]))!} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Numbers, locked/ }));
    expect(screen.getByRole("status").textContent).toContain("Finish About Me first");
    rerender(<LearnMap map={learnMap(units, new Set(["u1l1", "u1l2"]))!} {...props} />);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("the climb list fills the climb box (its items are absolute, so an unsized list would be hidden)", () => {
    // jsdom has no layout; e2e/signed-in.spec.ts measures the real boxes at 320 px.
    show([]);
    expect(climb().className).toMatch(/absolute/);
    expect(climb().className).toMatch(/inset-0/);
  });

  it("a done lesson can be played again; out of hearts it opens the hearts modal instead", () => {
    show(["u1l1"]);
    expect(screen.getByRole("link", { name: /Saying Hello, done/ }).getAttribute("href")).toBe(
      "/lesson/u1l1",
    );
    cleanup();
    const onBlocked = vi.fn();
    show(["u1l1"], { blocked: true, onBlocked });
    fireEvent.click(screen.getByRole("button", { name: /Saying Hello, done/ }));
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it("Alphonso waits at the trailhead with his greeting", () => {
    show([]);
    expect(screen.getByText("Ready for today's lesson?")).toBeTruthy();
    expect(document.querySelector('img[src="/avatar/base.webp"]')?.getAttribute("alt")).toBe("");
  });
});
