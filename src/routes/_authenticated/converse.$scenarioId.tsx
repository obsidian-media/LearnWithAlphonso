import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { LessonFrame } from "../../components/AppShell";
import { getScenario } from "../../data/scenarios";
import { authHeaders } from "../../lib/auth-headers";

export const Route = createFileRoute("/_authenticated/converse/$scenarioId")({
  component: ConverseChatPage,
  loader: ({ params }) => {
    const scenario = getScenario(params.scenarioId);
    if (!scenario) throw notFound();
    return { scenario };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.scenario.title ?? "Chat"} — Lingua` },
      { name: "description", content: `Roleplay ${loaderData?.scenario.title?.toLowerCase() ?? "a scene"} with an AI English tutor.` },
      { property: "og:title", content: `${loaderData?.scenario.title ?? "Chat"} — Lingua` },
      { property: "og:description", content: "Practice real English out loud with an AI tutor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Msg = { role: "user" | "assistant"; content: string };

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const speak = useCallback(async (text: string) => {
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
  }, [ttsOn]);

  // Auto-speak the opener once on mount
  const openerSpokenRef = useRef(false);
  useEffect(() => {
    if (openerSpokenRef.current) return;
    openerSpokenRef.current = true;
    // Delay so user gesture-less autoplay policies are less strict after nav
    const t = setTimeout(() => void speak(scenario.opener), 400);
    return () => clearTimeout(t);
  }, [scenario.opener, speak]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          systemPrompt: scenario.systemPrompt,
          messages: next,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
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
  }, [messages, scenario.systemPrompt, sending, speak]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
          if (!resp.ok) throw new Error(await resp.text().catch(() => "Transcription failed"));
          const data = (await resp.json()) as { text?: string };
          const text = (data.text ?? "").trim();
          if (!text) {
            setError("Didn't catch that — try again.");
          } else {
            await send(text);
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
          <svg viewBox="0 0 24 24" className="size-4" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
          <svg viewBox="0 0 24 24" className="size-4" fill="none">
            {ttsOn ? (
              <>
                <path d="M4 10v4h4l5 4V6L8 10H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M16 9c1.2 1 1.2 5 0 6M18.5 7c2.2 2 2.2 8 0 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </>
            ) : (
              <>
                <path d="M4 10v4h4l5 4V6L8 10H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M17 9l5 6M22 9l-5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "assistant" ? (
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-parchment px-4 py-2.5 text-[15px] leading-relaxed text-ink">
                  {m.content}
                </div>
              ) : (
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-surface">
                  {m.content}
                </div>
              )}
            </div>
          ))}
          {(sending || transcribing) && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-parchment px-4 py-3">
                <span className="size-1.5 animate-bounce rounded-full bg-ink-soft/60 [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-ink-soft/60 [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-ink-soft/60" />
              </div>
            </div>
          )}
          {error && (
            <div className="self-center rounded-full border border-rose-300/60 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-700">
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
            onMouseDown={(e) => {
              e.preventDefault();
              void startRecording();
            }}
            onMouseUp={stopRecording}
            onMouseLeave={() => {
              if (recording) stopRecording();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              void startRecording();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopRecording();
            }}
            aria-label={recording ? "Release to send" : "Hold to speak"}
            disabled={sending || transcribing}
            className={`grid size-11 shrink-0 place-items-center rounded-full transition-transform ${
              recording
                ? "bg-ember text-surface scale-110 hard-shadow-ember"
                : "bg-moss text-surface hard-shadow"
            } disabled:opacity-50`}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none">
              <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
              placeholder={recording ? "Listening…" : "Type or hold the mic"}
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
            <svg viewBox="0 0 24 24" className="size-5" fill="none">
              <path d="M5 12l14-7-4 7 4 7-14-7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
    </LessonFrame>
  );
}