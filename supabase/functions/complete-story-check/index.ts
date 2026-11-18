// Supabase Edge Function: complete-story-check. The handler lives in handler.ts (tested by handler.test.ts with fake
// dependencies); this file only wires the production ones and serves it.
import { createCompleteStoryCheckHandler, liveDeps } from "./handler.ts";

Deno.serve(createCompleteStoryCheckHandler(liveDeps()));
