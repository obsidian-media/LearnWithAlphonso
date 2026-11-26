/**
 * The CEFR level a learner is at in one course, for rows made on their behalf (a review question written from a
 * lesson miss or a call). `language_progress.cefr_level` is the level the placement test and promotions set. A missing
 * row, a failed read or an unknown value is A1, the level every new learner starts at.
 */
const LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

type LevelReader = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        eq: (
          col: string,
          val: string,
        ) => {
          maybeSingle: () => PromiseLike<{ data: { cefr_level?: unknown } | null }>;
        };
      };
    };
  };
};

export async function currentCefrLevel(
  db: LevelReader,
  userId: string,
  course: string,
): Promise<string> {
  try {
    const { data } = await db
      .from("language_progress")
      .select("cefr_level")
      .eq("user_id", userId)
      .eq("language", course)
      .maybeSingle();
    const level = typeof data?.cefr_level === "string" ? data.cefr_level.toUpperCase() : "";
    return LEVELS.has(level) ? level : "A1";
  } catch {
    return "A1";
  }
}
