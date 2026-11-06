// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const updateUser = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession, updateUser } },
}));

const { VoicesSetting } = await import("./VoicesSetting");
const { useProgress } = await import("@/lib/progress");
const { VOICE_PREFS_STORAGE_KEY } = await import("@/lib/voice-prefs");

const played: string[] = [];
class FakeAudio {
  constructor(public src: string) {
    played.push(src);
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
  addEventListener() {}
}

beforeEach(() => {
  cleanup();
  localStorage.removeItem(VOICE_PREFS_STORAGE_KEY);
  played.length = 0;
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: { user: { user_metadata: {} } } } });
  updateUser.mockReset();
  updateUser.mockResolvedValue({ data: {}, error: null });
  vi.stubGlobal("Audio", FakeAudio);
  globalThis.fetch = vi.fn() as never;
  useProgress.setState({ course: "es" });
});

describe("Settings > Voices", () => {
  it("opens on the learner's course with a row for Alphonso and one for Hector showing the defaults", async () => {
    render(<VoicesSetting />);
    expect(screen.getByRole("heading", { name: "Voices" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Alphonso's voice in Spanish: Javier/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Hector's voice in Spanish: Alvaro/ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "French" }));
    expect(
      screen.getByRole("button", { name: /Alphonso's voice in French: Hector/ }),
    ).toBeInTheDocument();
  });

  it("shows the account's saved choices", async () => {
    getSession.mockResolvedValue({
      data: {
        session: { user: { user_metadata: { voices: { hector: { es: "aura-2-celeste-es" } } } } },
      },
    });
    render(<VoicesSetting />);
    expect(
      await screen.findByRole("button", { name: /Hector's voice in Spanish: Celeste/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Alphonso's voice in Spanish: Javier/ }),
    ).toBeInTheDocument();
  });

  it("the picker groups voices Male / Female, marks the default and checks the current one", async () => {
    render(<VoicesSetting />);
    await userEvent.click(await screen.findByRole("button", { name: /Hector's voice in Spanish/ }));
    const dialog = screen.getByRole("dialog", { name: /Hector's voice · Spanish/ });
    const male = within(dialog).getByRole("radiogroup", { name: "Male voices" });
    const female = within(dialog).getByRole("radiogroup", { name: "Female voices" });
    expect(within(male).getAllByRole("radio")).toHaveLength(6);
    expect(within(female).getAllByRole("radio")).toHaveLength(9);
    const alvaro = within(male).getByRole("radio", { name: /Alvaro/ });
    expect(alvaro).toHaveAttribute("aria-checked", "true");
    expect(alvaro).toHaveTextContent("Default");
    expect(alvaro).toHaveTextContent("Spain · Calm, professional");
    expect(within(female).getByRole("radio", { name: /Celeste/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("choosing saves Hector's voice to the account and the cache, without touching Alphonso's", async () => {
    render(<VoicesSetting />);
    await userEvent.click(await screen.findByRole("button", { name: /Hector's voice in Spanish/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Celeste/ }));
    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({
        data: { voices: { alphonso: {}, hector: { es: "aura-2-celeste-es" } } },
      }),
    );
    expect(JSON.parse(localStorage.getItem(VOICE_PREFS_STORAGE_KEY)!)).toEqual({
      alphonso: {},
      hector: { es: "aura-2-celeste-es" },
    });
    expect(screen.getByRole("radio", { name: /Celeste/ })).toHaveAttribute("aria-checked", "true");
  });

  it("a failed save says so", async () => {
    updateUser.mockResolvedValue({ data: {}, error: new Error("offline") });
    render(<VoicesSetting />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Alphonso's voice in Spanish/ }),
    );
    await userEvent.click(screen.getByRole("radio", { name: /Diana/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your voice");
  });

  it("▶ plays the static preview clip and never calls TTS", async () => {
    render(<VoicesSetting />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Alphonso's voice in Spanish/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Play Diana preview" }));
    expect(played).toEqual(["/voices/aura-2-diana-es.mp3"]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Stop Diana preview" })).toBeInTheDocument();
  });
});
