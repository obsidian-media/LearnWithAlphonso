// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MascotBanner } from "./MascotBanner";
import { mascotArt } from "../lib/mascot-poses";

describe("MascotBanner", () => {
  it("shows the mascot's everyday pose and the message", () => {
    render(<MascotBanner mascot="alphonso" message="Nice work!" />);
    const img = screen.getByRole("img", { name: /alphonso/i });
    expect(img).toHaveAttribute("src", mascotArt("learnGreeting").src);
    expect(screen.getByText("Nice work!")).toBeInTheDocument();
  });

  it("uses the hector image when mascot is hector", () => {
    render(<MascotBanner mascot="hector" message="Hi" />);
    expect(screen.getByRole("img", { name: /hector/i })).toHaveAttribute(
      "src",
      mascotArt("hectorIdle").src,
    );
  });

  it("gives the image a real accessible name, not decorative alt text", () => {
    render(<MascotBanner mascot="alphonso" message="Streak saved" />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/alphonso/i);
  });
  it("takes a moment instead of a mascot and shows that moment's art", () => {
    render(<MascotBanner moment="hectorIdle" message="Hi" />);
    expect(screen.getByRole("img", { name: /hector/i }).getAttribute("src")).toMatch(
      /^\/mascots\/hector(-happy)?\.png$/,
    );
  });
});
