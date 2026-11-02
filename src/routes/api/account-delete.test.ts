import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteMyAccount = vi.fn();
vi.mock("@/lib/account.functions", () => ({ deleteMyAccount }));

const { Route } = await import("./account-delete");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;

function req(body: unknown) {
  return new Request("https://example.com/api/account-delete", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  deleteMyAccount.mockReset();
});

describe("POST /api/account-delete", () => {
  it("passes the confirm value through to deleteMyAccount and returns its result", async () => {
    deleteMyAccount.mockResolvedValue({ deleted: true });

    const res = await handler({ request: req({ confirm: "DELETE" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(deleteMyAccount).toHaveBeenCalledWith({ data: { confirm: "DELETE" } });
  });

  it("rejects a request with no JSON body", async () => {
    const res = await handler({
      request: new Request("https://example.com/api/account-delete", { method: "POST" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
    expect(deleteMyAccount).not.toHaveBeenCalled();
  });

  it("rejects a wrong confirmation with a stable public message", async () => {
    const res = await handler({ request: req({ confirm: "delete" }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid confirmation" });
    expect(deleteMyAccount).not.toHaveBeenCalled();
  });

  it("maps an auth failure to 401", async () => {
    deleteMyAccount.mockRejectedValue(new Error("Unauthorized: No authorization header provided"));
    const res = await handler({ request: req({ confirm: "DELETE" }) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("hides an internal deletion failure and returns 500", async () => {
    deleteMyAccount.mockRejectedValue(
      new Error("Account deletion could not clear owned data: review_items: permission denied"),
    );
    const res = await handler({ request: req({ confirm: "DELETE" }) });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Deletion failed" });
  });
});
