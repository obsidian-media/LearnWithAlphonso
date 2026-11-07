// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SOUND_EFFECTS_STORAGE_KEY, readSoundEffectsOn } from "@/lib/sfx";
import { SoundEffectsSetting } from "./SoundEffectsSetting";

beforeEach(() => localStorage.clear());

describe("Sound effects setting", () => {
  it("is a switch that starts on", () => {
    render(<SoundEffectsSetting />);
    expect(screen.getByRole("switch", { name: "Sound effects" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("turning it off is stored on this device, and the effects read it", async () => {
    const user = userEvent.setup();
    render(<SoundEffectsSetting />);
    await user.click(screen.getByRole("switch", { name: "Sound effects" }));
    expect(screen.getByRole("switch", { name: "Sound effects" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(localStorage.getItem(SOUND_EFFECTS_STORAGE_KEY)).toBe("off");
    expect(readSoundEffectsOn()).toBe(false);
  });

  it("shows off when it was turned off before", () => {
    localStorage.setItem(SOUND_EFFECTS_STORAGE_KEY, "off");
    render(<SoundEffectsSetting />);
    expect(screen.getByRole("switch", { name: "Sound effects" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});
