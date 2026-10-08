// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiConsentGate } from "@/components/AiConsentGate";
import { fakeConsentApi } from "./__testutils__/ai-consent";
import { AiConsentProvider, isAiConsentRequired, useAiConsent } from "./ai-consent-context";

vi.mock("./ai-consent.functions", () => ({ getAiConsent: vi.fn(), setAiConsent: vi.fn() }));
afterEach(cleanup);

function Feature() {
  const consent = useAiConsent();
  return (
    <div>
      <p>feature content</p>
      <button type="button" onClick={consent.markWithdrawn}>
        simulate 403
      </button>
    </div>
  );
}

function renderGate(api: ReturnType<typeof fakeConsentApi>) {
  return render(
    <AiConsentProvider api={api}>
      <AiConsentGate backTo="/converse">
        <Feature />
      </AiConsentGate>
    </AiConsentProvider>,
  );
}

describe("AiConsentGate", () => {
  it("shows the feature at once for a learner who consented anywhere (no sheet)", async () => {
    const api = fakeConsentApi("2026-10-09T10:00:00Z");
    renderGate(api);
    expect(await screen.findByText("feature content")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.setCalls).toEqual([]);
  });

  it("without consent shows the gate, and Allow records consent then shows the feature", async () => {
    const api = fakeConsentApi(null);
    const user = userEvent.setup();
    renderGate(api);
    await user.click(await screen.findByRole("button", { name: "Review and allow" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Deepgram");
    await user.click(screen.getByRole("button", { name: "Allow" }));
    expect(await screen.findByText("feature content")).toBeInTheDocument();
    expect(api.setCalls).toEqual([true]);
  });

  it("Not now records nothing and keeps the gate", async () => {
    const api = fakeConsentApi(null);
    const user = userEvent.setup();
    renderGate(api);
    await user.click(await screen.findByRole("button", { name: "Review and allow" }));
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("feature content")).toBeNull();
    expect(api.setCalls).toEqual([]);
  });

  it("a 403 ai-consent-required flips the page back to the gate", async () => {
    const user = userEvent.setup();
    renderGate(fakeConsentApi("2026-10-09T10:00:00Z"));
    await user.click(await screen.findByRole("button", { name: "simulate 403" }));
    expect(await screen.findByRole("button", { name: "Review and allow" })).toBeInTheDocument();
  });

  it("a failed save shows an error and stays open", async () => {
    const api = fakeConsentApi(null);
    api.set = async () => {
      throw new Error("offline");
    };
    const user = userEvent.setup();
    renderGate(api);
    await user.click(await screen.findByRole("button", { name: "Review and allow" }));
    await user.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save your choice"),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("AiConsentGate, when the setting cannot be read", () => {
  it("offers a retry, never the consent sheet or the 'AI is off' gate", async () => {
    let fail = true;
    const api = fakeConsentApi("2026-10-09T10:00:00Z");
    api.get = async () => {
      if (fail) throw new Error("offline");
      return "2026-10-09T10:00:00Z";
    };
    const user = userEvent.setup();
    renderGate(api);
    expect(await screen.findByText("Couldn't check your AI setting")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("AI practice is off")).toBeNull();
    expect(screen.queryByRole("button", { name: "Review and allow" })).toBeNull();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("feature content")).toBeInTheDocument();
  });
});

describe("AiConsentGate, mid-session withdrawal", () => {
  function Chat() {
    const consent = useAiConsent();
    const [text, setText] = useState("");
    return (
      <div>
        <input aria-label="draft" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="button" onClick={consent.markWithdrawn}>
          simulate 403
        </button>
      </div>
    );
  }

  it("keeps the screen mounted under the prompt, so allowing again finds everything as it was", async () => {
    const user = userEvent.setup();
    const api = fakeConsentApi("2026-10-09T10:00:00Z");
    render(
      <AiConsentProvider api={api}>
        <AiConsentGate backTo="/converse">
          <Chat />
        </AiConsentGate>
      </AiConsentProvider>,
    );
    await user.type(await screen.findByLabelText("draft"), "bonjour");
    await user.click(screen.getByRole("button", { name: "simulate 403" }));
    // The prompt is up and the screen behind it is inert.
    await user.click(await screen.findByRole("button", { name: "Review and allow" }));
    await user.click(await screen.findByRole("button", { name: "Allow" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("draft")).toHaveValue("bonjour");
    expect(screen.getByLabelText("draft").closest("[inert]")).toBeNull();
  });

  it("makes the screen inert while the prompt is showing", async () => {
    const user = userEvent.setup();
    render(
      <AiConsentProvider api={fakeConsentApi("2026-10-09T10:00:00Z")}>
        <AiConsentGate backTo="/converse">
          <Chat />
        </AiConsentGate>
      </AiConsentProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "simulate 403" }));
    await screen.findByRole("button", { name: "Review and allow" });
    expect(screen.getByLabelText("draft").closest("[inert]")).not.toBeNull();
  });
});

describe("AiConsentProvider", () => {
  function Asker({ onResult }: { onResult: (a: boolean, b: boolean) => void }) {
    const consent = useAiConsent();
    return (
      <button
        type="button"
        onClick={async () => {
          const first = consent.requestConsent();
          const second = consent.requestConsent();
          onResult(await first, await second);
        }}
      >
        ask twice
      </button>
    );
  }

  it("answers two requests made while the sheet is open with the same choice (none is orphaned)", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <AiConsentProvider api={fakeConsentApi(null)}>
        <Asker onResult={onResult} />
      </AiConsentProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "ask twice" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "ask twice" }));
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false, false));
  });

  it("reads the setting again when the signed-in account changes", async () => {
    let notify: () => void = () => {};
    const api = fakeConsentApi("2026-10-09T10:00:00Z");
    const get = vi.fn(api.get);
    api.get = get;
    render(
      <AiConsentProvider
        api={api}
        subscribeAuth={(cb) => {
          notify = cb;
          return () => {};
        }}
      >
        <Feature />
      </AiConsentProvider>,
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await act(async () => notify());
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});

describe("the consent sheet is a real modal", () => {
  it("moves focus in, traps Tab, hides the page from assistive tech and describes itself", async () => {
    const user = userEvent.setup();
    render(
      <AiConsentProvider api={fakeConsentApi(null)}>
        <AiConsentGate backTo="/converse">
          <Feature />
        </AiConsentGate>
      </AiConsentProvider>,
    );
    const opener = await screen.findByRole("button", { name: "Review and allow" });
    await user.click(opener);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-describedby", "ai-consent-body");
    expect(document.getElementById("ai-consent-body")).toHaveTextContent("Deepgram");
    expect(dialog.contains(document.activeElement)).toBe(true);
    // The rest of the page is inert while the sheet is open.
    expect(opener.closest("[inert]")).not.toBeNull();
    // Tab never leaves the dialog.
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    // Closing restores the page and gives focus back.
    await user.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(opener.closest("[inert]")).toBeNull();
  });
});

describe("isAiConsentRequired", () => {
  it("recognises only the 403 consent code", async () => {
    expect(
      await isAiConsentRequired(Response.json({ error: "ai-consent-required" }, { status: 403 })),
    ).toBe(true);
    expect(
      await isAiConsentRequired(Response.json({ error: "not-entitled" }, { status: 403 })),
    ).toBe(false);
    expect(
      await isAiConsentRequired(Response.json({ error: "ai-consent-required" }, { status: 400 })),
    ).toBe(false);
    expect(
      await isAiConsentRequired(Response.json({ error: "consent-check-failed" }, { status: 503 })),
    ).toBe(false);
  });
});
