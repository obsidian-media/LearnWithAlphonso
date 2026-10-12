import { test, expect } from "@playwright/test";

/**
 * Fonts are served from this site. Loading them from a font CDN would send every visitor's IP address to a
 * third party, so this checks two things per theme: the theme's own faces really load (a missing or misnamed
 * face falls back silently and looks "fine"), and no request goes to another origin while the page loads.
 */
const THEMES: { id: string; display: string; sans: string }[] = [
  { id: "meadow", display: "Fraunces Variable", sans: "Geist Variable" },
  { id: "studio-ink", display: "Instrument Serif", sans: "Instrument Sans Variable" },
  { id: "manuscript", display: "Newsreader Variable", sans: "Source Sans 3 Variable" },
  { id: "canopy", display: "Baloo 2 Variable", sans: "Geist Variable" },
];

for (const theme of THEMES) {
  test(`theme ${theme.id} renders its own fonts from this site`, async ({ page }) => {
    const elsewhere: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (!["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol !== "data:") {
        elsewhere.push(`${request.resourceType()} ${url.origin}`);
      }
    });
    await page.addInitScript((id) => window.localStorage.setItem("theme", id), theme.id);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const used = await page.evaluate(async () => {
      await document.fonts.ready;
      const first = (el: Element) =>
        getComputedStyle(el)
          .fontFamily.split(",")[0]
          .trim()
          .replace(/^["']|["']$/g, "");
      const heading = document.querySelector("h1")!;
      const display = first(heading);
      const sans = first(document.body);
      // Force the faces this page needs to load, then ask whether a face of the right family AND the right
      // style did. A family whose upright face is missing still "exists" through its italic one.
      const need = (el: Element, family: string) =>
        `${getComputedStyle(el).fontStyle} 16px "${family}"`;
      await Promise.all([
        document.fonts.load(need(heading, display)),
        document.fonts.load(need(document.body, sans)),
      ]);
      const loaded = (el: Element, family: string) =>
        [...document.fonts].some(
          (f) =>
            f.family.replace(/["']/g, "") === family &&
            f.style === getComputedStyle(el).fontStyle &&
            f.status === "loaded",
        );
      return {
        display,
        sans,
        displayLoaded: loaded(heading, display),
        sansLoaded: loaded(document.body, sans),
      };
    });
    expect(used).toEqual({
      display: theme.display,
      sans: theme.sans,
      displayLoaded: true,
      sansLoaded: true,
    });
    expect(elsewhere.filter((r) => r.startsWith("font") || r.startsWith("stylesheet"))).toEqual([]);
  });
}
