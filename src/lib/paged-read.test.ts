import { describe, expect, it } from "vitest";
import { readAllRows } from "./paged-read";

/** A table behind an API that cuts every response at `cap` rows, like PostgREST's max-rows. */
function cappedTable(total: number, cap: number, opts: { count?: boolean; failAt?: number } = {}) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const asked: [number, number][] = [];
  const page = async (from: number, to: number) => {
    asked.push([from, to]);
    if (opts.failAt !== undefined && asked.length === opts.failAt) {
      return { data: null, error: { message: "boom" }, count: null };
    }
    return {
      data: rows.slice(from, Math.min(to + 1, from + cap)),
      error: null,
      count: opts.count === false ? null : total,
    };
  };
  return { page, asked };
}

describe("readAllRows", () => {
  it("reads past a server cap smaller than the page size (it continues from what it received)", async () => {
    const { page } = cappedTable(8, 3);
    const out = await readAllRows(page, 1000);
    expect(out.error).toBeNull();
    expect(out.data?.map((r) => r.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("reads exactly the pages it needs when the cap matches the page size", async () => {
    const { page, asked } = cappedTable(25, 10);
    const out = await readAllRows(page, 10);
    expect(out.data).toHaveLength(25);
    expect(asked).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  it("makes one request for a small table and stops on a short page without a count", async () => {
    const { page, asked } = cappedTable(4, 1000, { count: false });
    const out = await readAllRows(page, 1000);
    expect(out.data).toHaveLength(4);
    expect(asked).toHaveLength(1);
  });

  it("an empty table is an empty list, not an error", async () => {
    const { page } = cappedTable(0, 1000);
    expect(await readAllRows(page)).toEqual({ data: [], error: null });
  });

  it("a page that fails fails the whole read: never a partial list", async () => {
    const { page } = cappedTable(8, 3, { failAt: 2 });
    expect(await readAllRows(page, 1000)).toEqual({ data: null, error: { message: "boom" } });
  });

  it("an empty page before the exact count is reached is an error, not a quiet partial list", async () => {
    const out = await readAllRows(async () => ({ data: [], error: null, count: 5 }), 10);
    expect(out.data).toBeNull();
    expect(out.error?.message).toMatch(/incomplete/);
  });

  it("an endless table is an error, not an endless loop", async () => {
    const out = await readAllRows(
      async () => ({ data: [{ id: 1 }], error: null, count: 1_000_000 }),
      1,
    );
    expect(out.data).toBeNull();
    expect(out.error?.message).toMatch(/too many pages/);
  });
});
