// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { REFERRAL_STORAGE_KEY, readPendingRef } from "@/lib/referral";

const navigate = vi.fn();
let params = { code: "29d081151d67" };

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useNavigate: () => navigate };
});

const { Route } = await import("./r.$code");

function visit(code: string) {
  params = { code };
  // Route.useParams is the router's hook; the page only needs its answer.
  (Route as unknown as { useParams: () => { code: string } }).useParams = () => params;
  const Page = Route.options.component!;
  return render(<Page />);
}

afterEach(() => {
  window.localStorage.clear();
  navigate.mockClear();
});

describe("/r/<code> referral share link", () => {
  it("keeps the code where ?ref= keeps it, then sends the visitor to the landing page", () => {
    visit("29d081151d67");
    expect(readPendingRef(window.localStorage)).toBe("29d081151d67");
    expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("ignores a junk code but still lands on the home page", () => {
    visit("<script>");
    expect(window.localStorage.getItem(REFERRAL_STORAGE_KEY)).toBeNull();
    expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("keeps the first code when a later link arrives", () => {
    visit("FirstCode1");
    visit("SecondCode2");
    expect(readPendingRef(window.localStorage)).toBe("FirstCode1");
  });
});
