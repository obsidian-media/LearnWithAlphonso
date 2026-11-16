import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS } from "./analytics-events";

// An event name in the list with no place that sends it is a promise the product does not keep (explain_requested
// and path_built sat reserved with no call site until round 14). Every name must be sent from real code on each
// platform. The sender is found by name outside the files that DEFINE the list.
const files = (dir: string, exts: string[]) =>
  execFileSync("git", ["ls-files", dir], { encoding: "utf8" })
    .split("\n")
    .filter((f) => exts.some((e) => f.endsWith(e)))
    .filter((f) => !/test|Test|\/analytics-events\.ts$|AnalyticsEvents\.(swift|kt)$/.test(f));

const read = (paths: string[]) => paths.map((p) => readFileSync(p, "utf8")).join("\n");

const webSrc = read(files("src", [".ts", ".tsx"]));
const iosSrc = read(files("ios/LearnWithAlphonso/Sources", [".swift"]));
const androidSrc = read(files("android/LearnWithAlphonso/app/src/main", [".kt"]));

const camel = (name: string) => name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

describe("every analytics event is sent from real code on every platform", () => {
  it.each(ANALYTICS_EVENTS)("%s", (name) => {
    expect(webSrc, `web never calls track("${name}")`).toMatch(new RegExp(`track\\(\\s*"${name}"`));
    expect(iosSrc, `iOS never calls Analytics.track(.${camel(name)}`).toMatch(
      new RegExp(`Analytics\\.track\\(\\s*\\.${camel(name)}\\b`),
    );
    expect(androidSrc, `Android never tracks ${name.toUpperCase()}`).toMatch(
      new RegExp(`AnalyticsEvent\\.${name.toUpperCase()}\\b`),
    );
  });
});
