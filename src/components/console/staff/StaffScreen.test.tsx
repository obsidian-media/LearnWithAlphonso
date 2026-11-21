// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffScreen } from "./StaffScreen";
import type { StaffApi, StaffRow } from "./staffApi";
import { DEFAULT_SCOPES, SCOPES, SCOPE_LABELS } from "../../../lib/staff-scopes";

afterEach(() => cleanup());

const ME = "40000000-0000-4000-8000-000000000001";
const SAM = "40000000-0000-4000-8000-000000000002";
const NEW = "40000000-0000-4000-8000-000000000003";
const OFF = "40000000-0000-4000-8000-000000000004";

const row = (over: Partial<StaffRow>): StaffRow => ({
  userId: SAM,
  displayName: "Sam",
  email: "sam@example.com",
  role: "support",
  scopes: ["users.read", "support.read"],
  disabled: false,
  addedAt: "2026-01-04T00:00:00Z",
  lastSignInAt: "2026-11-17T09:30:00Z",
  ...over,
});

const ROWS: StaffRow[] = [
  row({
    userId: ME,
    displayName: "Olive",
    email: "olive@example.com",
    role: "owner",
    scopes: [...SCOPES],
  }),
  row({}),
  row({
    userId: NEW,
    displayName: null,
    email: "new@example.com",
    scopes: ["users.read"],
    lastSignInAt: null,
  }),
  row({ userId: OFF, displayName: "Off", email: "off@example.com", disabled: true }),
];

const ok = () => vi.fn(async () => ({ ok: true }));
function makeApi(over: Partial<StaffApi> = {}): StaffApi {
  return { list: vi.fn(async () => ROWS), add: ok(), update: ok(), ...over };
}
async function show(api: StaffApi = makeApi()) {
  const user = userEvent.setup();
  render(<StaffScreen myId={ME} api={api} />);
  await screen.findByRole("list", { name: "Staff" });
  return user;
}
const rowOf = (name: RegExp | string) =>
  screen.getByText(name).closest("[data-staff-row]") as HTMLElement;
