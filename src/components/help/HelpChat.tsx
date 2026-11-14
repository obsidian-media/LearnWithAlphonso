import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  SUPPORT_LINK_LABELS,
  SUPPORT_LINK_WEB_PATHS,
  isSupportLinkId,
  type SupportLinkId,
} from "@/lib/support-links";
import type { SupportMessage } from "@/lib/support-client";
import { SUPPORT_COPY, SUPPORT_STARTERS } from "@/lib/support-copy";
import {
  BANNER_COPY,
  bannerFor,
  composerFor,
  dayKey,
  dayLabel,
  timeLabel,
} from "@/lib/support-view";
import { HelpIcon, type HelpIconName } from "./HelpIcons";
import { liveHelpClient, useHelpChat, type HelpClient, type PendingMessage } from "./useHelpChat";

/**
 * The Help chat (round 12 mock, sections 2 to 6). A learner talks to the AI helper or, when AI answers are off or
 * the learner asks, to a person; staff replies appear in the same chat. The server decides everything that matters
 * (who answers, the status, the limits); this draws it.
 *
 * Every speaker has a text label and its own bubble shape, not colour alone. Learner and AI text is rendered as
 * text, never HTML. The only link an answer can carry is an allow-listed in-app screen (support-links.ts).
 */

const BANNER_STYLE = {
  ai: "bg-ds-choice-tint text-ds-choice",
  person: "bg-ds-choice-tint text-ds-choice",
  declined: "bg-ds-choice-tint text-ds-choice",
  team: "border-2 border-ds-choice-edge bg-ds-choice-tint text-ds-choice",
  wait: "border-2 border-ds-action-edge bg-ds-action-tint text-ds-action-text",
  done: "border-2 border-ds-right bg-ds-right-tint text-ds-right-ink",
  offline: "border-2 border-ds-wrong bg-ds-wrong-tint text-ds-wrong-ink",
} as const;

const BANNER_ICON: Record<keyof typeof BANNER_STYLE, HelpIconName> = {
  ai: "info",
  person: "person",
  declined: "lock",
  team: "team",
  wait: "hourglass",
  done: "check",
  offline: "offline",
};

/** Online/offline from the browser; `override` is for tests and the screenshot pages. */
function useOnline(override?: boolean): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return override ?? online;
}

