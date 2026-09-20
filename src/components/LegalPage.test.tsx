// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const { LegalPage, Section, Bullets } = await import("./LegalPage");

describe("LegalPage", () => {
  it("renders the title, updated date, back link, and children", () => {
    render(
      <LegalPage title="Privacy Policy" updated="2026-01-01">
        <p>Body copy</p>
      </LegalPage>,
    );
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
    expect(screen.getByText("Last updated 2026-01-01")).toBeInTheDocument();
    expect(screen.getByText("Body copy")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/");
  });
});

describe("Section", () => {
  it("renders a heading and its content", () => {
    render(
      <Section heading="Data we collect">
        <p>Emails</p>
      </Section>,
    );
    expect(screen.getByRole("heading", { name: "Data we collect" })).toBeInTheDocument();
    expect(screen.getByText("Emails")).toBeInTheDocument();
  });
});

describe("Bullets", () => {
  it("renders one list item per entry", () => {
    render(<Bullets items={["First", "Second", "Third"]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});
