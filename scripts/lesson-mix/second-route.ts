/**
 * Where the lesson-mix Mistral second opinion is sent. Direct (api.mistral.ai) is the default; the
 * owner's account is 403 on Large 4 and 429 on Medium/Small, so LESSON_MIX_SECOND_ROUTE=openrouter
 * sends it through OpenRouter with the owner's Mistral key (BYOK), pinned to the Mistral provider.
 * Keys come from MISTRAL_API_KEY[_FILE] or OPENROUTER_API_KEY[_FILE]; the script reads them itself.
 */
export type SecondRoute = {
  route: "mistral" | "openrouter";
  url: string;
  model: string;
  /** The env var NAME that holds (or points at a file holding) the key. */
  keyEnv: "MISTRAL_API_KEY" | "OPENROUTER_API_KEY";
  /** Rewrites the shared request body for this route. */
  shapeBody: (body: Record<string, unknown>) => Record<string, unknown>;
};

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_DEFAULT_MODEL = "mistralai/mistral-large-4-0";

export function resolveSecondRoute(
  env: Record<string, string | undefined>,
  defaultDirectModel: string,
): SecondRoute {
  const route = (env.LESSON_MIX_SECOND_ROUTE ?? "mistral").trim().toLowerCase();
  if (route === "openrouter")
    return {
      route: "openrouter",
      url: OPENROUTER_URL,
      model: env.LESSON_MIX_MISTRAL_MODEL ?? OPENROUTER_DEFAULT_MODEL,
      keyEnv: "OPENROUTER_API_KEY",
      shapeBody: (body) => {
        const { reasoning_effort, top_p: _topP, ...rest } = body;
        return {
          ...rest,
          reasoning: { effort: reasoning_effort ?? "low" },
          // Only Mistral's own endpoint, never a fallback host (the BYOK key is Mistral's).
          provider: { order: ["mistral"], allow_fallbacks: false },
        };
      },
    };
  if (route !== "mistral")
    throw new Error(`LESSON_MIX_SECOND_ROUTE must be mistral or openrouter, not "${route}".`);
  return {
    route: "mistral",
    url: "https://api.mistral.ai/v1/chat/completions",
    model: env.LESSON_MIX_MISTRAL_MODEL ?? defaultDirectModel,
    keyEnv: "MISTRAL_API_KEY",
    shapeBody: (body) => body,
  };
}
