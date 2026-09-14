import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProgress from "./tools/get-my-progress";
import getDueReviews from "./tools/get-due-reviews";
import listLessons from "./tools/list-lessons";
import getLeaderboard from "./tools/get-leaderboard";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "english-buddy-app",
  title: "English Buddy App",
  version: "0.1.0",
  instructions:
    "Tools for the English Buddy learning app. Use `get_my_progress` for the learner's level, XP and streak, `get_due_reviews` for spaced-repetition items due today, `list_lessons` to browse the CEFR lesson catalogue, and `get_leaderboard` for XP rankings.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProgress, getDueReviews, listLessons, getLeaderboard],
});
