import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { MobileFrame } from "@/components/AppShell";
import { MemoryScreen, type MemoryView } from "@/components/memory/MemoryScreen";
import {
  fetchGoalsNote,
  fetchTutorMemory,
  forgetEverything,
  removeMemoryLine,
  saveGoalPatch,
} from "@/lib/call-recap-api";
import { getProfileOverview } from "@/lib/profile.functions";
import { useProgress } from "@/lib/progress";
import { authHeaders } from "@/lib/auth-headers";
import { voiceFor } from "@/lib/voice-prefs";
import { removeGoalPatch } from "@/lib/tutor-memory-view";
import { weakSpots } from "@/lib/profile-overview";

export const Route = createFileRoute("/_authenticated/profile_/memory")({
  component: MemoryPage,
  head: () => ({
    meta: [
      { title: "What Alphonso remembers — Alphonso" },
      {
        name: "description",
        content: "The notes Alphonso keeps between calls. Read them, fix them or delete them.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function MemoryPage() {
  const qc = useQueryClient();
  const course = useProgress((s) => s.course);
  const memory = useQuery({ queryKey: ["tutor-memory"], queryFn: fetchTutorMemory, retry: false });
  const locked = memory.data?.status === "not-pro";
  // The locked page is built only from the learner's own weak spots (the same read Profile already makes).
  const overview = useQuery({
    queryKey: ["profile-overview", course],
    queryFn: () => getProfileOverview({ data: { course } }),
    staleTime: 60_000,
    enabled: locked,
  });
  const goals = useQuery({
    queryKey: ["tutor-memory-goals-note"],
    queryFn: fetchGoalsNote,
    enabled: locked,
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["tutor-memory"] });
    await qc.invalidateQueries({ queryKey: ["profile-overview"] });
  }, [qc]);
  const run = useCallback(
    async (fn: () => Promise<boolean>) => {
      setBusy(true);
      try {
        await fn();
      } finally {
        await refresh();
        setBusy(false);
      }
    },
    [refresh],
  );

  const onSpeak = useCallback(
    (text: string) => {
      void (async () => {
        audioRef.current?.pause();
        setSpeaking(text);
        try {
          const voice = await voiceFor("alphonso", course);
          const resp = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await authHeaders()) },
            body: JSON.stringify({ text, course, voice }),
          });
          if (!resp.ok) return setSpeaking(null);
          const url = URL.createObjectURL(await resp.blob());
          const audio = new Audio(url);
          audioRef.current = audio;
          const stop = () => audioRef.current === audio && setSpeaking(null);
          audio.onended = () => {
            URL.revokeObjectURL(url);
            stop();
          };
          audio.onpause = stop;
          audio.onerror = stop;
          await audio.play();
        } catch {
          setSpeaking(null);
        }
      })();
    },
    [course],
  );

  let view: MemoryView;
  const m = memory.data;
  if (memory.isPending) view = { kind: "loading" };
  else if (!m || m.status === "error") view = { kind: "error" };
  else if (m.status === "not-pro") {
    view = {
      kind: "locked",
      weakSpots: weakSpots(overview.data?.weakItems ?? [], 2).top.map((w) => w.display),
      goalsNote: goals.data ?? null,
    };
  } else view = { kind: "ready", data: m.data };

  return (
    <MobileFrame>
      <div className="min-h-dvh bg-ds-surface font-[family-name:var(--ds-font-body)] text-ds-ink">
        <MemoryScreen
          view={view}
          actions={{
            busy,
            speaking,
            onSpeak,
            onRetry: () => void memory.refetch(),
            onRemoveLine: (id) => void run(() => removeMemoryLine(id)),
            onRemoveGoal: (key) => void run(() => saveGoalPatch(removeGoalPatch(key))),
            onAddGoal: (patch) => void run(() => saveGoalPatch(patch)),
            onForgetAll: () => void run(forgetEverything),
          }}
        />
      </div>
    </MobileFrame>
  );
}
