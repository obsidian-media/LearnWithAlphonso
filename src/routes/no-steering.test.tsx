// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * The iPhone app links to /terms, /privacy and /support, and each of those links back to "/". App Store rules
 * forbid steering an in-app buyer to a cheaper or different checkout, so none of these pages may link to the web
 * Hector page, the post-checkout page or RevenueCat's purchase pages, or show a price. They may describe web billing
 * in neutral words (that is a disclosure, not a link). Web Hector + Pro design, "Legal pages stay steering-free".
 */
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useNavigate: () => vi.fn(),
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

const PAGES = {
  "/": (await import("./index")).Route,
  "/terms": (await import("./terms")).Route,
  "/privacy": (await import("./privacy")).Route,
  "/support": (await import("./support")).Route,
  "/cookies": (await import("./cookies")).Route,
  "/accessibility": (await import("./accessibility")).Route,
};

const STEERING_HREF = /\/hector|\/pro-return|pay\.rev\.cat|rev\.cat\/|checkout|stripe\.com/i;
const PRICE = /[$€£]\s?\d|\d\s?(USD|CAD|EUR|GBP)\b/;

describe("pages the iPhone app links to never steer to web checkout", () => {
  it.each(Object.entries(PAGES))(
    "%s has no link to web Hector or checkout, and no price",
    (_path, route) => {
      const Page = route.options.component!;
      const { container } = render(<Page />);
      const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
      expect(hrefs.filter((h) => STEERING_HREF.test(h))).toEqual([]);
      expect(container.textContent ?? "").not.toMatch(PRICE);
      cleanup();
    },
  );

  it("the guard itself catches a steering link and a price", () => {
    expect(STEERING_HREF.test("/hector")).toBe(true);
    expect(STEERING_HREF.test("https://pay.rev.cat/abc/user")).toBe(true);
    expect(STEERING_HREF.test("/terms")).toBe(false);
    expect(PRICE.test("only $9.99 a month")).toBe(true);
    expect(PRICE.test("9,99 EUR")).toBe(true);
    expect(PRICE.test("You must be at least 13 years old")).toBe(false);
  });
});