const reasonBox = () => screen.getByLabelText(/Reason \(3 to 500/);

describe("what the Staff screen shows (all of it from the list the server returned)", () => {
  it("shows each person's email, role, real scopes and last sign-in, with Never signed in for null", async () => {
    await show();
    const sam = rowOf("Sam");
    expect(within(sam).getByText("sam@example.com")).toBeTruthy();
    expect(within(sam).getByText("Support")).toBeTruthy();
    expect(within(sam).getByText(SCOPE_LABELS["users.read"])).toBeTruthy();
    expect(within(sam).getByText(SCOPE_LABELS["support.read"])).toBeTruthy();
    expect(within(sam).getByText(/17 Nov 2026/)).toBeTruthy();
    // a person with no name shows their email as the name; never signed in is said, not dated
    const fresh = rowOf(/^new@example.com$/);
    expect(within(fresh).getByText("Never signed in")).toBeTruthy();
    expect(within(fresh).queryByText(/20\d\d/)).toBeNull();
  });

  it("shows the real roles only, an owner as Every scope, a suspended person as Suspended", async () => {
    await show();
    expect(within(rowOf("Olive")).getByText("Owner")).toBeTruthy();
    expect(within(rowOf("Olive")).getByText("Every scope")).toBeTruthy();
    expect(within(rowOf("Off")).getByText("Suspended")).toBeTruthy();
    expect(within(rowOf("Sam")).getByText("Active")).toBeTruthy();
    for (const invented of ["Support lead", "Moderator", "Content", "Pending", "Invited"]) {
      expect(screen.queryByText(invented)).toBeNull();
    }
  });

  it("the member count comes from the list, and an unread list says so instead of a number", async () => {
    await show();
    expect(screen.getByText("4").getAttribute("data-figure")).not.toBeNull();
    cleanup();
    render(
      <StaffScreen
        myId={ME}
        api={makeApi({
          list: vi.fn(async () => Promise.reject(new Error("Only an owner can manage staff."))),
        })}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Only an owner can manage staff.",
    );
    expect(screen.getByText("Could not read").getAttribute("data-figure-absent")).not.toBeNull();
    expect(screen.queryByRole("list", { name: "Staff" })).toBeNull();
  });

  it("has no Remove control and no Pending state (the actions are Change access and Suspend)", async () => {
    await show();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
    expect(screen.queryByText(/pending/i)).toBeNull();
    expect(
      within(rowOf("Sam"))
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Change access", "Suspend"]);
    expect(
      within(rowOf("Off"))
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Change access", "Reactivate"]);
  });

  it("your own row has no actions (nobody changes their own access)", async () => {
    await show();
    const mine = rowOf("Olive");
    expect(within(mine).queryAllByRole("button")).toHaveLength(0);
    expect(within(mine).getByText(/cannot change your own access/i)).toBeTruthy();
    expect(within(mine).getByText("(you)")).toBeTruthy();
  });
});

describe("scope chips are the real scopes", () => {
  it("the picker offers every real scope except staff.manage, labelled from the registry, with the key as its title", async () => {
    const user = await show();
    await user.click(within(rowOf("Sam")).getByRole("button", { name: /Change access/ }));
    const dialog = screen.getByRole("dialog", { name: "Change access" });
    const chips = within(within(dialog).getByRole("group", { name: "Scopes" })).getAllByRole(
      "button",
    );
    expect(chips.map((c) => c.getAttribute("title"))).toEqual(
      SCOPES.filter((s) => s !== "staff.manage"),
    );
    for (const c of chips) {
      const key = c.getAttribute("title") as keyof typeof SCOPE_LABELS;
      expect(c.textContent).toBe(SCOPE_LABELS[key]);
    }
    expect(within(dialog).queryByText(SCOPE_LABELS["staff.manage"])).toBeNull();
    // the chips start as exactly what the person has
    const on = chips.filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.title);
    expect(on.sort()).toEqual(["support.read", "users.read"]);
  });
});

describe("every change asks for a reason first and sends it", () => {
  it("changing scopes: nothing is sent until a reason of 3 or more characters is given", async () => {
    const api = makeApi();
    const user = await show(api);
    await user.click(within(rowOf("Sam")).getByRole("button", { name: /Change access/ }));
    const sheet = screen.getByRole("dialog", { name: "Change access" });
    expect(
      (within(sheet).getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.click(within(sheet).getByRole("button", { name: SCOPE_LABELS["support.reply"] }));
    await user.click(within(sheet).getByRole("button", { name: "Save changes" }));
    expect(api.update).not.toHaveBeenCalled();
    const save = screen.getByRole("button", { name: "Save change" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await user.type(reasonBox(), "ab");
    expect(save.disabled).toBe(true);
    await user.type(reasonBox(), "c");
    await user.click(save);
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    expect(api.update).toHaveBeenCalledWith({
      userId: SAM,
      scopes: ["users.read", "support.read", "support.reply"],
      reason: "abc",
    });
    expect(await screen.findByText("Access changed.")).toBeTruthy();
    expect(api.list).toHaveBeenCalledTimes(2); // read again after the change
  });

  it("changing a role: promoting to Owner sends the role and no scopes", async () => {
    const api = makeApi();
    const user = await show(api);
    await user.click(within(rowOf("Sam")).getByRole("button", { name: /Change access/ }));
    await user.selectOptions(screen.getByLabelText("Role"), "owner");
    expect(screen.queryByRole("group", { name: "Scopes" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.type(reasonBox(), "now runs billing");
    await user.click(screen.getByRole("button", { name: "Save change" }));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(api.update).toHaveBeenCalledWith({
      userId: SAM,
      role: "owner",
      reason: "now runs billing",
    });
  });

  it("demoting an owner to Support starts from the standard support scopes and sends role and scopes", async () => {
    const api = makeApi({
      list: vi.fn(async () => [ROWS[0]!, row({ userId: NEW, role: "owner", scopes: [...SCOPES] })]),
    });
    const user = await show(api);
    await user.click(
      within(rowOf("sam@example.com")).getByRole("button", { name: /Change access/ }),
    );
    await user.selectOptions(screen.getByLabelText("Role"), "support");
    const chips = within(screen.getByRole("group", { name: "Scopes" })).getAllByRole("button");
    expect(
      chips
        .filter((c) => c.getAttribute("aria-pressed") === "true")
        .map((c) => c.title)
        .sort(),
    ).toEqual([...DEFAULT_SCOPES.support].sort());
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.type(reasonBox(), "stepping back");
    await user.click(screen.getByRole("button", { name: "Save change" }));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(api.update).toHaveBeenCalledWith({
      userId: NEW,
      role: "support",
      scopes: DEFAULT_SCOPES.support,
      reason: "stepping back",
    });
  });

  it("suspending and reactivating each ask for a reason", async () => {
    const api = makeApi();
    const user = await show(api);
    await user.click(within(rowOf("Sam")).getByRole("button", { name: /Suspend/ }));
    expect(api.update).not.toHaveBeenCalled();
    await user.type(reasonBox(), "left the team");
    await user.click(screen.getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    expect(api.update).toHaveBeenLastCalledWith({
      userId: SAM,
      disabled: true,
      reason: "left the team",
    });
    await user.click(within(rowOf("Off")).getByRole("button", { name: /Reactivate/ }));
    await user.type(reasonBox(), "back from leave");
    await user.click(screen.getByRole("button", { name: "Reactivate" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
    expect(api.update).toHaveBeenLastCalledWith({
      userId: OFF,
      disabled: false,
      reason: "back from leave",
    });
  });

  it("adding someone: the email, role and scopes go with the reason", async () => {
    const api = makeApi();
    const user = await show(api);
    await user.click(screen.getByRole("button", { name: "Add staff" }));
    const sheet = screen.getByRole("dialog", { name: "Add staff" });
    await user.type(within(sheet).getByLabelText(/Account email/), "hire@example.com");
    await user.click(within(sheet).getByRole("button", { name: "Continue" }));
    expect(api.add).not.toHaveBeenCalled();
    await user.type(reasonBox(), "joining support");
    await user.click(
      within(screen.getByRole("dialog", { name: "Reason for adding this person" })).getByRole(
        "button",
        { name: "Add staff" },
      ),
    );
    await waitFor(() => expect(api.add).toHaveBeenCalled());
    expect(api.add).toHaveBeenCalledWith({
      email: "hire@example.com",
      role: "support",
      scopes: DEFAULT_SCOPES.support,
      reason: "joining support",
    });
  });

  it("cancelling the reason sends nothing and keeps the choices in the sheet", async () => {
    const api = makeApi();
    const user = await show(api);
    await user.click(within(rowOf("Sam")).getByRole("button", { name: /Change access/ }));
    await user.click(screen.getByRole("button", { name: SCOPE_LABELS["pro.grant"] }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Reason for this change" })).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(api.update).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: SCOPE_LABELS["pro.grant"] }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("a server refusal (for example the last owner) is shown and the list is not claimed changed", async () => {
    const api = makeApi({
      update: vi.fn(async () => {
        throw new Error("That would leave no active owner, so nothing was changed.");
      }),
    });
    const user = await show(api);
    await user.click(within(rowOf("Sam")).getByRole("button", { name: /Suspend/ }));
    await user.type(reasonBox(), "no longer needed");
    await user.click(screen.getByRole("button", { name: "Suspend" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "That would leave no active owner, so nothing was changed.",
    );
    expect(screen.queryByText("Suspended.")).toBeNull();
    expect(api.list).toHaveBeenCalledTimes(1);
  });
});

describe("the sheet", () => {
  it("a forbidden stored staff.manage cannot get stuck in the sheet or be sent", async () => {
    const api = makeApi({
      list: vi.fn(async () => [ROWS[0]!, row({ scopes: ["users.read", "staff.manage"] as never })]),
    });
    const user = await show(api);
    await user.click(within(rowOf("Sam")).getByRole("button", { name: /Change access/ }));
    await user.click(screen.getByRole("button", { name: SCOPE_LABELS["support.reply"] }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.type(reasonBox(), "more access");
    await user.click(screen.getByRole("button", { name: "Save change" }));
    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(api.update).toHaveBeenCalledWith({
      userId: SAM,
      scopes: ["users.read", "support.reply"],
      reason: "more access",
    });
  });

  it("warns when a destructive scope is chosen, from the real key's label", async () => {
    const user = await show();
    await user.click(within(rowOf("Sam")).getByRole("button", { name: /Change access/ }));
    expect(screen.queryByRole("note")).toBeNull();
    await user.click(screen.getByRole("button", { name: SCOPE_LABELS["user.delete"] }));
    expect(screen.getByRole("note").textContent).toContain(SCOPE_LABELS["user.delete"]);
    await user.click(screen.getByRole("button", { name: SCOPE_LABELS["user.ban"] }));
    expect(screen.getAllByRole("note")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: SCOPE_LABELS["user.delete"] }));
    expect(screen.getAllByRole("note")).toHaveLength(1);
  });

  it("is hidden from assistive tech while the reason dialog is open, and focus returns on cancel", async () => {
    const user = await show();
    await user.click(within(rowOf("Sam")).getByRole("button", { name: /Change access/ }));
    await user.click(screen.getByRole("button", { name: SCOPE_LABELS["pro.grant"] }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const sheet = document.querySelector('[aria-label="Change access"]') as HTMLElement;
    expect(sheet.getAttribute("aria-hidden")).toBe("true");
    expect(sheet.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Change access" })).toBeNull();
    await user.click(
      within(screen.getByRole("dialog", { name: "Reason for this change" })).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(sheet.getAttribute("aria-hidden")).toBeNull();
    expect(sheet.hasAttribute("inert")).toBe(false);
    expect(sheet.contains(document.activeElement)).toBe(true);
  });
});
