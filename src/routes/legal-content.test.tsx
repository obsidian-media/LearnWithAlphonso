// src/routes/legal-content.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import {
  LEGAL_FORBIDDEN_PHRASES,
  LEGAL_REQUIRED_PHRASES,
  SUPPORT_EMAIL,
  htmlToText,
  type LegalPath,
} from "@/lib/legal-required-phrases";

// LegalPage renders a router <Link>; outside a router it needs a plain anchor.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

const ROUTES = {
  "/terms": (await import("./terms")).Route,
  "/privacy": (await import("./privacy")).Route,
  "/cookies": (await import("./cookies")).Route,
  "/support": (await import("./support")).Route,
} as const;

const PATHS = Object.keys(ROUTES) as LegalPath[];

function pageText(path: LegalPath): string {
  const Component = ROUTES[path].options.component!;
  return htmlToText(renderToStaticMarkup(<Component />));
}

describe("htmlToText", () => {
  it("drops head, script and style so neither the title nor the hydration payload can satisfy a phrase", () => {
    const html =
      "<html><head><title>Terms of Use — Alphonso</title></head><body>" +
      '<script>$R={t:"Terms of Use"}</script><style>.x{}</style><p>Body only</p></body></html>';
    expect(htmlToText(html)).toBe("Body only");
  });

  it("removes React text separators without inserting a space, and decodes entities", () => {
    expect(htmlToText("<p>write to <!-- -->a@b.app<!-- -->.</p>")).toBe("write to a@b.app.");
    expect(htmlToText("<p>Apple&#x27;s &amp; Google&#39;s &quot;terms&quot;</p>")).toBe(
      `Apple's & Google's "terms"`,
    );
  });
});

describe.each(PATHS)("legal page %s", (path) => {
  const text = pageText(path);

  it.each(LEGAL_REQUIRED_PHRASES[path].map((p) => [p]))("says %s", (phrase) => {
    expect(text).toContain(phrase);
  });

  it.each(LEGAL_FORBIDDEN_PHRASES[path].map((p) => [p]))("no longer says %s", (phrase) => {
    expect(text).not.toContain(phrase);
  });

  it("names no contact address except support@", () => {
    const addresses = new Set(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []);
    expect([...addresses]).toEqual([SUPPORT_EMAIL]);
  });

  it("has no literal double hyphen", () => {
    expect(text).not.toContain("--");
  });
});

describe("Terms title", () => {
  it("is Terms of Use in head(), matching the iOS, Android and App Store links", async () => {
    const meta = (await ROUTES["/terms"].options.head?.({} as never))?.meta ?? [];
    const titles = meta.flatMap((m) => (m && "title" in m ? [m.title] : []));
    expect(titles).toEqual(["Terms of Use — Alphonso"]);
  });
});

describe("legal pages share one 'Last updated' date", () => {
  it("shows the same date on terms, privacy, cookies and support", () => {
    const dates = PATHS.map((p) => pageText(p).match(/Last updated (\d{1,2} [A-Z][a-z]+ \d{4})/)?.[1]);
    expect(dates.every(Boolean)).toBe(true);
    expect(new Set(dates).size).toBe(1);
  });
});
