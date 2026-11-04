// Supabase Edge Function: complete-podcast-quiz. The handler lives in handler.ts (tested by handler.test.ts with fake
// dependencies); this file only wires the production ones and serves it.
import { createCompletePodcastQuizHandler, liveDeps } from "./handler.ts";

Deno.serve(createCompletePodcastQuizHandler(liveDeps()));
