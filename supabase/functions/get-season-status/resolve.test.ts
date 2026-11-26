// Run inside the function directory: `deno test resolve.test.ts`.
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { latestDivision, settleCohort } from "./resolve.ts";

Deno.test("settleCohort asks the database to resolve the cohort and reports whether it did the work", async () => {
  const calls: unknown[] = [];
  const admin = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args]);
      return Promise.resolve({ data: true, error: null });
    },
  };
  assertEquals(await settleCohort(admin, "c1"), true);
  assertEquals(calls, [["resolve_season_cohort", { _cohort_id: "c1" }]]);
  assertEquals(await settleCohort({ rpc: () => Promise.resolve({ data: false, error: null }) }, "c1"), false);
});

Deno.test("settleCohort throws when the database refused, so the caller never reports a placement that was not written", async () => {
  const admin = { rpc: () => Promise.resolve({ data: null, error: { message: "injected" } }) };
  await assertRejects(() => settleCohort(admin, "c1"), Error, "injected");
});

function placements(rows: { division: number }[] | null, error: { message: string } | null = null) {
  const calls: string[] = [];
  const admin = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (col: string, v: string) => ({
          order: (orderCol: string, o: { ascending: boolean }) => ({
            limit: (n: number) => {
              calls.push(`${table}:${col}=${v}:${orderCol}:${o.ascending}:${n}`);
              return Promise.resolve({ data: rows, error });
            },
          }),
        }),
      }),
    }),
  };
  return { admin, calls };
}

Deno.test("latestDivision takes the newest placement of any week, and Division 1 for a new learner", async () => {
  const a = placements([{ division: 3 }]);
  assertEquals(await latestDivision(a.admin, "u1"), 3);
  assertEquals(a.calls, ["season_placements:user_id=u1:week_start:false:1"]);
  assertEquals(await latestDivision(placements([]).admin, "u1"), 1);
  assertEquals(await latestDivision(placements(null).admin, "u1"), 1);
});

Deno.test("latestDivision does not hide a failed read as Division 1", async () => {
  await assertRejects(() => latestDivision(placements(null, { message: "down" }).admin, "u1"), Error, "down");
});
