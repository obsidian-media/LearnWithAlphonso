import { beforeEach, describe, expect, it, vi } from "vitest";

const exportMyData = vi.fn();
vi.mock("@/lib/account.functions", () => ({ exportMyData }));

const { Route } = await import("./account-export");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: () => Promise<Response>;
  }
).POST;

beforeEach(() => {
  exportMyData.mockReset();
});

describe("POST /api/account-export", () => {
  it("flattens the export into one document, same shape profile.tsx's download() builds client-side", async () => {
    exportMyData.mockResolvedValue({
      exported_at: "2026-09-25T00:00:00.000Z",
      user_id: "user-1",
      tables: JSON.stringify({ review_items: [{ item_key: "u1l1:q1" }], profiles: { display_name: "Ada" } }),
    });

    const res = await handler();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      exported_at: "2026-09-25T00:00:00.000Z",
      user_id: "user-1",
      review_items: [{ item_key: "u1l1:q1" }],
      profiles: { display_name: "Ada" },
    });
  });

  it("maps an auth failure to 401", async () => {
    exportMyData.mockRejectedValue(new Error("Unauthorized: Invalid token"));
    const res = await handler();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized: Invalid token" });
  });

  it("maps any other failure to 500", async () => {
    exportMyData.mockRejectedValue(new Error("boom"));
    const res = await handler();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
