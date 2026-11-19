// Supabase Edge Function: start-lesson-session. The handler lives in handler.ts (tested by handler.test.ts with fake
// dependencies); this file only wires the production ones and serves it.
import { createStartLessonSessionHandler, liveDeps } from "./handler.ts";

Deno.serve(createStartLessonSessionHandler(liveDeps()));
