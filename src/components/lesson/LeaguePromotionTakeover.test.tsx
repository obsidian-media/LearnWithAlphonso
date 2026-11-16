// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { LeaguePromotionTakeover } from "./LeaguePromotionTakeover";

describe("LeaguePromotionTakeover (CD 01)", () => {
  it("welcomes you to the new league by its display name and says where you came from", () => {
    render(<LeaguePromotionTakeover from="silver" to="sapphire" onContinue={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Welcome to Grove" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("League promotion")).toBeInTheDocument();
    expect(
      within(dialog).getByText("You've been promoted to Grove, up from Sapling."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: "Alphonso, amazed" })).toBeInTheDocument();
  });

  it("shows the five-league ladder with the new league marked as current", () => {
    render(<LeaguePromotionTakeover from="bronze" to="silver" onContinue={() => {}} />);
    const ladder = screen.getByRole("list", { name: "Leagues" });
    const items = within(ladder).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Sprout",
      "Sapling",
      "Grove",
      "Treetop",
      "Summit",
    ]);
    const current = items.filter((li) => li.getAttribute("aria-current") === "true");
    expect(current.map((li) => li.textContent)).toEqual(["Sapling"]);
  });

  it("Continue and Escape both hand control back", () => {
    const onContinue = vi.fn();
    render(<LeaguePromotionTakeover from="ruby" to="diamond" onContinue={onContinue} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onContinue).toHaveBeenCalledTimes(2);
  });

  it("moves focus into the takeover (the Continue button) so a keyboard user can leave it", () => {
    render(<LeaguePromotionTakeover from="bronze" to="silver" onContinue={() => {}} />);
    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
  });
});
