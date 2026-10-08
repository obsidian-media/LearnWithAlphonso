// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AiConsentProvider, useAiConsent } from "../lib/ai-consent-context";
import { AI_CONSENT_COPY } from "../lib/ai-consent-copy";

const getNameStatus = vi.fn();
const checkDisplayName = vi.fn();
const confirmName = vi.fn();
const skipName = vi.fn();
vi.mock("../lib/name-onboarding.functions", () => ({
  getNameStatus: () => getNameStatus(),
  checkDisplayName: (o: unknown) => checkDisplayName(o),
  confirmName: (o: unknown) => confirmName(o),
  skipName: () => skipName(),
}));

const { NamePrompt } = await import("./NamePrompt");

/** The status query has resolved and React has rendered the result: a "renders nothing" check made earlier proves nothing. */
async function settled(calls: number) {
  await waitFor(() => expect(getNameStatus).toHaveBeenCalledTimes(calls));
  await Promise.allSettled(getNameStatus.mock.results.map((r) => r.value));
  await act(async () => {});
}

function renderPrompt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NamePrompt />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const m of [getNameStatus, checkDisplayName, confirmName, skipName]) m.mockReset();
  getNameStatus.mockResolvedValue({
    displayName: "Jenny Coon",
    needsPrompt: true,
    prefill: "Jenny",
  });
  checkDisplayName.mockResolvedValue({ problem: null, unverified: false });
});

describe("NamePrompt", () => {
  it("asks an unconfirmed learner, prefilled, and says the name is public", async () => {
    renderPrompt();
    const dialog = await screen.findByRole("dialog", {
      name: "What should other learners call you?",
    });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue("Jenny");
    expect(screen.getByText(/This name is public/)).toBeInTheDocument();
    expect(
      screen.getByText("If you skip, you'll appear as a learner name like Learner-4F2A."),
    ).toBeInTheDocument();
  });

  it("renders nothing for a confirmed learner", async () => {
    getNameStatus.mockResolvedValue({ displayName: "Ana", needsPrompt: false, prefill: "Ana" });
    renderPrompt();
    await settled(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders nothing when there is no profile row or the status cannot be read", async () => {
    getNameStatus.mockResolvedValueOnce(null);
    const first = renderPrompt();
    await settled(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    first.unmount();

    getNameStatus.mockRejectedValueOnce(new Error("boom"));
    const second = renderPrompt();
    await settled(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    second.unmount();
  });

  it("checks live and blocks saving a refused name with the shared copy", async () => {
    checkDisplayName.mockImplementation(async ({ data }: { data: { name: string } }) =>
      data.name === "Shithead"
        ? { problem: "blocked-content", unverified: false }
        : { problem: null, unverified: false },
    );
    const user = userEvent.setup();
    renderPrompt();
    const field = await screen.findByLabelText("Display name");
    await user.clear(field);
    await user.type(field, "Shithead");
    expect(await screen.findByText("That name isn't allowed. Try another.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save name" })).toBeDisabled();
  });

  it("applies the length rule without asking the server", async () => {
    const user = userEvent.setup();
    renderPrompt();
    const field = await screen.findByLabelText("Display name");
    checkDisplayName.mockClear();
    await user.clear(field);
    await user.type(field, "A");
    expect(await screen.findByText("That name is too short or too long.")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 500));
    expect(checkDisplayName).not.toHaveBeenCalledWith({ data: { name: "A" } });
  });

  it("ignores a stale check", async () => {
    let resolveOld: (v: unknown) => void = () => {};
    checkDisplayName.mockImplementation(({ data }: { data: { name: string } }) =>
      data.name === "Jenny"
        ? new Promise((r) => (resolveOld = r))
        : Promise.resolve({ problem: null, unverified: false }),
    );
    const user = userEvent.setup();
    renderPrompt();
    const field = await screen.findByLabelText("Display name");
    await waitFor(
      () => expect(checkDisplayName).toHaveBeenCalledWith({ data: { name: "Jenny" } }),
      {
        timeout: 2000,
      },
    );
    await user.type(field, "fer");
    await screen.findByText("Looks good.", {}, { timeout: 2000 });
    await act(async () => resolveOld({ problem: "blocked-content", unverified: false }));
    expect(screen.queryByText("That name isn't allowed. Try another.")).not.toBeInTheDocument();
  });

  it("saves and closes", async () => {
    confirmName.mockResolvedValue({ ok: true, name: "Jenny" });
    const user = userEvent.setup();
    renderPrompt();
    await screen.findByText("Looks good.", {}, { timeout: 2000 });
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(confirmName).toHaveBeenCalledWith({ data: { name: "Jenny" } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("skip closes through skip_display_name_prompt", async () => {
    skipName.mockResolvedValueOnce({ ok: true, name: "Learner-9C0D" });
    const user = userEvent.setup();
    renderPrompt();
    await user.click(await screen.findByRole("button", { name: "Skip for now" }));
    expect(skipName).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("skip failure still lets the learner continue (a prompt they cannot leave is a trap)", async () => {
    for (const failure of [
      () => skipName.mockResolvedValueOnce({ ok: false }),
      () => skipName.mockRejectedValueOnce(new TypeError("Failed to fetch")),
    ]) {
      failure();
      const user = userEvent.setup();
      const view = renderPrompt();
      await user.click(await screen.findByRole("button", { name: "Skip for now" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      view.unmount();
    }
  });

  it("keeps Tab inside the dialog in both directions", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <button>outside</button>
        <NamePrompt />
      </QueryClientProvider>,
    );
    const dialog = await screen.findByRole("dialog");
    await screen.findByText("Looks good.", {}, { timeout: 2000 });
    screen.getByLabelText("Display name").focus();
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement), `forward ${i}`).toBe(true);
    }
    for (let i = 0; i < 6; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement), `backward ${i}`).toBe(true);
    }
  });

  it("the AI consent sheet never opens over the name prompt, and appears once the prompt closes", async () => {
    function AskForConsent() {
      const { requestConsent } = useAiConsent();
      return <button onClick={() => void requestConsent()}>use AI</button>;
    }
    skipName.mockResolvedValue({ ok: true, name: "Learner-9C0D" });
    const api = { get: async () => null, set: async () => "2026-10-08T10:00:00Z" };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <AiConsentProvider api={api} initialGrantedAt={null} subscribeAuth={null}>
          <AskForConsent />
          <NamePrompt />
        </AiConsentProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole("dialog", { name: "What should other learners call you?" });
    // The page behind a modal is inert, so ask the way the app does: through the context, not a click.
    await act(async () => {
      screen.getByText("use AI").closest("button")?.click();
    });
    expect(screen.queryByText(AI_CONSENT_COPY.sheetTitle)).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(await screen.findByText(AI_CONSENT_COPY.sheetTitle)).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
