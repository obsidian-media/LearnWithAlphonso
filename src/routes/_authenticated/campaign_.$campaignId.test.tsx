// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

const getSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession } },
}));

const fetchProgress = vi.fn();
vi.mock("../../lib/sync.functions", () => ({ fetchProgress }));

const { Route } = await import("./campaign_.$campaignId");
const { getCampaign } = await import("../../data/campaigns");

const campaign = getCampaign("city-day")!;
// @ts-expect-error -- same override pattern as converse_.$scenarioId.test.tsx.
Route.useLoaderData = () => ({ campaign });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function renderPage() {
  const Page = Route.options.component!;
  return render(<Page />);
}

/** Types and sends `text`, then waits for `reply` to appear as an assistant bubble. */
async function sendAndAwaitReply(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
  reply: string,
) {
  await user.type(screen.getByPlaceholderText("Type or tap the mic"), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText(reply)).toBeInTheDocument();
}

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
  fetchProgress.mockReset();
  fetchProgress.mockResolvedValue({ cefrLevel: "B1" });
  vi.stubGlobal(
    "Audio",
    class {
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      onended: (() => void) | null = null;
      constructor(public src: string) {}
    },
  );
  Object.defineProperty(global.URL, "createObjectURL", {
    value: vi.fn(() => "blob:mock-url"),
    configurable: true,
  });
  Object.defineProperty(global.URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
  });
  let n = 0;
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/tts")) return new Response(new Blob(["audio"]), { status: 200 });
    if (url.includes("/api/chat")) {
      n += 1;
      return jsonResponse({ content: `Reply ${n}` });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});

describe("Campaign chat page", () => {
  it("renders the campaign header, first scene's progress label, and opener", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: campaign.title })).toBeInTheDocument();
    expect(
      screen.getByText(`Scene 1 of ${campaign.scenes.length} — ${campaign.scenes[0].title}`),
    ).toBeInTheDocument();
    expect(screen.getByText(campaign.scenes[0].opener)).toBeInTheDocument();
  });

  it("sends the composed premise+scene systemPrompt and the full transcript so far", async () => {
    const user = userEvent.setup();
    renderPage();
    await sendAndAwaitReply(user, "One latte please", "Reply 1");

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([u]) =>
      String(u).includes("/api/chat"),
    )!;
    const body = JSON.parse(init.body as string);
    expect(body.systemPrompt).toBe(`${campaign.premise}\n\n${campaign.scenes[0].systemPrompt}`);
    expect(body.messages).toEqual([
      { role: "assistant", content: campaign.scenes[0].opener },
      { role: "user", content: "One latte please" },
    ]);
  });

  it("does not show Continue until the scene's minTurns is reached, then advances and carries the transcript forward", async () => {
    const user = userEvent.setup();
    renderPage();
    const scene = campaign.scenes[0];

    expect(screen.queryByRole("button", { name: /Continue:/ })).not.toBeInTheDocument();

    for (let i = 0; i < scene.minTurns; i++) {
      await sendAndAwaitReply(user, `turn ${i}`, `Reply ${i + 1}`);
    }

    const continueButton = await screen.findByRole("button", { name: /Continue:/ });
    await user.click(continueButton);

    // Now on scene 2: progress label updated, its opener shown.
    expect(
      screen.getByText(`Scene 2 of ${campaign.scenes.length} — ${campaign.scenes[1].title}`),
    ).toBeInTheDocument();
    expect(screen.getByText(campaign.scenes[1].opener)).toBeInTheDocument();
    // Scene 1's transcript is still visible/sent -- continuity across scenes.
    expect(screen.getByText(scene.opener)).toBeInTheDocument();

    await sendAndAwaitReply(user, "excuse me", `Reply ${scene.minTurns + 1}`);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      .filter(([u]) => String(u).includes("/api/chat"))
      .pop()!;
    const body = JSON.parse(init.body as string);
    expect(body.systemPrompt).toBe(`${campaign.premise}\n\n${campaign.scenes[1].systemPrompt}`);
    // First message in the sent history is still scene 1's opener.
    expect(body.messages[0]).toEqual({ role: "assistant", content: scene.opener });
  });

  it("restarting the current scene truncates the transcript back to that scene's opener", async () => {
    const user = userEvent.setup();
    renderPage();
    await sendAndAwaitReply(user, "hello there", "Reply 1");
    expect(screen.getByText("hello there")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restart this scene" }));

    expect(screen.queryByText("hello there")).not.toBeInTheDocument();
    expect(screen.getByText(campaign.scenes[0].opener)).toBeInTheDocument();
  });

  it("shows a completion state after finishing the last scene", async () => {
    const user = userEvent.setup();
    renderPage();

    for (const scene of campaign.scenes) {
      for (let i = 0; i < scene.minTurns; i++) {
        await user.type(screen.getByPlaceholderText("Type or tap the mic"), `msg ${i}`);
        await user.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() =>
          expect(
            (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) =>
              String(u).includes("/api/chat"),
            ).length,
          ).toBeGreaterThan(0),
        );
      }
      const button = await screen.findByRole("button", { name: /Continue:|Finish campaign/ });
      await user.click(button);
    }

    expect(await screen.findByText("Nice work — campaign complete!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Practice" })).toHaveAttribute(
      "href",
      "/converse",
    );
    // The composer is gone once the campaign is finished.
    expect(screen.queryByPlaceholderText("Type or tap the mic")).not.toBeInTheDocument();
  });
});
