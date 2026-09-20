import { beforeEach, describe, expect, it, vi } from "vitest";

const renderErrorPage = vi.fn(() => "<html>error</html>");
vi.mock("./lib/error-page", () => ({ renderErrorPage }));

vi.mock("@/integrations/supabase/auth-attacher", () => ({ attachSupabaseAuth: {} }));

const { startInstance } = await import("./start");

beforeEach(() => {
  renderErrorPage.mockClear();
});

describe("start.ts error middleware", () => {
  it("passes through a successful response", async () => {
    const errorMiddleware = (await startInstance.getOptions()).requestMiddleware![0] as unknown as {
      options: { server: (opts: { next: () => Promise<unknown> }) => Promise<unknown> };
    };
    const ok = new Response("ok");
    const result = await errorMiddleware.options.server({ next: async () => ok });
    expect(result).toBe(ok);
  });

  it("rethrows an error carrying a statusCode (e.g. a router redirect)", async () => {
    const errorMiddleware = (await startInstance.getOptions()).requestMiddleware![0] as unknown as {
      options: { server: (opts: { next: () => Promise<unknown> }) => Promise<unknown> };
    };
    const redirectError = Object.assign(new Error("redirect"), { statusCode: 302 });
    await expect(
      errorMiddleware.options.server({
        next: async () => {
          throw redirectError;
        },
      }),
    ).rejects.toBe(redirectError);
  });

  it("swallows a plain error into a 500 HTML error page", async () => {
    const errorMiddleware = (await startInstance.getOptions()).requestMiddleware![0] as unknown as {
      options: { server: (opts: { next: () => Promise<unknown> }) => Promise<unknown> };
    };
    const result = (await errorMiddleware.options.server({
      next: async () => {
        throw new Error("boom");
      },
    })) as Response;
    expect(result.status).toBe(500);
    expect(result.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await result.text()).toBe("<html>error</html>");
    expect(renderErrorPage).toHaveBeenCalled();
  });

  it("registers attachSupabaseAuth as a function middleware", async () => {
    expect((await startInstance.getOptions()).functionMiddleware).toHaveLength(1);
  });
});