export function HelpChat({
  client = liveHelpClient,
  aiDeclined = false,
  online: onlineOverride,
}: {
  client?: HelpClient;
  /** The learner turned AI features off in Settings: the chat says why a person answers. */
  aiDeclined?: boolean;
  online?: boolean;
}) {
  const online = useOnline(onlineOverride);
  const chat = useHelpChat(client, online);
  const { state, draft, setDraft } = chat;
  const listRef = useRef<HTMLDivElement>(null);

  const banner = bannerFor({
    status: state.load === "ready" ? state.status : null,
    aiAvailable: state.aiAvailable,
    aiDeclined,
    online,
  });
  const aiAnswering =
    state.aiAvailable && !aiDeclined && (state.status === "none" || state.status === "ai");

  const pendingShown =
    state.pending && !isStored(state.pending, state.messages) ? state.pending : null;
  const empty = state.load === "ready" && state.messages.length === 0 && !state.pending;
  const composer = composerFor({
    status: state.status,
    limit: state.limit,
    online,
    aiFirstOpen: empty && banner === "ai",
  });
  const composerDisabled =
    composer.disabled || state.load !== "ready" || state.pending?.state === "failed";
  const canSend = draft.trim().length > 0 && !composerDisabled && online && state.pending === null;

  // Keep the newest line in view.
  const endMark = `${state.messages.length}:${state.pending?.state ?? ""}:${state.limit ?? ""}:${state.load}`;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [endMark]);

  return (
    <section
      aria-label={SUPPORT_COPY.title}
      className="flex h-dvh flex-col bg-ds-surface text-ds-ink"
      data-help-chat=""
    >
      <header className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
        <Link
          to="/profile"
          className="inline-flex min-h-11 items-center gap-1 rounded-full bg-ds-card px-3 ds-type-footnote font-extrabold text-ds-choice shadow-[var(--ds-shadow-resting)]"
        >
          <HelpIcon name="back" className="size-3.5" />
          <span className="sr-only">Back to </span>Profile
        </Link>
        <h1 className="font-display ds-type-headline text-ds-ink">{SUPPORT_COPY.title}</h1>
        <button
          type="button"
          onClick={() => void chat.talkToPerson()}
          disabled={state.handoffBusy || !online}
          className="inline-flex min-h-11 items-center rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card px-3 ds-type-footnote font-extrabold text-ds-brand shadow-[0_3px_0_var(--c-line)] disabled:opacity-60"
        >
          {SUPPORT_COPY.talkToPerson}
        </button>
      </header>

      {banner && (
        <div
          role="status"
          data-banner={banner}
          className={`mx-4 mt-1.5 flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 ${BANNER_STYLE[banner]}`}
        >
          <HelpIcon name={BANNER_ICON[banner]} className="size-5 shrink-0" />
          <div className="ds-type-footnote font-bold">
            {BANNER_COPY[banner].title}
            <small className="mt-px block ds-type-caption font-semibold opacity-90">
              {BANNER_COPY[banner].body}
            </small>
          </div>
        </div>
      )}

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label={SUPPORT_COPY.messageLog}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2 pt-3"
      >
        {state.load === "loading" && (
          <p role="status" className="sr-only">
            Loading your messages
          </p>
        )}
        {state.load === "error" && (
          <ErrorCard text={SUPPORT_COPY.loadFailed} onRetry={() => void chat.reload()} />
        )}
        {empty && <Welcome aiAnswering={aiAnswering} onStarter={(text) => setDraft(text)} />}
        <Thread
          messages={state.messages}
          dividerId={state.dividerId}
          sentIds={state.sentIds}
          pending={pendingShown}
          typing={aiAnswering && state.pending?.state === "sending"}
          now={new Date()}
        />
        {state.pending?.state === "failed" && (
          <ErrorCard
            text={
              state.pending.failure === "unreachable"
                ? SUPPORT_COPY.unreachable
                : SUPPORT_COPY.sendFailed
            }
            onRetry={chat.retry}
          />
        )}
        {state.handoffFailed && (
          <ErrorCard text={SUPPORT_COPY.handoffFailed} onRetry={() => void chat.talkToPerson()} />
        )}
        {state.limit === "conversation" && <SystemLine text={SUPPORT_COPY.conversationLimit} />}
        {state.limit === "daily" && <DailyLimit />}
      </div>

      <form
        className="grid gap-1.5 border-t border-ds-line bg-ds-surface px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) chat.send();
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter adds a line. (IME composition is left alone.)
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSend) chat.send();
              }
            }}
            rows={1}
            maxLength={2000}
            disabled={composer.disabled || state.load !== "ready"}
            placeholder={composer.placeholder}
            aria-label={SUPPORT_COPY.placeholder}
            className="min-h-11 max-h-32 flex-1 resize-none rounded-[23px] border-2 border-ds-line bg-ds-card px-4 py-2.5 ds-type-body text-ds-ink outline-none placeholder:text-ds-ink-faint focus:border-ds-choice disabled:bg-ds-sunk"
          />
          <button
            type="submit"
            aria-label={SUPPORT_COPY.sendLabel}
            disabled={!canSend}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-ds-action text-ds-on-action shadow-[0_3px_0_var(--c-action-edge)] disabled:opacity-40 disabled:shadow-none"
          >
            <HelpIcon name="send" />
          </button>
        </div>
        {composer.fine && (
          <p className="m-0 text-center ds-type-caption font-semibold text-ds-ink-faint">
            {composer.fine}
          </p>
        )}
      </form>
    </section>
  );
}

/** A failed message the server already holds (a poll found it) is not drawn a second time. */
function isStored(p: PendingMessage, messages: readonly SupportMessage[]): boolean {
  return (
    p.state === "failed" &&
    messages.some((m) => m.kind === "you" && m.id > p.baseId && m.body === p.text)
  );
}

function Welcome({
  aiAnswering,
  onStarter,
}: {
  aiAnswering: boolean;
  onStarter: (text: string) => void;
}) {
  return (
    <>
      <div className="grid justify-items-center gap-2 px-1.5 pt-0.5 text-center" data-welcome="">
        <img
          src="/mascots/alphonso-explaining-pointer.webp"
          alt=""
          height={135}
          className="h-[135px] w-auto"
          draggable={false}
        />
        <h2 className="m-0 font-display ds-type-title text-ds-ink">
          {aiAnswering ? SUPPORT_COPY.welcomeAiTitle : SUPPORT_COPY.welcomeTitle}
        </h2>
        <p className="m-0 ds-type-footnote font-medium text-ds-ink-soft">
          {aiAnswering ? SUPPORT_COPY.welcomeAiBody : SUPPORT_COPY.welcomeBody}
        </p>
      </div>
      {aiAnswering ? (
        <div className="grid gap-2" data-starters="">
          <h3 className="m-0 ds-type-overline text-ds-action-text">{SUPPORT_COPY.canHelpWith}</h3>
          <div className="flex flex-wrap gap-2">
            {SUPPORT_STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStarter(s)}
                className="min-h-11 rounded-[14px] border-2 border-b-4 border-ds-line bg-ds-card px-3 text-left ds-type-footnote font-bold text-ds-brand"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="m-0 flex items-start gap-1.5 rounded-[16px] border-2 border-ds-line bg-ds-card px-3 py-2.5 ds-type-caption font-semibold text-ds-ink-soft">
          <HelpIcon name="info" className="mt-px size-3.5 shrink-0" />
          {SUPPORT_COPY.welcomeTip}
        </p>
      )}
    </>
  );
}

