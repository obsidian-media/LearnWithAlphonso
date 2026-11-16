import { generateKeyPairSync, createVerify } from "node:crypto";
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotConnectedError, type SourceContext, type OwnAggregates } from "./numbers-core";
import {
  appStoreSource,
  appStoreToken,
  chartTotal,
  clearSentryIdCache,
  cleanHost,
  countDownloads,
  fetchOwnAggregates,
  googlePlaySource,
  parseOwn,
  postHogSource,
  resolveSentryProjects,
  revenueCatSource,
  sanitizeTitle,
  sentrySource,
  sumInstalls,
} from "./numbers-sources.server";

const NOW = new Date("2026-11-15T10:00:00Z");
const ctx = (windowDays: 7 | 30 | 90 = 7): SourceContext => ({
  windowDays,
  signal: new AbortController().signal,
  now: NOW,
  own: async () => ({}) as OwnAggregates,
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("every provider with no key is not_connected, never an empty success", () => {
  const sources = {
    sentry: sentrySource,
    revenuecat: revenueCatSource,
    posthog: postHogSource,
    appstore: appStoreSource,
    googleplay: googlePlaySource,
  };
  for (const [name, make] of Object.entries(sources)) {
    it(name, async () => {
      const f = vi.fn();
      await expect(make({}, f as unknown as typeof fetch)(ctx())).rejects.toBeInstanceOf(
        NotConnectedError,
      );
      expect(f).not.toHaveBeenCalled();
    });
    it(`${name} with only some keys set is still not_connected`, async () => {
      const f = vi.fn();
      const partial = {
        SENTRY_API_TOKEN: "t",
        REVENUECAT_METRICS_KEY: "k",
        POSTHOG_PERSONAL_API_KEY: "k",
        ASC_KEY_ID: "k",
        GOOGLE_PLAY_PACKAGE: "p",
      };
      await expect(make(partial, f as unknown as typeof fetch)(ctx())).rejects.toBeInstanceOf(
        NotConnectedError,
      );
      expect(f).not.toHaveBeenCalled();
    });
  }
});

describe("hosts", () => {
  it("accepts a bare host or an https URL and refuses anything that could redirect a key", () => {
    expect(cleanHost(undefined, "sentry.io")).toBe("sentry.io");
    expect(cleanHost("https://de.sentry.io/", "sentry.io")).toBe("de.sentry.io");
    for (const bad of [
      "evil.com/path",
      "a.com@evil.com",
      "http://x.com:8080",
      "x y",
      "a.com#b",
      "a.com?x",
    ]) {
      expect(() => cleanHost(bad, "sentry.io"), bad).toThrow();
    }
  });
});

describe("Sentry", () => {
  beforeEach(() => clearSentryIdCache());
  const env = {
    SENTRY_API_TOKEN: "tok",
    SENTRY_ORG: "my-org",
    SENTRY_PROJECTS: "ios:lwa-ios,web:lwa-web",
  };
  it("sends a bearer token only to the configured host and reads crash-free per app and the top issues", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      seen.push({ url, auth: new Headers(init?.headers).get("Authorization") });
      if (url.includes("/projects/"))
        return json([
          { id: "11", slug: "lwa-ios" },
          { id: "22", slug: "lwa-web" },
        ]);
      if (url.includes("/sessions/")) {
        return json({
          groups: [
            {
              by: {},
              totals: { "crash_free_rate(session)": url.includes("project=11") ? 0.9951 : 0.99 },
            },
          ],
        });
      }
      return json([{ title: "TypeError: bob@example.com failed 123456789", count: "12" }]);
    });
    const tiles = await sentrySource(
      { ...env, SENTRY_HOST: "de.sentry.io" },
      f as unknown as typeof fetch,
    )(ctx(30));
    expect(
      seen.every((s) => s.url.startsWith("https://de.sentry.io/api/0/organizations/my-org/")),
    ).toBe(true);
    expect(seen.every((s) => s.auth === "Bearer tok")).toBe(true);
    expect(seen.some((s) => s.url.includes("statsPeriod=30d"))).toBe(true);
    // the sessions and issues calls carry NUMERIC project ids, never slugs
    const data = seen.filter((s) => /\/(sessions|issues)\//.test(s.url));
    expect(data.length).toBe(3);
    expect(data.every((s) => !s.url.includes("lwa-"))).toBe(true);
    expect(data.filter((s) => s.url.includes("project=11")).length).toBe(2);
    expect(data.filter((s) => s.url.includes("project=22")).length).toBe(2);
    expect(tiles[0]!.rows).toEqual([
      { label: "ios", value: 99.5, unit: "%" },
      { label: "web", value: 99, unit: "%" },
    ]);
    expect(tiles[1]!.rows).toEqual([{ label: "TypeError: [email] failed [n]", value: 12 }]);
    expect(JSON.stringify(tiles)).not.toContain("example.com");
  });
  it("a Sentry error throws (the group shows Could not load)", async () => {
    const f = vi.fn(async () => json({}, 401));
    await expect(sentrySource(env, f as unknown as typeof fetch)(ctx())).rejects.toThrow(
      "HTTP 401",
    );
  });
  it("no sessions is a reason, not 0%", async () => {
    const f = vi.fn(async (url: string) => {
      if (url.includes("/projects/"))
        return json([
          { id: "11", slug: "lwa-ios" },
          { id: "22", slug: "lwa-web" },
        ]);
      return url.includes("/sessions/") ? json({ groups: [] }) : json([]);
    });
    const tiles = await sentrySource(env, f as unknown as typeof fetch)(ctx());
    expect(tiles[0]!.rows).toEqual([]);
    expect(tiles[0]!.reason).toBe("No sessions in this window");
    expect(tiles[1]!.reason).toBe("No new issues in this window");
  });
  it("sanitizeTitle masks emails, ids and long numbers and cuts to 80", () => {
    expect(sanitizeTitle("a@b.co 2b3d6c1e-1111-4222-8333-444455556666 12345678")).toBe(
      "[email] [id] [n]",
    );
    expect(sanitizeTitle("x".repeat(200))).toHaveLength(80);
  });
});

