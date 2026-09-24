// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MascotBanner } from "./MascotBanner";

describe("MascotBanner", () => {
  it("shows the mascot image and message", () => {
    render(<MascotBanner mascot="alphonso" message="Nice work!" />);
    const img = screen.getByRole("img", { name: /alphonso/i });
    expect(img).toHaveAttribute("src", "/mascots/alphonso.png");
    expect(screen.getByText("Nice work!")).toBeInTheDocument();
  });

  it("uses the hector image when mascot is hector", () => {
    render(<MascotBanner mascot="hector" message="Hi" />);
    expect(screen.getByRole("img", { name: /hector/i })).toHaveAttribute(
      "src",
      "/mascots/hector.png",
    );
  });

  it("gives the image a real accessible name, not decorative alt text", () => {
    render(<MascotBanner mascot="alphonso" message="Streak saved" />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/alphonso/i);
  });
});
