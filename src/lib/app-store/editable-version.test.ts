import { describe, expect, it } from "vitest";
import {
  EDITABLE_VERSION_STATES,
  editableVersionQuery,
  pickEditableAppInfo,
  pickEditableVersion,
} from "./editable-version";

const v = (versionString: string, appVersionState: string, id = `${versionString}-${appVersionState}`) => ({
  id,
  attributes: { versionString, appVersionState },
});

describe("pickEditableVersion", () => {
  it("selects a 1.0 the developer removed from review (DEVELOPER_REJECTED)", () => {
    expect(pickEditableVersion([v("1.0", "DEVELOPER_REJECTED")]).id).toBe("1.0-DEVELOPER_REJECTED");
  });

  it("selects PREPARE_FOR_SUBMISSION, REJECTED and METADATA_REJECTED", () => {
    for (const s of ["PREPARE_FOR_SUBMISSION", "REJECTED", "METADATA_REJECTED"]) {
      expect(pickEditableVersion([v("1.0", s)]).attributes?.appVersionState).toBe(s);
    }
  });

  it("refuses versions that are in review or live", () => {
    for (const s of ["WAITING_FOR_REVIEW", "IN_REVIEW", "READY_FOR_SALE", "PENDING_DEVELOPER_RELEASE"]) {
      expect(() => pickEditableVersion([v("1.0", s)])).toThrow(/no editable/i);
    }
  });

  it("refuses a different version string and ambiguity", () => {
    expect(() => pickEditableVersion([v("1.1", "PREPARE_FOR_SUBMISSION")])).toThrow(/no editable/i);
    expect(() =>
      pickEditableVersion([v("1.0", "REJECTED", "a"), v("1.0", "DEVELOPER_REJECTED", "b")]),
    ).toThrow(/more than one/i);
  });

  it("names what it saw when nothing is editable", () => {
    expect(() => pickEditableVersion([v("1.0", "WAITING_FOR_REVIEW")])).toThrow(/1\.0:WAITING_FOR_REVIEW/);
  });

  it("builds the comma-separated ASC filter", () => {
    expect(editableVersionQuery()).toBe(`filter[appVersionState]=${EDITABLE_VERSION_STATES.join(",")}`);
  });
});

describe("pickEditableAppInfo", () => {
  const info = (id: string, state?: string, appStoreState?: string) => ({
    id,
    attributes: { state, appStoreState },
  });

  it("takes the only appInfo of a never-released app", () => {
    expect(pickEditableAppInfo([info("only", "PREPARE_FOR_SUBMISSION")]).id).toBe("only");
  });

  it("takes the editable one when a live one exists beside it, under either attribute name", () => {
    expect(
      pickEditableAppInfo([info("live", "READY_FOR_DISTRIBUTION"), info("draft", "PREPARE_FOR_SUBMISSION")]).id,
    ).toBe("draft");
    expect(
      pickEditableAppInfo([info("live", undefined, "READY_FOR_SALE"), info("draft", undefined, "DEVELOPER_REJECTED")]).id,
    ).toBe("draft");
  });

  it("refuses to guess between two live ones or when none is editable", () => {
    expect(() =>
      pickEditableAppInfo([info("a", "READY_FOR_DISTRIBUTION"), info("b", "READY_FOR_DISTRIBUTION")]),
    ).toThrow(/no editable/i);
    expect(() => pickEditableAppInfo([])).toThrow(/no editable/i);
  });
});
