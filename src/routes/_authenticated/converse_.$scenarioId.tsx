import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { LessonFrame } from "../../components/AppShell";
import { getScenario } from "../../data/scenarios";
import { authHeaders } from "../../lib/auth-headers";
import { readApiError } from "../../lib/read-api-error";
import { fetchProgress } from "../../lib/sync.functions";

export const Route = createFileRoute("/_authenticated/converse_/$scenarioId")({
  component: ConverseChatPage,
  loader: ({ params }) => {
    const scenario = getScenario(params.scenarioId);
    if (!scenario) throw notFound();
    return { scenario };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.scenario.title ?? "Chat"} — Alphonso` },
      {
        name: "description",
        content: `Roleplay ${loaderData?.scenario.title?.toLowerCase() ?? "a scene"} with an AI English tutor.`,
      },
      { property: "og:title", content: `${loaderData?.scenario.title ?? "Chat"} — Alphonso` },
      { property: "og:description", content: "Practice real English out loud with an AI tutor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/**
 * V3 package 3a: maps Deepgram's utterance-level STT confidence to a
 * lightweight pronunciation-clarity label -- not real phoneme-level
 * pronunciation scoring, just "how clearly did the recognizer hear you."
 * Thresholds are a starting judgment call, not tuned against real data.
 */
function clarityLabel(confidence: number): { label: string; dotClassName: string } {
  if (confidence >= 0.85) return { label: "Clear", dotClassName: "bg-emerald-500" };
  if (confidence >= 0.6) return { label: "Okay", dotClassName: "bg-amber-500" };
  return { label: "Unclear", dotClassName: "bg-rose-500" };
}

type Msg = {
  role: "user" | "assistant";
  content: string;
  /** V3 package 3a: Deepgram's utterance-level STT confidence (0-1) for a
   * voice-transcribed user message, used as a lightweight pronunciation-
   * clarity heuristic. Undefined for typed messages and assistant replies. */
  confidence?: number | null;
};

function ConverseChatPage() {
  const { scenario } = Route.useLoaderData();
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: scenario.opener },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ttsOn, setTtsOn] = useState(true);
  // Adaptive difficulty (V3 package 3a): scenarios are English-only, so
  // this always reads the "en" course's level. Best-effort -- if the
  // fetch fails, /api/chat just falls back to no difficulty hint at all
  // (see chat.ts's withDifficultyHint), same as before this feature.
  const [cefrLevel, setCefrLevel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchProgress({ data: { course: "en" } })
      .then((p) => {
        if (!cancelled) setCefrLevel(p.cefrLevel);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // getUserMedia is async, so a release (mouseup/touchend/keyup) can land
  // before the MediaRecorder even exists -- stopRecording() would then be
  // a no-op and the mic would stay hot with no way to stop it. This flag
  // records "the user already asked to stop" so startRecording can honor
  // it the moment the recorder is actually created.
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const speak = useCallback(
    async (text: string) => {
      if (!ttsOn) return;
      try {
        const resp = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ text }),
        });
        if (!resp.ok) return;
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.pause();
        }
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => URL.revokeObjectURL(url);
        void audio.play().catch(() => {});
      } catch {
        /* ignore */
      }
    },
    [ttsOn],
  );

  // Auto-speak the opener once on mount
  const openerSpokenRef = useRef(false);
  useEffect(() => {
    if (openerSpokenRef.current) return;
    openerSpokenRef.current = true;
    // Delay so user gesture-less autoplay policies are less strict after nav
    const t = setTimeout(() => void speak(scenario.opener), 400);
    return () => clearTimeout(t);
  }, [scenario.opener, speak]);

  const send = useCallback(
    async (text: string, confidence?: number | null) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setError(null);
      const next: Msg[] = [...messages, { role: "user", content: trimmed, confidence }];
      setMessages(next);
      setInput("");
      setSending(true);
      try {
        const resp = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({
            systemPrompt: scenario.systemPrompt,
            cefrLevel,
            // Only role/content -- confidence is this app's own UI
            // metadata, not part of the chat wire format.
            messages: next.map(({ role, content }) => ({ role, content })),
          }),
        });
        if (!resp.ok) {
          const t = await readApiError(resp);
          throw new Error(
            resp.status === 429
              ? t || "Daily limit reached — try again tomorrow."
              : resp.status === 402
                ? "AI credits exhausted. Add credits to keep chatting."
                : t || "Something went wrong.",
          );
        }
        const data = (await resp.json()) as { content?: string };
        const reply = (data.content ?? "").trim() || "…";
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
        void speak(reply);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setSending(false);
      }
    },
    [messages, scenario.systemPrompt, cefrLevel, sending, speak],
  );

  const startRecording = useCallback(async () => {
    setError(null);
    stopRequestedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // The user already released/cancelled while permission was pending --
      // don't start recording at all, just release the mic immediately.
      if (stopRequestedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const type = rec.mimeType || mime || "audio/webm";
        const ext = type.includes("mp4") ? "mp4" : type.includes("mpeg") ? "mp3" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size < 1024) {
          setError("That was too short — try again.");
          return;
        }
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("file", blob, `recording.${ext}`);
          const resp = await fetch("/api/stt", {
            method: "POST",
            headers: await authHeaders(),
            body: fd,
          });
          if (!resp.ok) throw new Error((await readApiError(resp)) || "Transcription failed");
          const data = (await resp.json()) as { text?: string; confidence?: number | null };
          const text = (data.text ?? "").trim();
          if (!text) {
            setError("Didn't catch that — try again.");
          } else {
            await send(text, data.confidence);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Transcription failed.");
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone access is needed to speak.");
      setRecording(false);
    }
  }, [send]);

  const stopRecording = useCallback(() => {
    stopRequestedRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    setRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    };
  }, []);

  return (
    <LessonFrame>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-surface/90 px-5 py-3.5 backdrop-blur-md">
        <Link
          to="/converse"
          aria-label="Back"
          className="grid size-9 place-items-center rounded-full border border-hairline bg-surface text-ink-soft transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">{scenario.emoji}</span>
            <h1 className="truncate font-display text-[17px] font-semibold text-ink">
              {scenario.title}
            </h1>
          </div>
          <p className="truncate text-[11px] text-ink-soft/70">{scenario.blurb}</p>
        </div>
        <button
          onClick={() => setTtsOn((v) => !v)}
          aria-pressed={ttsOn}
          aria-label={ttsOn ? "Mute voice" : "Unmute voice"}
          className={`grid size-9 place-items-center rounded-full border transition-colors ${
            ttsOn
              ? "border-moss/30 bg-moss/10 text-moss"
              : "border-hairline bg-surface text-ink-soft/60"
          }`}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
            {ttsOn ? (
              <>
                <path
                  d="M4 10v4h4l5 4V6L8 10H4z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M16 9c1.2 1 1.2 5 0 6M18.5 7c2.2 2 2.2 8 0 10"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <path
                  d="M4 10v4h4l5 4V6L8 10H4z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M17 9l5 6M22 9l-5 6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </>
            )}
          </svg>
        </button>
      </header>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 overflow-y-auto px-5 py-6"
      >
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" ? (
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-parchment px-4 py-2.5 text-[15px] leading-relaxed text-ink">
                  {m.content}
                </div>
              ) : (
                <div className="flex max-w-[85%] flex-col items-end gap-1">
                  <div className="rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-surface">
                    {m.content}
                  </div>
                  {typeof m.confidence === "number" &&
                    (() => {
                      const clarity = clarityLabel(m.confidence);
                      return (
                        <span className="flex items-center gap-1 pr-1 text-[10px] text-ink-soft/60">
                          <span
                            aria-hidden="true"
                            className={`size-1.5 rounded-full ${clarity.dotClassName}`}
                          />
                          {clarity.label} pronunciation
                        </span>
                      );
                    })()}
                </div>
              )}
            </div>
          ))}
          {(sending || transcribing) && (
            <div className="flex justify-start" role="status">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-parchment px-4 py-3">
                <span className="size-1.5 animate-bounce rounded-full bg-ink-soft/60 [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-ink-soft/60 [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-ink-soft/60" />
              </div>
              <span className="sr-only">{transcribing ? "Transcribing…" : "Thinking…"}</span>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="self-center rounded-full border border-rose-300/60 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-700"
            >
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-hairline bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-3 backdrop-blur-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2"
        >
          <button
            type="button"
            onClick={() => {
              if (recording) {
                stopRecording();
              } else {
                void startRecording();
              }
            }}
            aria-label={recording ? "Stop recording and send" : "Record a voice message"}
            aria-pressed={recording}
            disabled={sending || transcribing}
            className={`grid size-11 shrink-0 place-items-center rounded-full transition-transform ${
              recording
                ? "bg-ember text-ink-on-ember scale-110 hard-shadow-ember"
                : "bg-moss text-surface hard-shadow"
            } disabled:opacity-50`}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
              <rect
                x="9"
                y="3"
                width="6"
                height="12"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M5 11a7 7 0 0 0 14 0M12 18v3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="flex flex-1 items-end rounded-2xl border border-hairline bg-surface px-3 py-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder={recording ? "Listening…" : "Type or tap the mic"}
              disabled={sending || transcribing || recording}
              className="max-h-32 min-h-[24px] w-full resize-none bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-soft/50"
            />
          </div>
          <button
            type="submit"
            disabled={sending || transcribing || !input.trim()}
            aria-label="Send"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-surface transition-opacity disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
              <path
                d="M5 12l14-7-4 7 4 7-14-7z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      </div>
    </LessonFrame>
  );
}
