import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { curriculum } from "../../../data/curriculum";

export default defineTool({
  name: "list_lessons",
  title: "Browse the lesson catalogue",
  description:
    "Search or browse the English lesson catalogue by CEFR level (A1, A2, B1, B2, C1) and an optional keyword.",
  inputSchema: {
    level: z.string().optional().describe("CEFR level filter, e.g. A1, A2, B1, B2 or C1."),
    query: z.string().optional().describe("Keyword to match against unit and lesson titles."),
    limit: z.number().optional().describe("Maximum lessons to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ level, query, limit }) => {
    const lvl = level?.trim().toUpperCase();
    const q = query?.trim().toLowerCase();
    const max = Math.min(Math.max(limit ?? 25, 1), 100);
    const rows: { lessonId: string; title: string; level: string; unit: string; questions: number }[] =
      [];
    for (const unit of curriculum) {
      if (lvl && unit.level !== lvl) continue;
      for (const lesson of unit.lessons) {
        const hay = `${unit.title} ${lesson.title} ${lesson.subtitle}`.toLowerCase();
        if (q && !hay.includes(q)) continue;
        rows.push({
          lessonId: lesson.id,
          title: lesson.title,
          level: unit.level,
          unit: unit.title,
          questions: lesson.questions.length,
        });
        if (rows.length >= max) break;
      }
      if (rows.length >= max) break;
    }
    return {
      content: [
        {
          type: "text",
          text: rows.length ? JSON.stringify(rows, null, 2) : "No lessons matched that search.",
        },
      ],
      structuredContent: { count: rows.length, lessons: rows },
    };
  },
});