type Row =
  | { type: "day"; key: string; label: string; fresh?: boolean }
  | { type: "message"; key: string; message: SupportMessage }
  | { type: "pending"; key: string; pending: PendingMessage };

function Thread({
  messages,
  dividerId,
  sentIds,
  pending,
  typing,
  now,
}: {
  messages: readonly SupportMessage[];
  dividerId: number | null;
  sentIds: readonly number[];
  pending: PendingMessage | null;
  typing: boolean;
  now: Date;
}) {
  const rows: Row[] = [];
  let lastDay = "";
  const pushDay = (iso: string) => {
    const k = dayKey(iso);
    if (k !== lastDay) {
      lastDay = k;
      rows.push({ type: "day", key: `day-${k}`, label: dayLabel(iso, now) });
    }
  };
  for (const m of messages) {
    pushDay(m.at);
    if (m.id === dividerId)
      rows.push({ type: "day", key: `new-${m.id}`, label: SUPPORT_COPY.newReply, fresh: true });
    rows.push({ type: "message", key: `m-${m.id}`, message: m });
  }
  if (pending) {
    pushDay(pending.at);
    rows.push({ type: "pending", key: `p-${pending.clientId}`, pending });
  }
  return (
    <>
      {rows.map((r) => {
        if (r.type === "day") return <Divider key={r.key} label={r.label} fresh={r.fresh} />;
        if (r.type === "pending") {
          const state =
            r.pending.state === "failed"
              ? r.pending.failure === "unreachable"
                ? SUPPORT_COPY.stateSaved
                : SUPPORT_COPY.stateNotSent
              : undefined;
          return (
            <YouBubble
              key={r.key}
              body={r.pending.text}
              when={timeLabel(r.pending.at, now)}
              state={state}
            />
          );
        }
        const m = r.message;
        const when = timeLabel(m.at, now);
        if (m.kind === "you")
          return (
            <YouBubble
              key={r.key}
              body={m.body}
              when={when}
              state={sentIds.includes(m.id) ? SUPPORT_COPY.stateSent : undefined}
            />
          );
        if (m.kind === "ai") return <AiBubble key={r.key} message={m} when={when} />;
        if (m.kind === "support") return <PersonBubble key={r.key} body={m.body} when={when} />;
        return <SystemLine key={r.key} text={m.body} />;
      })}
      {typing && <Typing />}
    </>
  );
}

function Divider({ label, fresh }: { label: string; fresh?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 ds-type-overline ${fresh ? "text-ds-action-text" : "text-ds-ink-faint"}`}
      data-divider={fresh ? "new" : "day"}
    >
      <span aria-hidden="true" className={`h-px flex-1 ${fresh ? "bg-ds-action" : "bg-ds-line"}`} />
      {label}
      <span aria-hidden="true" className={`h-px flex-1 ${fresh ? "bg-ds-action" : "bg-ds-line"}`} />
    </div>
  );
}

function Who({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 ds-type-overline text-ds-ink-soft">{children}</div>
  );
}

function Tag({ children, quiet }: { children: ReactNode; quiet?: boolean }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 ${quiet ? "bg-ds-sunk text-ds-ink-soft" : "bg-ds-action-tint text-ds-action-text"}`}
    >
      {children}
    </span>
  );
}

function YouBubble({ body, when, state }: { body: string; when: string; state?: string }) {
  return (
    <div className="grid max-w-[86%] gap-1 self-end" data-kind="you">
      <div className="justify-self-end ds-type-overline text-ds-ink-soft">{SUPPORT_COPY.you}</div>
      <div className="whitespace-pre-wrap break-words rounded-[20px_20px_6px_20px] bg-ds-choice px-3.5 py-2.5 ds-type-body text-ds-card">
        {body}
      </div>
      <div className="justify-self-end ds-type-caption font-semibold text-ds-ink-faint">
        {when}
        {state ? ` · ${state}` : ""}
      </div>
    </div>
  );
}

