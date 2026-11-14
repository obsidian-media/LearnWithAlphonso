import { describe, expect, it } from "vitest";
import { appleAppSiteAssociation, IOS_APP_ID } from "./apple-app-site-association";

describe("apple-app-site-association", () => {
  it("opens only /invite/* in the app, for the shipped bundle id", () => {
    const aasa = appleAppSiteAssociation();
    expect(aasa.applinks.details[0].appIDs).toEqual([IOS_APP_ID]);
    expect(IOS_APP_ID.endsWith(".com.obsidianmedia.learnwithalphonso")).toBe(true);
    expect(aasa.applinks.details[0].components).toEqual([{ "/": "/invite/*" }]);
  });

  it("is served as JSON by the route", async () => {
    const { Route } = await import("../routes/[.]well-known/apple-app-site-association");
    const handlers = (Route.options as unknown as { server: { handlers: { GET: () => Response } } })
      .server.handlers;
    const res = handlers.GET();
    expect(res.headers.get("content-type")).toBe("application/json");
    expect((await res.json()).applinks.details[0].appIDs).toEqual([IOS_APP_ID]);
  });
});
