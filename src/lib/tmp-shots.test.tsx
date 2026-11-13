import { mkdirSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "vitest";
import { ConsoleNav } from "../components/staff/ConsoleNav";
import { UsersSearchView } from "../components/staff/UsersSearchView";
import { LearnerView } from "../components/staff/LearnerView";
import { StaffView } from "../components/staff/StaffView";
import { AuditView } from "../components/staff/AuditView";
import { SCOPES } from "./staff-scopes";

const OUT = "D:/Temp/claude/D--AgentDevWork-repos-LearnWithAlphonso/472b71da-da34-4fea-a93b-e311826d061f/scratchpad/admin-shots";
const css = readdirSync(".output/public/assets").find((f) => f.endsWith(".css"))!;

function page(name: string, body: React.ReactElement) {
  mkdirSync(OUT, { recursive: true });
  copyFileSync(`.output/public/assets/${css}`, `${OUT}/app.css`);
  writeFileSync(
    `${OUT}/${name}.html`,
    `<!doctype html><html lang="en" data-theme="canopy"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="app.css"></head><body class="bg-surface text-ink font-sans">${renderToStaticMarkup(
      <>
        <ConsoleNav scopes={[...SCOPES]} role="owner" current={name.startsWith("users") || name === "learner" || name === "dialog" ? "users" : name} />
        <main className="mx-auto max-w-5xl p-4 sm:p-6">{body}</main>
      </>,
    )}</body></html>`,
  );
}

const facts = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "ada.lovelace@example.com",
  displayName: "Ada L.",
  createdAt: "2026-03-02T10:00:00Z",
  lastActiveAt: "2026-11-12",
  course: "fr",
  level: "A2",
  streak: 12,
  xp: 1340,
  pro: { active: true, source: "gift" as const, until: "2026-12-10T00:00:00Z", unavailable: false },
  platforms: ["android", "ios"],
  restrictions: [{ kind: "block", reason: "Repeated rude messages to buddies", createdAt: "2026-11-02T00:00:00Z", liftedAt: null }],
  reportsAgainst: 2,
  gifts: [{ endsAt: "2026-12-10T00:00:00Z", reason: "Goodwill after the sync outage", revokedAt: null }],
  notes: [{ author: "Sam (support)", body: "Wrote in about a missing streak; restored by hand.", createdAt: "2026-11-05T09:00:00Z" }],
};
const noop = () => {};

it("renders the screens", () => {
  page(
    "users",
    <UsersSearchView
      searched
      busy={false}
      error={null}
      onSearch={noop}
      results={[
        { id: facts.id, email: facts.email, displayName: "Ada L.", createdAt: facts.createdAt },
        { id: "00000000-0000-4000-8000-000000000002", email: "ada.b@example.com", displayName: "Ada Byron", createdAt: "2026-06-01T00:00:00Z" },
      ]}
    />,
  );
  page("learner", <LearnerView facts={facts} scopes={[...SCOPES]} dialog={null} busy={false} error={null} notice="Block lifted." onAction={noop} onCancelDialog={noop} onSubmitDialog={noop} onAddNote={noop} />);
  page("dialog", <LearnerView facts={facts} scopes={[...SCOPES]} dialog="ban" busy={false} error="Type the learner's email to confirm." notice={null} onAction={noop} onCancelDialog={noop} onSubmitDialog={noop} onAddNote={noop} />);
  page(
    "staff",
    <StaffView
      myId="o1"
      busy={false}
      error={null}
      onAdd={noop}
      onUpdate={noop}
      rows={[
        { userId: "o1", displayName: "Shayan", role: "owner", scopes: [...SCOPES], disabled: false, addedAt: "2026-09-28T00:00:00Z" },
        { userId: "s1", displayName: "Sam (support)", role: "support", scopes: ["users.read", "users.notes", "support.read", "user.block"], disabled: false, addedAt: "2026-11-10T00:00:00Z" },
      ]}
    />,
  );
  page(
    "audit",
    <AuditView
      busy={false}
      error={null}
      onFilter={noop}
      onMore={noop}
      nextCursor={40}
      rows={[
        { id: 3, at: "2026-11-13T09:12:00Z", actorUserId: "00000000-0000-4000-8000-0000000000a1", actorRole: "owner", action: "pro.grant", targetUserId: facts.id, reason: "Goodwill after the sync outage", before: null, after: null },
        { id: 2, at: "2026-11-13T09:10:00Z", actorUserId: "00000000-0000-4000-8000-0000000000b1", actorRole: "support", action: "user.view", targetUserId: facts.id, reason: null, before: null, after: null },
        { id: 1, at: "2026-11-12T18:00:00Z", actorUserId: "00000000-0000-4000-8000-0000000000b1", actorRole: "support", action: "user.block", targetUserId: facts.id, reason: "Repeated rude messages to buddies", before: null, after: null },
      ]}
    />,
  );
});
