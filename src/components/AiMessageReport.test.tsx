// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiMessageReport } from "./AiMessageReport";

vi.mock("@/lib/social-safety.functions", () => ({ reportAiResponse: vi.fn() }));
afterEach(cleanup);

describe("AiMessageReport", () => {
  it("sends the chosen reason with the message capped to the database limit, then thanks the learner", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const user = userEvent.setup();
    render(
      <AiMessageReport
        message={"x".repeat(5000)}
        surface="conversation"
        course="en"
        scenarioId="coffee"
        send={send}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Report this response" }));
    await user.click(screen.getByLabelText("Harmful or unsafe"));
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      reason: "ai_harmful",
      context: {
        message: "x".repeat(2500),
        surface: "conversation",
        course: "en",
        scenario_id: "coffee",
      },
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Thanks. We'll review this response.",
    );
  });

  it("shows a failure and keeps the form when the report cannot be sent", async () => {
    const user = userEvent.setup();
    render(
      <AiMessageReport
        message="hi"
        surface="campaign"
        course="fr"
        campaignId="city-day"
        sceneIndex={1}
        send={async () => ({ ok: false })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Report this response" }));
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't send your report");
    expect(screen.getByRole("button", { name: "Send report" })).toBeInTheDocument();
  });

  it("never splits an emoji when it shortens a long message", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const user = userEvent.setup();
    // 2600 emoji: each is two UTF-16 units, so cutting by UTF-16 units could leave half of one.
    render(
      <AiMessageReport
        message={"😀".repeat(2600)}
        surface="conversation"
        course="en"
        send={send}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Report this response" }));
    await user.click(screen.getByRole("button", { name: "Send report" }));
    const sent = (send.mock.calls[0] as unknown as [{ context: { message: string } }])[0].context
      .message;
    expect(Array.from(sent)).toHaveLength(2500);
    expect(sent).toBe("😀".repeat(2500));
  });

  it("is a real modal: focus moves in and stays in, the page is inert, Escape closes it", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <p>page behind</p>
        <AiMessageReport
          message="hi"
          surface="conversation"
          course="en"
          send={async () => ({ ok: true })}
        />
      </div>,
    );
    const opener = screen.getByRole("button", { name: "Report this response" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-describedby", "ai-report-note");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(opener.closest("[inert]")).not.toBeNull();
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener.closest("[inert]")).toBeNull();
  });
});
