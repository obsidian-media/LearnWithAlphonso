// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
    const { container } = renderPrompt();
    await settled(1);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no profile row or the status cannot be read", async () => {
    getNameStatus.mockResolvedValueOnce(null);
    const first = renderPrompt();
    await settled(1);
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();

    getNameStatus.mockRejectedValueOnce(new Error("boom"));
    const second = renderPrompt();
    await settled(2);
    expect(second.container).toBeEmptyDOMElement();
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

  it("skip closes through skip_display_name_prompt, and a failed skip stays open with a message", async () => {
    skipName.mockResolvedValueOnce({ ok: false });
    const user = userEvent.setup();
    renderPrompt();
    await user.click(await screen.findByRole("button", { name: "Skip for now" }));
    expect(await screen.findByText("Couldn't save your name. Try again.")).toBeInTheDocument();
    skipName.mockResolvedValueOnce({ ok: true, name: "Learner-9C0D" });
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
