import type { Course } from "@/data/courses";
import { CAMPAIGNS, campaignPrompt } from "@/data/campaigns";
import { CONTENT_COURSES, SCENARIOS } from "@/data/scenarios";

/**
 * Which course a persona prompt belongs to. /api/chat takes the language of its safety fallback and output mask from
 * the prompt it matched, not from a field the client could set to mask a different language's words.
 */
const COURSE_BY_PROMPT: ReadonlyMap<string, Course> = new Map<string, Course>([
  ...SCENARIOS.flatMap((s) => CONTENT_COURSES.map((c) => [s.systemPrompt[c], c] as const)),
  ...CAMPAIGNS.flatMap((camp) =>
    camp.scenes.flatMap((scene) =>
      CONTENT_COURSES.map(
        (c) => [campaignPrompt(camp.premise[c], scene.systemPrompt[c]), c] as const,
      ),
    ),
  ),
]);

export function courseOfSystemPrompt(prompt: string): Course | undefined {
  return COURSE_BY_PROMPT.get(prompt);
}
