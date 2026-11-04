// Regenerates the podcast quiz seed migration from src/data/podcast-quizzes.ts.
//   bun scripts/gen-podcast-quiz-migration.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { PODCAST_QUIZZES } from "../src/data/podcast-quizzes";
import { buildPodcastQuizSeedSql } from "../src/lib/podcast-quiz-seed";

const target = path.join(
  import.meta.dirname,
  "../supabase/migrations/20261104100300_podcast_quiz_seed.sql",
);
writeFileSync(target, buildPodcastQuizSeedSql(PODCAST_QUIZZES));
console.log(`wrote ${path.basename(target)}`);
