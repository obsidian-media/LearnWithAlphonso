// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProWelcome } from "./ProWelcome";

describe("ProWelcome (after buying)", () => {
  it("greets the learner by name, offers three openers in their course, and calls Hector", async () => {
    const onCall = vi.fn();
    render(<ProWelcome name="Sam" course="es" onCall={onCall} reduceMotion />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Welcome, Sam.Hector's ready.",
    );
    expect(screen.getByRole("img", { name: "Hector, smiling in his room" })).toBeInTheDocument();
    const openers = screen.getByRole("list", { name: "Try one of these" });
    expect(within(openers).getAllByRole("listitem")).toHaveLength(3);
    expect(within(openers).getByText(/ser and estar/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Call Hector" }));
    expect(onCall).toHaveBeenCalledTimes(1);
  });

  it("without a name, a plain welcome; openers follow the course", () => {
    render(<ProWelcome name={null} course="fr" onCall={() => {}} reduceMotion />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /^Welcome to Alphonso Pro\./,
    );
    expect(screen.queryByText(/ser and estar/)).toBeNull();
  });
});
