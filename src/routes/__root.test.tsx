// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invalidate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useRouter: () => ({ invalidate }),
  };
});

const reportError = vi.fn();
vi.mock("../lib/error-reporting", () => ({ reportError }));

// Avoid importing the real ?url-suffixed CSS asset (a Vite-only import
// specifier that doesn't resolve under plain vitest module resolution).
vi.mock("../styles.css?url", () => ({ default: "/styles.css" }));

const { Route } = await import("./__root");

beforeEach(() => {
  invalidate.mockClear();
  reportError.mockClear();
});

describe("NotFoundComponent", () => {
  it("shows a 404 message with a link home", () => {
    // The real component ignores its props entirely; the type requires
    // them anyway since it's typed generically for any route's 404.
    const NotFound = Route.options.notFoundComponent! as React.ComponentType<object>;
    render(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  });
});

describe("ErrorComponent", () => {
  it("reports the error once on mount", () => {
    const ErrorComponent = Route.options.errorComponent! as React.ComponentType<{
      error: unknown;
      reset: () => void;
    }>;
    const error = new Error("boom");
    render(<ErrorComponent error={error} reset={() => {}} />);
    expect(reportError).toHaveBeenCalledWith(error, { boundary: "tanstack_root_error_component" });
  });

  it("invalidates the router and resets on 'Try again'", async () => {
    const ErrorComponent = Route.options.errorComponent! as React.ComponentType<{
      error: unknown;
      reset: () => void;
    }>;
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<ErrorComponent error={new Error("boom")} reset={reset} />);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(invalidate).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });

  it("offers a link back home", () => {
    const ErrorComponent = Route.options.errorComponent! as React.ComponentType<{
      error: unknown;
      reset: () => void;
    }>;
    render(<ErrorComponent error={new Error("boom")} reset={() => {}} />);
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  });
});
