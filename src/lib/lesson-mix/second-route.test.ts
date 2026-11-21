import { describe, expect, it } from "vitest";
import { MODELS, mistralUsageUsd } from "../content-review/pricing";
import { OPENROUTER_URL, resolveSecondRoute } from "../../../scripts/lesson-mix/second-route";

const body = { temperature: 0, top_p: 1, reasoning_effort: "low", max_tokens: 9, messages: [] };

describe("second-opinion route", () => {
  it("defaults to api.mistral.ai with the Mistral key and an untouched body", () => {
    const r = resolveSecondRoute({}, "mistral-large-4");
    expect(r.route).toBe("mistral");
    expect(r.url).toBe("https://api.mistral.ai/v1/chat/completions");
    expect(r.keyEnv).toBe("MISTRAL_API_KEY");
    expect(r.model).toBe("mistral-large-4");
    expect(r.shapeBody(body)).toBe(body);
  });

  it("honours the model override on the direct route", () => {
    expect(
      resolveSecondRoute({ LESSON_MIX_MISTRAL_MODEL: "mistral-medium-latest" }, "x").model,
    ).toBe("mistral-medium-latest");
  });

  it("openrouter: its URL, its key variable, Large 4, pinned to Mistral with no fallbacks", () => {
    const r = resolveSecondRoute({ LESSON_MIX_SECOND_ROUTE: "openrouter" }, "mistral-large-4");
    expect(r.url).toBe(OPENROUTER_URL);
    expect(r.keyEnv).toBe("OPENROUTER_API_KEY");
    expect(r.model).toBe("mistralai/mistral-large-4-0");
    const b = r.shapeBody(body);
    expect(b.provider).toEqual({ order: ["mistral"], allow_fallbacks: false });
    expect(b.reasoning).toEqual({ effort: "low" });
    expect(b).not.toHaveProperty("reasoning_effort");
    expect(b).not.toHaveProperty("top_p");
    expect(b.max_tokens).toBe(9);
  });

  it("rejects an unknown route", () => {
    expect(() => resolveSecondRoute({ LESSON_MIX_SECOND_ROUTE: "x" }, "m")).toThrow(
      /mistral or openrouter/,
    );
  });

  it("the OpenRouter model is priced (upper bound, full price)", () => {
    expect(MODELS["mistralai/mistral-large-4-0"].input).toBe(0.7);
    expect(
      mistralUsageUsd(
        "mistralai/mistral-large-4-0",
        { prompt_tokens: 1e6, completion_tokens: 1e6 },
        false,
      ),
    ).toBeCloseTo(2.8);
  });
});
