// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));

const { Route } = await import("./index");

function renderLanding() {
  const Landing = Route.options.component!;
  return render(<Landing />);
}

// The signed-out entry adapts the approved marketing mock (CD 11). Its sections are here; its marketing-only
// claims are not. What the page says has to be true of the app today.
describe("signed-out landing, adapted from the marketing mock", () => {
  it("has the mock's sections: hero, courses, lessons, everything around the lesson, questions, closing", () => {
    renderLanding();
    expect(screen.getByRole("list", { name: "Courses" })).toBeInTheDocument();
    for (const name of [
      "Lessons with a voice, a face and a room.",
      "Everything around the lesson.",
      "Questions people ask.",
      "Your first lesson takes a few minutes.",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
  });

  it("answers the questions people ask, each in a disclosure a keyboard can open", () => {
    const { container } = renderLanding();
    const details = container.querySelectorAll("details");
    expect(details.length).toBeGreaterThanOrEqual(5);
    for (const d of details) expect(d.querySelector("summary")).not.toBeNull();
    expect(container.textContent).toMatch(/American English/);
  });

  it("does not claim the app is in a store, or sell anything", () => {
    const { container } = renderLanding();
    const text = container.textContent ?? "";
    // The iPhone app is a TestFlight beta; the page may say so but never that it is on the App Store.
    expect(text).toMatch(/public beta/i);
    expect(text).not.toMatch(
      /(download|available|find us|get it)\s+(on|in|from)\s+the\s+(app store|google play)/i,
    );
    expect(text).not.toMatch(/app store|google play|play store/i);
    // Hector's paid tier is not purchasable yet; the page names neither the tier nor a price.
    expect(text).not.toMatch(/\bPro\b|Hector|\$\d|per month|subscription/);
  });

  it("invents no dialogue: the hero art is a room and Alphonso, with no speech bubble", () => {
    const { container } = renderLanding();
    const art = container.querySelector("[data-landing-room]")!;
    expect(art.querySelectorAll("img")).toHaveLength(2);
    expect(art.textContent).toBe("");
  });

  it("the lesson count it states is no more than the lessons the app ships", async () => {
    const { getCourse } = await import("@/data/courses");
    const shipped = (["en", "fr", "es"] as const).reduce(
      (n, c) => n + getCourse(c).curriculum.reduce((a, u) => a + u.lessons.length, 0),
      0,
    );
    const { container } = renderLanding();
    const claimed = Number(
      /([\d,]+)\+ lessons/.exec(container.textContent ?? "")![1].replace(",", ""),
    );
    expect(claimed).toBeGreaterThan(0);
    expect(claimed).toBeLessThanOrEqual(shipped);
    // And it is not stale by more than a round hundred, so "1,800+" does not outlive a bigger course.
    expect(shipped - claimed).toBeLessThan(200);
  });

  it("every call to action leads into the app, and the two entry links stay unique by name", () => {
    renderLanding();
    expect(screen.getAllByRole("link", { name: /get started/i })).toHaveLength(1);
    for (const link of screen.getAllByRole("link", { name: /start your first lesson/i })) {
      expect(link).toHaveAttribute("href", "/welcome");
    }
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth");
  });
});