describe("RevenueCat", () => {
  const env = { REVENUECAT_METRICS_KEY: "sk_x", REVENUECAT_PROJECT_ID: "proj1" };
  it("uses the v2 overview and chart endpoints with a bearer key, and never reports a missing metric as 0", async () => {
    const urls: string[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk_x");
      if (url.includes("/metrics/overview")) {
        return json({
          metrics: [
            { id: "active_trials", value: 52 },
            { id: "mrr", value: 1640.4 },
            { id: "active_subscriptions", value: 318 },
          ],
        });
      }
      if (url.includes("/charts/actives_new"))
        return json({
          values: [
            [1, 2],
            [1, 3],
          ],
        });
      return json({}, 500); // churn chart fails: its tile is empty, the group stays
    });
    const tiles = await revenueCatSource(env, f as unknown as typeof fetch)(ctx(30));
    const by = Object.fromEntries(tiles.map((t) => [t.id, t]));
    expect(urls[0]).toMatch(/^https:\/\/api\.revenuecat\.com\/v2\/projects\/proj1\//);
    expect(by.active_pro!.value).toBe(318);
    expect(by.trials!.value).toBe(52);
    expect(by.mrr!.value).toBe(1640.4);
    expect(by.new_subs!.value).toBe(5);
    expect(by.churn!.value).toBeNull();
    expect(by.churn!.reason).toBe("Not reported by RevenueCat");
  });
  it("an overview failure throws", async () => {
    const f = vi.fn(async () => json({}, 403));
    await expect(revenueCatSource(env, f as unknown as typeof fetch)(ctx())).rejects.toThrow(
      "HTTP 403",
    );
  });
  it("chartTotal understands the shapes it knows and returns null (not 0) for the rest", () => {
    expect(chartTotal([1, 2, 3], "sum")).toBe(6);
    expect(chartTotal([{ value: 2 }, { value: 4 }], "mean")).toBe(3);
    expect(chartTotal([], "sum")).toBeNull();
    expect(chartTotal("nope", "sum")).toBeNull();
    expect(chartTotal([{ x: 1 }], "sum")).toBeNull();
  });
});

