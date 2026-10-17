// Supabase Edge Function: complete-lesson. The handler lives in handler.ts (tested by handler.test.ts with fake
// dependencies); this file only wires the production ones and serves it.
import { createCompleteLessonHandler, liveDeps } from "./handler.ts";

Deno.serve(createCompleteLessonHandler(liveDeps()));
