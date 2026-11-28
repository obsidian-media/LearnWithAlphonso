// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import fixture from "../../../tests/fixtures/rehearsal-api.json";
import { parseSpeaking } from "@/lib/rehearsal-speaking";
import { HowYouSpoke } from "./HowYouSpoke";

const speaking = parseSpeaking(fixture.speaking.pauses.rehearsalSpeaking);

describe("the pause note on the debrief", () => {
  it("reads as the design says, with the English filler", () => {
    render(<HowYouSpoke speaking={speaking} course="en" />);
    expect(
      screen.getByText(
        "You took a moment before 4 of 7 answers. That's fine; next time try starting with “Let me think…”.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Taking a moment")).toBeTruthy();
  });

  it("uses the French and Spanish fillers", () => {
    const { unmount } = render(<HowYouSpoke speaking={speaking} course="fr" />);
    expect(screen.getByText(/Laissez-moi réfléchir…/)).toBeTruthy();
    unmount();
    render(<HowYouSpoke speaking={speaking} course="es" />);
    expect(screen.getByText(/Déjeme pensar…/)).toBeTruthy();
  });

  it("has no trend arrow and no red", () => {
    const { container } = render(<HowYouSpoke speaking={speaking} course="en" />);
    const icons = [...container.querySelectorAll("[data-trend]")];
    expect(icons.map((i) => i.getAttribute("data-trend"))).toEqual(["up", "none"]);
    // Class names only (the words are checked on their own: "answered" is not a colour).
    const classes = [...container.querySelectorAll("[class]")].map((e) => e.getAttribute("class"));
    expect(classes.join(" ")).not.toMatch(/red|danger|destructive|error|warn/i);
  });

  it("shows nothing for a note kind this client does not know", () => {
    const { container } = render(
      <HowYouSpoke
        speaking={parseSpeaking({ notes: [{ kind: "pace", count: 1, total: 2, previous: null }] })}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