function AiFace() {
  return (
    <img
      src="/mascots/alphonso-help-head.webp"
      alt=""
      width={34}
      height={34}
      className="size-[34px] shrink-0 rounded-full border-2 border-ds-line bg-ds-choice-tint object-cover"
      draggable={false}
    />
  );
}

function AiBubble({ message, when }: { message: SupportMessage; when: string }) {
  // Defence in depth: the client also checks the id against the allow-list, and the path comes from a fixed table.
  const link: SupportLinkId | null = isSupportLinkId(message.link) ? message.link : null;
  return (
    <div className="grid max-w-[86%] gap-1" data-kind="ai">
      <div className="flex items-end gap-2">
        <AiFace />
        <Who>
          {SUPPORT_COPY.ai} <Tag>{SUPPORT_COPY.aiTag}</Tag>
        </Who>
      </div>
      <div className="whitespace-pre-wrap break-words rounded-[20px_20px_20px_6px] border-2 border-ds-line bg-ds-card px-3.5 py-2.5 ds-type-body text-ds-ink">
        {message.body}
        {link && (
          <div>
            <Link
              to={SUPPORT_LINK_WEB_PATHS[link]}
              data-support-link={link}
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-ds-choice-edge bg-ds-choice-tint px-3 ds-type-footnote font-extrabold text-ds-choice"
            >
              {SUPPORT_LINK_LABELS[link]}
              <HelpIcon name="arrow" className="size-3.5" />
            </Link>
          </div>
        )}
      </div>
      <div className="ds-type-caption font-semibold text-ds-ink-faint">{when}</div>
    </div>
  );
}

function PersonBubble({ body, when }: { body: string; when: string }) {
  return (
    <div className="grid max-w-[86%] gap-1" data-kind="support">
      <div className="flex items-end gap-2">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-ds-brand text-ds-surface">
          <HelpIcon name="person" className="size-[18px]" />
        </span>
        <Who>
          {SUPPORT_COPY.person} <Tag quiet>{SUPPORT_COPY.personTag}</Tag>
        </Who>
      </div>
      <div className="whitespace-pre-wrap break-words rounded-[20px_20px_20px_6px] border-2 border-ds-choice-edge bg-ds-choice-tint px-3.5 py-2.5 ds-type-body text-ds-ink">
        {body}
      </div>
      <div className="ds-type-caption font-semibold text-ds-ink-faint">{when}</div>
    </div>
  );
}

function SystemLine({ text }: { text: string }) {
  return (
    <div
      data-kind="system"
      className="max-w-[88%] self-center rounded-xl bg-ds-sunk px-3 py-1.5 text-center ds-type-caption text-ds-ink-soft"
    >
      {text}
    </div>
  );
}

function Typing() {
  return (
    <div className="grid max-w-[86%] gap-1" data-typing="">
      <div className="flex items-end gap-2">
        <AiFace />
        <Who>
          {SUPPORT_COPY.ai} <Tag>{SUPPORT_COPY.aiTag}</Tag> {SUPPORT_COPY.isWriting}
        </Who>
      </div>
      <div
        className="flex w-fit items-center gap-1.5 rounded-[20px_20px_20px_6px] border-2 border-ds-line bg-ds-card px-4 py-3.5"
        aria-hidden="true"
      >
        <i className="block size-2 rounded-full bg-ds-ink-faint" />
        <i className="block size-2 rounded-full bg-ds-ink-faint opacity-65" />
        <i className="block size-2 rounded-full bg-ds-ink-faint opacity-35" />
      </div>
    </div>
  );
}

function ErrorCard({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="grid gap-2 rounded-[16px] border-2 border-ds-wrong bg-ds-wrong-tint px-3 py-2.5 ds-type-footnote text-ds-wrong-ink"
      data-error=""
    >
      <div>{text}</div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-[12px] bg-ds-action px-3.5 ds-type-footnote font-extrabold text-ds-on-action shadow-[0_3px_0_var(--c-action-edge)]"
      >
        <HelpIcon name="retry" className="size-4" />
        {SUPPORT_COPY.tryAgain}
      </button>
    </div>
  );
}

function DailyLimit() {
  return (
    <div className="grid justify-items-center gap-2 pt-1.5 text-center" data-limit="daily">
      <img
        src="/mascots/alphonso-sleepy-night.webp"
        alt=""
        height={150}
        className="h-[150px] w-auto"
        draggable={false}
      />
      <p className="m-0 ds-type-footnote font-bold text-ds-ink">{SUPPORT_COPY.dailyLimit}</p>
      <p className="m-0 ds-type-caption font-medium text-ds-ink-soft">
        {SUPPORT_COPY.dailyLimitNote}
      </p>
    </div>
  );
}