describe("PostHog", () => {
  const env = {
    POSTHOG_PERSONAL_API_KEY: "phx",
    POSTHOG_PROJECT_ID: "12",
    POSTHOG_HOST: "eu.posthog.com",
  };
  it("runs two HogQL queries with the window as a number and returns a rate and steps", async () => {
    const bodies: string[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://eu.posthog.com/api/projects/12/query/");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer phx");
      const body = JSON.parse(String(init?.body));
      bodies.push(body.query.query);
      return json({
        results: body.query.query.includes("uniqIf")
          ? [[200, 50]]
          : [
              ["welcome", 200],
              ["goal", 150],
            ],
      });
    });
    const tiles = await postHogSource(env, f as unknown as typeof fetch)(ctx(90));
    expect(bodies.every((b) => b.includes("interval 90 day"))).toBe(true);
    expect(tiles[0]!.value).toBe(25);
    expect(tiles[1]!.rows).toEqual([
      { label: "welcome", value: 200 },
      { label: "goal", value: 150 },
    ]);
  });
  it("no app opens is a reason, not 0%", async () => {
    const f = vi.fn(async () => json({ results: [[0, 0]] }));
    const tiles = await postHogSource(env, f as unknown as typeof fetch)(ctx());
    expect(tiles[0]!.value).toBeNull();
    expect(tiles[0]!.reason).toBe("No app opens in this window");
  });
});

describe("App Store", () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const env = {
    ASC_KEY_ID: "KID",
    ASC_ISSUER_ID: "ISS",
    ASC_PRIVATE_KEY: pem,
    ASC_VENDOR_NUMBER: "123",
    ASC_APP_ID: "999",
  };
  const tsv = (rows: string[][]) =>
    gzipSync(
      ["Units\tProduct Type Identifier\tApple Identifier", ...rows.map((r) => r.join("\t"))].join(
        "\n",
      ),
    );

  it("signs an ES256 token Apple can verify (raw r||s signature, right header and claims)", () => {
    const { privateKey: k, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const token = appStoreToken(
      "KID",
      "ISS",
      k.export({ type: "pkcs8", format: "pem" }).toString(),
      1000,
    );
    const [h, p, s] = token.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KID",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(p!, "base64url").toString())).toEqual({
      iss: "ISS",
      iat: 1000,
      exp: 1600,
      aud: "appstoreconnect-v1",
    });
    const sig = Buffer.from(s!, "base64url");
    expect(sig).toHaveLength(64);
    const v = createVerify("sha256").update(`${h}.${p}`);
    expect(v.verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
  });
  it("counts first-time downloads of this app only, skips 404 days, and reads the rating", async () => {
    const f = vi.fn(async (url: string) => {
      if (url.startsWith("https://itunes.apple.com/lookup")) {
        return json({ results: [{ averageUserRating: 4.66, userRatingCount: 312 }] });
      }
      expect(url).toContain("filter%5BreportType%5D=SALES");
      expect(url).toContain("filter%5BvendorNumber%5D=123");
      if (url.includes("2026-11-14")) return new Response("", { status: 404 });
      return new Response(
        tsv([
          ["3", "1F", "999"],
          ["2", "1", "999"],
          ["9", "1F", "555"],
          ["4", "7", "999"],
          ["1", "IAY", "999"],
        ]),
      );
    });
    const tiles = await appStoreSource(env, f as unknown as typeof fetch)(ctx(7));
    expect(tiles[0]!.value).toBe(6 * 5); // 6 days with a report x (3 + 2)
    expect(tiles[1]!.value).toBe(4.7);
    expect(tiles[1]!.note).toBe("312 ratings, all time");
  });
  it("no reports at all is a reason, not 0 downloads", async () => {
    const f = vi.fn(async (url: string) =>
      url.startsWith("https://itunes.apple.com")
        ? json({ results: [] })
        : new Response("", { status: 404 }),
    );
    const tiles = await appStoreSource(env, f as unknown as typeof fetch)(ctx(7));
    expect(tiles[0]!.value).toBeNull();
    expect(tiles[0]!.reason).toBe("No sales reports yet");
    expect(tiles[1]!.reason).toBe("No ratings yet");
  });
  it("a 401 throws (Could not load), it is not a quiet empty", async () => {
    const f = vi.fn(async () => new Response("", { status: 401 }));
    await expect(appStoreSource(env, f as unknown as typeof fetch)(ctx(7))).rejects.toThrow(
      "HTTP 401",
    );
  });
  it("countDownloads fails loudly on unexpected columns", () => {
    expect(() => countDownloads("a\tb\n1\t2", undefined)).toThrow("unexpected report columns");
  });
});

