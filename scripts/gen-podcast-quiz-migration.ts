// Regenerates the podcast quiz seed migrations from src/data/podcast-quizzes.ts.
//   bun scripts/gen-podcast-quiz-migration.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { PODCAST_QUIZZES, PODCAST_QUIZZES_R47 } from "../src/data/podcast-quizzes";
import { buildPodcastQuizSeedSql } from "../src/lib/podcast-quiz-seed";

const dir = path.join(import.meta.dirname, "../supabase/migrations");
const targets: [string, Parameters<typeof buildPodcastQuizSeedSql>[0]][] = [
  ["20261104100300_podcast_quiz_seed.sql", PODCAST_QUIZZES],
  ["20261121100000_podcast_quiz_seed_r47.sql", PODCAST_QUIZZES_R47],
];
for (const [file, quizzes] of targets) {
  writeFileSync(path.join(dir, file), buildPodcastQuizSeedSql(quizzes));
  console.log(`wrote ${file}`);
}
