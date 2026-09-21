import { createFileRoute } from "@tanstack/react-router";
import { getCourse, type Course } from "@/data/courses";
import type { Question } from "@/data/curriculum";
import { generatePracticeQuestions } from "@/lib/practice-generation.server";

/**
 * V3 pkg 4b: "generative sentence content." On-demand extra practice for
 * a specific lesson -- never persisted, never counted toward XP/hearts/
 * review scheduling (see practice-generation.server.ts's doc comment).
 * The trust boundary here is `consumeQuota`'s auth check, same as
 * analyze-weaknesses.ts; there's nothing else to trust-check since
 * nothing this returns is ever written anywhere.
 */
function sampleAnswer(q: Question): string | null {
  if (q.type === "mc") return q.choices[q.answer] ?? null;
  if (q.type === "fill") return q.answer;
  return null; // reorder: a whole-sentence answer isn't a good short example
}

export const Route = createFileRoute("/api/generate-practice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.NVIDIA_API_KEY;
        if (!key)
          return Response.json({ error: "Practice generation is not configured" }, { status: 500 });

        const { consumeQuota } = await import("@/lib/ai-quota.server");
        const quota = await consumeQuota(request, "chat");
        if (!quota.ok) return Response.json({ error: quota.message }, { status: quota.status });

        let body: { lessonId?: string; course?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const lessonId = typeof body.lessonId === "string" ? body.lessonId : "";
        const course: Course = body.course === "fr" ? "fr" : "en";
        if (!lessonId) return Response.json({ error: "Missing lessonId" }, { status: 400 });

        const found = getCourse(course).findLesson(lessonId);
        if (!found) return Response.json({ error: "Unknown lesson" }, { status: 400 });

        const sampleQuestions = found.lesson.questions
          .map((q) => ({ prompt: q.prompt, answer: sampleAnswer(q) }))
          .filter((s): s is { prompt: string; answer: string } => s.answer !== null)
          .slice(0, 5);

        const questions = await generatePracticeQuestions({
          topic: `${found.lesson.title} -- ${found.lesson.subtitle}`,
          sampleQuestions,
          nvidiaApiKey: key,
          nvidiaModel: process.env.NVIDIA_CHAT_MODEL || "meta/llama-3.1-70b-instruct",
        });

        return Response.json({ questions });
      },
    },
  },
});