describe("Google Play", () => {
  it("sumInstalls sums Daily User Installs inside the range only (UTF-16 handled by the caller)", () => {
    const csv = [
      "Date,Package Name,Country,Daily User Installs",
      '"2026-11-01",p,US,5',
      "2026-11-02,p,FR,7",
      "2026-10-30,p,US,100",
    ].join("\n");
    expect(sumInstalls(csv, "2026-11-01", "2026-11-14")).toBe(12);
    expect(() => sumInstalls("x,y\n1,2", "a", "b")).toThrow("unexpected report columns");
  });
  it("reads each month's report from the bucket and skips a month with none", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const key = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const env = {
      GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "sa@x.iam.gserviceaccount.com",
        private_key: key,
      }),
      GOOGLE_PLAY_PACKAGE: "app.alphonso",
      GOOGLE_PLAY_REPORTS_BUCKET: "pubsite_prod_rev_1",
    };
    const utf16 = (s: string) =>
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, "utf16le")]);
    const f = vi.fn(async (url: string) => {
      if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "at" });
      if (url.includes("_202611_")) {
        return new Response(
          utf16("Date,Package Name,Country,Daily User Installs\n2026-11-10,app.alphonso,US,4\n"),
        );
      }
      return new Response("", { status: 404 });
    });
    const tiles = await googlePlaySource(env, f as unknown as typeof fetch)(ctx(30));
    expect(tiles).toHaveLength(1);
    expect(tiles[0]!.value).toBe(4);
    const objectUrls = f.mock.calls
      .map((c) => c[0])
      .filter((u) => String(u).startsWith("https://storage.googleapis.com"));
    expect(
      objectUrls.every((u) =>
        String(u).includes("/b/pubsite_prod_rev_1/o/stats%2Finstalls%2Finstalls_app.alphonso_"),
      ),
    ).toBe(true);
  });
});

const GOOD_OWN = {
  newToday: 1,
  newWindow: 2,
  activeToday: 3,
  activeWindow: 4,
  lessons: 5,
  practiceCalls: 6,
  podcastsFinished: 7,
  avgStreak: null,
  retention: { d1: 10, d7: null, d30: 0 },
  openReports: 0,
  openTickets: 1,
  aiByKind: { chat: 3 },
};

