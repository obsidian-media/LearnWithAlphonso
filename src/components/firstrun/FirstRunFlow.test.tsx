// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseCalls = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get: (_t, key) => {
        supabaseCalls(key);
        return new Proxy(() => {}, { get: () => supabaseCalls, apply: supabaseCalls });
      },
    },
  ),
}));
vi.mock("../../lib/speech", () => ({ canSpeak: () => false, speak: vi.fn() }));

const { FirstRunFlow } = await import("./FirstRunFlow");
const firstRunModule = await import("../../lib/first-run");
const { browserFirstRunStore, FIRST_RUN_DRAFT_KEY, UNDER_13_KEY } = firstRunModule;

const fetchSpy = vi.fn(() => Promise.reject(new Error("no network in the first run")));

beforeEach(() => {
  localStorage.clear();
  fetchSpy.mockClear();
  supabaseCalls.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderNew() {
  const handlers = {
    onGoogle: vi.fn(),
    onEmail: vi.fn(),
    onHaveAccount: vi.fn(),
    onUnder13Ok: vi.fn(),
    onExit: vi.fn(),
  };
  const view = render(<FirstRunFlow mode="new" store={browserFirstRunStore()} {...handlers} />);
  return { ...handlers, ...view };
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/** Name (skipped), Spanish, about you (suggested), travel, brand new, 10 minutes: lands on the age screen. */
function walkToAge() {
  click("Skip");
  click(/Spanish/);
  click("Continue");
  click("Continue");
  click(/Travel/);
  click("Continue");
  click(/brand new/);
  click("Continue");
  click(/10 minutes/);
  click("Continue");
  expect(screen.getByRole("heading", { name: "How old are you?" })).toBeTruthy();
}

describe("the age screen", () => {
  it("is neutral: no range picked, Continue off, and no hint of a right answer", () => {
    renderNew();
    walkToAge();
    const pressed = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(0);
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/13 (or|and) (older|over)|at least|must be|only for/i);
  });

  it("Under 13: the kind stop, the answers wiped, and nothing sent anywhere", () => {
    const { onGoogle, onEmail } = renderNew();
    walkToAge();
    expect(localStorage.getItem(FIRST_RUN_DRAFT_KEY)).toContain("es");
    click(/under 13/i);
    click("Continue");
    expect(
      screen.getByRole("heading", { name: "Thanks for wanting to learn with me!" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/aged 13 and over, so we can't make an account for you yet/),
    ).toBeTruthy();
    expect(localStorage.getItem(FIRST_RUN_DRAFT_KEY)).toBeNull();
    expect(localStorage.getItem(UNDER_13_KEY)).toBe("1");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(supabaseCalls).not.toHaveBeenCalled();
    expect(onGoogle).not.toHaveBeenCalled();
    expect(onEmail).not.toHaveBeenCalled();
    // No way back into the questions from the stop.
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("coming back to the first run on this device goes straight to the stop", () => {
    const first = renderNew();
    walkToAge();
    click(/under 13/i);
    click("Continue");
    first.unmount();
    renderNew();
    expect(
      screen.getByRole("heading", { name: "Thanks for wanting to learn with me!" }),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("an older range goes on to interests, keeping the range only", () => {
    renderNew();
    walkToAge();
    click(/25–34/);
    click("Continue");
    expect(screen.getByRole("heading", { name: "What do you love talking about?" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(FIRST_RUN_DRAFT_KEY) ?? "{}").ageRange).toBe("25-34");
  });
});

describe("the rest of the flow", () => {
  it("reaches sign-in after the taste and the plan, still without a request", async () => {
    const { onGoogle, onEmail } = renderNew();
    walkToAge();
    click(/25–34/);
    click("Continue");
    click(/Food/);
    click("Continue");
    // First taste: two questions.
    click("Buenos días");
    click("Check");
    click("Next");
    click("Thank you");
    click("Check");
    click("Next");
    await act(async () => {});
    expect(await screen.findByRole("heading", { name: /Spanish plan/ })).toBeTruthy();
    click("Save my plan");
    expect(screen.getByRole("heading", { name: /save your plan/i })).toBeTruthy();
    click(/Continue with Google/);
    expect(onGoogle).toHaveBeenCalled();
    click(/Continue with email/);
    expect(onEmail).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("a shared browser: the device-wide draft", () => {
  it("Complete your profile never shows another account's draft, nor lets it override the saved answers", () => {
    // Someone else's first run, left on this computer.
    localStorage.setItem(FIRST_RUN_DRAFT_KEY, JSON.stringify({ name: "Sam", goal: "work" }));
    render(
      <FirstRunFlow
        mode="complete"
        store={browserFirstRunStore()}
        prefill={{ name: "Ana" }}
        course="fr"
        onExit={vi.fn()}
        onUnder13Ok={vi.fn()}
      />,
    );
    expect((screen.getByPlaceholderText("Your first name") as HTMLInputElement).value).toBe("Ana");
    fireEvent.change(screen.getByPlaceholderText("Your first name"), {
      target: { value: "Anabel" },
    });
    // This signed-in account's answers are not written to the device-wide draft either.
    expect(JSON.parse(localStorage.getItem(FIRST_RUN_DRAFT_KEY)!)).toEqual({
      name: "Sam",
      goal: "work",
    });
  });

  it("a signed-in account's empty answer is not filled from the device draft", () => {
    localStorage.setItem(FIRST_RUN_DRAFT_KEY, JSON.stringify({ name: "Sam" }));
    render(
      <FirstRunFlow
        mode="complete"
        store={browserFirstRunStore()}
        prefill={{}}
        course="fr"
        onExit={vi.fn()}
        onUnder13Ok={vi.fn()}
      />,
    );
    expect((screen.getByPlaceholderText("Your first name") as HTMLInputElement).value).toBe("");
  });
});

describe("storage blocked (private mode)", () => {
  it("the age answer keeps every earlier answer in memory instead of wiping them", () => {
    const { createFirstRunStore } = firstRunModule;
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    render(
      <FirstRunFlow
        mode="new"
        store={createFirstRunStore(broken)}
        onGoogle={vi.fn()}
        onEmail={vi.fn()}
        onHaveAccount={vi.fn()}
        onUnder13Ok={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    walkToAge();
    click(/25–34/);
    click("Continue");
    click(/Food/);
    click("Continue");
    // The taste is in the course chosen earlier (Spanish): before the fix it fell back to English.
    expect(screen.getByRole("button", { name: "Buenos días" })).toBeTruthy();
  });
});
