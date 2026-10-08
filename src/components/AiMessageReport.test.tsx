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
});
