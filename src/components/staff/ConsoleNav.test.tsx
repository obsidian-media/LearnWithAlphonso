// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsoleNav } from "./ConsoleNav";

// `role` is the staff role, not an ARIA role; passing props as an object keeps the a11y lint rule from misreading it.
const nav = (props: ComponentProps<typeof ConsoleNav>) => render(<ConsoleNav {...props} />);

describe("ConsoleNav identity", () => {
  it("shows the name beside the role, and Sign out calls its handler", async () => {
    const onSignOut = vi.fn();
    nav({ scopes: ["users.read"], role: "owner", name: "Sam Rivera", onSignOut });
    expect(screen.getByText("Sam Rivera · owner")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("falls back to the role alone when there is no name", () => {
    nav({ scopes: [], role: "support", name: null });
    expect(screen.getByText("support")).toBeTruthy();
  });

  it("still hides pages the person lacks scope for", () => {
    nav({ scopes: ["users.read"], role: "support" });
    expect(screen.getByRole("link", { name: "Users" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Staff" })).toBeNull();
  });
});
