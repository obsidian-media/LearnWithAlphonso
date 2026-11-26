// The two reads/writes get-season-status makes about a finished week, apart from the HTTP handling so a test can
// drive them with a fake client. The ranking itself is the database's (resolve_season_cohort, migration
// 20261128150000): placements and resolved_at are written in ONE transaction, so a failed insert can never leave the
// cohort marked resolved. season-math.ts stays the reference the database ranking is tested against.

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

type PlacementReader = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, v: string) => {
        order: (col: string, o: { ascending: boolean }) => {
          limit: (n: number) => PromiseLike<{ data: { division: number }[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
};

/** Settles one finished cohort. Throws when the database refused (nothing was written); true when it did the work. */
export async function settleCohort(admin: RpcClient, cohortId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("resolve_season_cohort", { _cohort_id: cohortId });
  if (error) throw new Error(`resolve_season_cohort failed: ${error.message}`);
  return data === true;
}

/**
 * The division a learner starts this week in: the one from their LATEST placement of any week (so a learner who missed
 * a week, or whose last cohort was settled by the sweep, keeps what they earned), else Division 1.
 */
export async function latestDivision(admin: PlacementReader, userId: string): Promise<number> {
  const { data, error } = await admin
    .from("season_placements")
    .select("division")
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(1);
  if (error) throw new Error(`could not read placements: ${error.message}`);
  return data?.[0]?.division ?? 1;
}
