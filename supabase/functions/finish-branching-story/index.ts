// Supabase Edge Function: finish-branching-story. The handler lives in handler.ts (tested by handler.test.ts with fake
// dependencies); this file only wires the production ones and serves it.
import { createFinishBranchingStoryHandler, liveDeps } from "./handler.ts";

Deno.serve(createFinishBranchingStoryHandler(liveDeps()));
