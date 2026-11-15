import { describe, expect, it, vi } from "vitest";
import { signOutAndLeave } from "./staff-signout";

describe("signOutAndLeave", () => {
  it("ends the session first, then goes to sign-in", async () => {
    const order: string[] = [];
    await signOutAndLeave(
      {
        signOut: async () => {
          order.push("signOut");
        },
      },
      (path) => order.push(`go:${path}`),
    );
    expect(order).toEqual(["signOut", "go:/signin"]);
  });

  it("still leaves for sign-in when ending the session fails", async () => {
    const go = vi.fn();
    await signOutAndLeave(
      {
        signOut: async () => {
          throw new Error("network");
        },
      },
      go,
    );
    expect(go).toHaveBeenCalledWith("/signin");
  });
});