describe("Our database", () => {
  it("parseOwn keeps only the counts, and a real 0 or a null cohort stays what it is", () => {
    const o = parseOwn({ ...GOOD_OWN, email: "leak@example.com" });
    expect(o.openReports).toBe(0);
    expect(o.avgStreak).toBeNull();
    expect(o.retention).toEqual({ d1: 10, d7: null, d30: 0 });
    expect(o.aiByKind).toEqual({ chat: 3 });
    expect(JSON.stringify(o)).not.toContain("leak@example.com");
  });
  it("parseOwn THROWS on a payload that is not the expected object, never a wall of zeros", () => {
    for (const bad of [null, undefined, "x", 5, [], {}, { newToday: 1 }]) {
      expect(() => parseOwn(bad), JSON.stringify(bad)).toThrow();
    }
  });
  it("parseOwn throws when any count is missing or not a number", () => {
    for (const key of [
      "newToday",
      "newWindow",
      "activeToday",
      "activeWindow",
      "lessons",
      "practiceCalls",
      "podcastsFinished",
      "openReports",
      "openTickets",
    ]) {
      const missing: Record<string, unknown> = { ...GOOD_OWN };
      delete missing[key];
      expect(() => parseOwn(missing), `missing ${key}`).toThrow();
      expect(() => parseOwn({ ...GOOD_OWN, [key]: "7" }), `string ${key}`).toThrow();
      expect(() => parseOwn({ ...GOOD_OWN, [key]: null }), `null ${key}`).toThrow();
    }
  });
  it("parseOwn throws when the nullable fields or the groups are absent or wrong", () => {
    const noStreak: Record<string, unknown> = { ...GOOD_OWN };
    delete noStreak.avgStreak;
    expect(() => parseOwn(noStreak)).toThrow();
    expect(() => parseOwn({ ...GOOD_OWN, avgStreak: "3" })).toThrow();
    expect(() => parseOwn({ ...GOOD_OWN, retention: null })).toThrow();
    expect(() => parseOwn({ ...GOOD_OWN, retention: { d1: 1, d7: 2 } })).toThrow();
    expect(() => parseOwn({ ...GOOD_OWN, retention: { d1: 1, d7: 2, d30: "x" } })).toThrow();
    expect(() => parseOwn({ ...GOOD_OWN, aiByKind: null })).toThrow();
    expect(() => parseOwn({ ...GOOD_OWN, aiByKind: { chat: "bad" } })).toThrow();
  });
  it("fetchOwnAggregates turns an empty database answer into an error, not zeros", async () => {
    const rpc = () => ({ abortSignal: async () => ({ data: null, error: null }) });
    await expect(
      fetchOwnAggregates({ rpc } as never, 7, new AbortController().signal),
    ).rejects.toThrow();
  });
  it("calls admin_numbers_own with the window and throws on a database error", async () => {
    const rpc = vi.fn((name: string, args: Record<string, unknown>) => ({
      abortSignal: async () =>
        ({ data: { ...GOOD_OWN, newToday: 4 }, error: null }) as {
          data: unknown;
          error: { message: string } | null;
        },
      name,
      args,
    }));
    const a = await fetchOwnAggregates({ rpc } as never, 30, new AbortController().signal);
    expect(rpc).toHaveBeenCalledWith("admin_numbers_own", { p_days: 30 });
    expect(a.newToday).toBe(4);
    const bad = {
      rpc: () => ({ abortSignal: async () => ({ data: null, error: { message: "boom" } }) }),
    };
    await expect(fetchOwnAggregates(bad as never, 7, new AbortController().signal)).rejects.toThrow(
      "boom",
    );
  });
});

describe("Sentry project ids", () => {
  const headers = { Authorization: "Bearer t" };
  const sig = () => new AbortController().signal;
  beforeEach(() => clearSentryIdCache());
  it("numeric refs are used as they are, with no projects call", async () => {
    const f = vi.fn();
    const out = await resolveSentryProjects(
      f as never,
      "https://sentry.io/api/0/organizations/o",
      "sentry.io",
      "o",
      headers,
      sig(),
      [{ label: "ios", ref: "123" }],
    );
    expect(out).toEqual([{ label: "ios", id: "123" }]);
    expect(f).not.toHaveBeenCalled();
  });
  it("slugs are resolved through the organisation projects endpoint, once, and cached", async () => {
    const f = vi.fn(async () =>
      json([
        { id: "5", slug: "a" },
        { id: "6", slug: "b" },
      ]),
    );
    const call = () =>
      resolveSentryProjects(
        f as never,
        "https://sentry.io/api/0/organizations/o",
        "sentry.io",
        "o",
        headers,
        sig(),
        [
          { label: "a", ref: "a" },
          { label: "web", ref: "b" },
        ],
      );
    expect(await call()).toEqual([
      { label: "a", id: "5" },
      { label: "web", id: "6" },
    ]);
    await call();
    expect(f).toHaveBeenCalledTimes(1);
    expect(String((f.mock.calls as unknown as string[][])[0]![0])).toBe(
      "https://sentry.io/api/0/organizations/o/projects/?per_page=100",
    );
  });
  it("an unknown slug throws (the group says Could not load)", async () => {
    const f = vi.fn(async () => json([{ id: "5", slug: "a" }]));
    await expect(
      resolveSentryProjects(
        f as never,
        "https://sentry.io/api/0/organizations/o",
        "sentry.io",
        "o",
        headers,
        sig(),
        [{ label: "x", ref: "nope" }],
      ),
    ).rejects.toThrow("unknown Sentry project");
  });
});
