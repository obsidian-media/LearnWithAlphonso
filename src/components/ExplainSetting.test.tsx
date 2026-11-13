// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExplainSettings } from "@/lib/explain-settings";

let settings: ExplainSettings | null = { nativeLanguage: "fa", mode: "tap" };
vi.mock("@/lib/explain-settings", () => ({
  useExplainSettings: () => settings,
  announceExplainSettingsChanged: vi.fn(),
}));
const saveLearnerProfile = vi.fn(async (_: unknown) => ({}));
vi.mock("@/lib/learner-profile.functions", () => ({
  saveLearnerProfile: (a: unknown) => saveLearnerProfile(a),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { refreshSession: vi.fn(async () => ({})) } },
}));

import { ExplainSetting } from "./ExplainSetting";

beforeEach(() => {
  settings = { nativeLanguage: "fa", mode: "tap" };
  saveLearnerProfile.mockClear();
});
afterEach(cleanup);

describe("ExplainSetting", () => {
  it("shows the learner's language and 'Tap to explain' selected, marked Default, for an account that never chose", () => {
    render(<ExplainSetting />);
    expect((screen.getByLabelText("My language") as HTMLSelectElement).value).toBe("fa");
    const tap = screen.getByRole("radio", { name: /Tap to explain/ });
    expect(tap.getAttribute("aria-checked")).toBe("true");
    expect(tap.textContent).toContain("Default");
    expect(screen.getByRole("radio", { name: /Always show/ }).getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(
      screen.getByRole("radio", { name: /Target language only/ }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("names the language in the descriptions and states the allowance and that it is AI", () => {
    render(<ExplainSetting />);
    expect(screen.getByText(/"Explain in Persian" button/)).toBeTruthy();
    expect(screen.getByText(/Free: 40 a day/)).toBeTruthy();
    expect(screen.getByText(/Written by AI/)).toBeTruthy();
  });

  it("saves the chosen mode on the account", async () => {
    render(<ExplainSetting />);
    await userEvent.setup().click(screen.getByRole("radio", { name: /Always show/ }));
    await waitFor(() =>
      expect(saveLearnerProfile).toHaveBeenCalledWith({
        data: { patch: { explainMode: "always" } },
      }),
    );
  });

  it("saves a changed language", async () => {
    render(<ExplainSetting />);
    await userEvent.setup().selectOptions(screen.getByLabelText("My language"), "ar");
    await waitFor(() =>
      expect(saveLearnerProfile).toHaveBeenCalledWith({
        data: { patch: { nativeLanguage: "ar" } },
      }),
    );
  });

  it("tells the learner when saving fails", async () => {
    saveLearnerProfile.mockRejectedValueOnce(new Error("x"));
    render(<ExplainSetting />);
    await userEvent.setup().click(screen.getByRole("radio", { name: /Target language only/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't save/);
  });

  it("asks for a language when the account has none", () => {
    settings = { nativeLanguage: undefined, mode: "tap" };
    render(<ExplainSetting />);
    expect((screen.getByLabelText("My language") as HTMLSelectElement).value).toBe("");
  });
});
