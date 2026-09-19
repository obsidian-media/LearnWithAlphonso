import { describe, expect, it } from "vitest";
import { renderErrorPage } from "./error-page";

describe("renderErrorPage", () => {
  it("returns a full HTML document with a retry and a home link", () => {
    const html = renderErrorPage();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("This page didn't load");
    expect(html).toContain('href="/"');
    expect(html).toContain("location.reload()");
  });
});
