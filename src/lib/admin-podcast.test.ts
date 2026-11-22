import { beforeEach, describe, expect, it, vi } from "vitest";
import { asTestFns, chainable } from "./__testutils__/supabase-mock";
import { setStaff } from "./__testutils__/staff-harness";
import { REASON_MESSAGE } from "./staff-audit.server";
import { UNPUBLISHABLE_PROVIDER_MESSAGE } from "./podcast-provenance";

/**
 * The Podcast screens' server side with the REAL staff authorization in the loop: every one of the nine writes refuses a
 * missing, short or long reason BEFORE it touches the database or storage, and with a reason calls its staff_podcast_*
 * SQL function (which checks the reason again and records the change in the same transaction). A person without
 * podcasts.manage is refused before anything. The SQL itself is executed in admin-podcast-migration.test.ts.
 */
vi.mock(
  "./staff-middleware",
  async () => (await import("./__testutils__/staff-harness")).staffMiddlewareMock,
);
vi.mock(
  "@tanstack/react-start",
  async () => (await import("./__testutils__/staff-harness")).startMock,
);
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

const mod = await import("./admin.functions");
const fns = asTestFns({
  adminListFolders: mod.adminListFolders,
  adminListEpisodes: mod.adminListEpisodes,
  adminCreateFolder: mod.adminCreateFolder,
  adminRenameFolder: mod.adminRenameFolder,
  adminMoveFolder: mod.adminMoveFolder,
  adminDeleteFolder: mod.adminDeleteFolder,
  adminUpdateEpisode: mod.adminUpdateEpisode,
  adminSetPublished: mod.adminSetPublished,
  adminCreateEpisode: mod.adminCreateEpisode,
  adminVerifyUploadedAudio: mod.adminVerifyUploadedAudio,
  adminSaveTranscript: mod.adminSaveTranscript,
});

const STAFF = "00000000-0000-4000-8000-0000000000b1";
const NOBODY = "00000000-0000-4000-8000-0000000000b2";
const F = "00000000-0000-4000-8000-0000000000f1";
const P = "00000000-0000-4000-8000-0000000000f2";
const E = "00000000-0000-4000-8000-0000000000e1";
const REASON = "fixing the intro";

beforeEach(() => {
  setStaff({
    [STAFF]: { role: "support", scopes: ["podcasts.manage"] },
    [NOBODY]: { role: "support", scopes: ["support.read"] },
  });
});

/** A client whose rpc answers `answer` and whose storage and tables are never to be touched by a refused call. */
function client(
  answer: { data?: unknown; error?: { message: string; code?: string } | null } = {},
) {
  const untouched = () => {
    throw new Error("touched the database or storage");
  };
  return {
    rpc: vi.fn(async () => ({ data: answer.data ?? true, error: answer.error ?? null })),
    from: vi.fn(untouched),
    storage: { from: vi.fn(untouched) },
  };
}
const ctx = (supabaseAdmin: unknown, userId = STAFF) => ({ supabaseAdmin, userId });

type Write = {
  name: keyof typeof fns;
  data: Record<string, unknown>;
  /** The SQL function a successful call reaches; null for the two audio writes (their reason check is what is proven here). */
  sql: string | null;
};
const WRITES: Write[] = [
  {
    name: "adminCreateFolder",
    data: { parentId: null, slug: "fresh", title: "Fresh" },
    sql: "staff_podcast_folder_create",
  },
  { name: "adminRenameFolder", data: { id: F, title: "New" }, sql: "staff_podcast_folder_rename" },
  { name: "adminDeleteFolder", data: { id: F }, sql: "staff_podcast_folder_delete" },
  {
    name: "adminUpdateEpisode",
    data: { id: E, title: "New" },
    sql: "staff_podcast_episode_update",
  },
  {
    name: "adminSaveTranscript",
    data: { episodeId: E, text: "Hello there" },
    sql: "staff_podcast_transcript_save",
  },
  { name: "adminCreateEpisode", data: { folderId: F, slug: "ep", title: "Ep" }, sql: null },
  { name: "adminVerifyUploadedAudio", data: { episodeId: E }, sql: null },
];

describe("every podcast write refuses without a valid reason, before anything is touched", () => {
  const writes: Write[] = [
    ...WRITES,
    { name: "adminMoveFolder", data: { id: F, parentId: null }, sql: "staff_podcast_folder_move" },
    {
      name: "adminSetPublished",
      data: { id: E, published: false },
      sql: "staff_podcast_episode_set_published",
    },
  ];
  for (const w of writes) {
    for (const [label, reason] of [
      ["missing", undefined],
      ["empty", ""],
      ["blank", "   "],
      ["two characters", "ab"],
      ["501 characters", "x".repeat(501)],
    ] as const) {
      it(`${w.name}: a ${label} reason is refused`, async () => {
        const db = client();
        const data = reason === undefined ? w.data : { ...w.data, reason };
        const call = fns[w.name]({ data, context: ctx(db) });
        // a missing reason fails the input check; the rest fail validateReason, with the same sentence the screen shows
        await expect(call).rejects.toThrow(
          reason === undefined ? /reason|Required|invalid/i : REASON_MESSAGE,
        );
        expect(db.rpc).not.toHaveBeenCalled();
        expect(db.from).not.toHaveBeenCalled();
        expect(db.storage.from).not.toHaveBeenCalled();
      });
    }
    it(`${w.name}: a person without podcasts.manage is refused before anything`, async () => {
      const db = client();
      await expect(
        fns[w.name]({ data: { ...w.data, reason: REASON }, context: ctx(db, NOBODY) }),
      ).rejects.toThrow(/missing scope podcasts\.manage/);
      expect(db.rpc).not.toHaveBeenCalled();
    });
  }

  for (const w of writes.filter((x) => x.sql)) {
    it(`${w.name}: with a reason it calls ${w.sql} as the signed-in person, passing the trimmed reason`, async () => {
      const db = client({
        data:
          w.name === "adminCreateFolder" ? F : w.name === "adminSaveTranscript" ? "saved" : true,
      });
      // delete and move read their tables first (an empty folder, an empty tree)
      db.from.mockReturnValue(chainable({ data: [], count: 0, error: null }) as never);
      await fns[w.name]({ data: { ...w.data, reason: `  ${REASON}  ` }, context: ctx(db) });
      expect(db.rpc).toHaveBeenCalledTimes(1);
      const [name, args] = db.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(name).toBe(w.sql);
      expect(args).toMatchObject({ p_actor: STAFF, p_role: "support", p_reason: REASON });
    });
  }
});

describe("what the database says becomes a sentence a person can act on", () => {
  const pairs: [
    string,
    Write,
    { data?: unknown; error: { message: string; code?: string } },
    RegExp,
  ][] = [
    [
      "a duplicate slug",
      WRITES[0]!,
      { error: { message: "duplicate key", code: "23505" } },
      /already exists here/,
    ],
    [
      "a folder that still has things in it",
      WRITES[2]!,
      { error: { message: "violates", code: "23001" } },
      /inside this folder first/,
    ],
    [
      "a folder that was already deleted",
      WRITES[2]!,
      { data: false, error: null as never },
      /already deleted/,
    ],
    [
      "an episode that is gone",
      WRITES[3]!,
      { data: false, error: null as never },
      /no longer exists/,
    ],
  ];
  for (const [label, w, answer, expected] of pairs) {
    it(label, async () => {
      const db = client(answer as never);
      db.from.mockReturnValue(chainable({ data: [], count: 0, error: null }) as never);
      if (answer.data === false) db.rpc.mockResolvedValue({ data: false, error: null });
      await expect(
        fns[w.name]({ data: { ...w.data, reason: REASON }, context: ctx(db) }),
      ).rejects.toThrow(expected);
    });
  }

  it("publishing audio the app may not distribute shows the shared message", async () => {
    // the row is read first (voice_provider), so the table answers; the SQL function is never reached
    const db = client();
    db.from.mockReturnValue(
      chainable({ data: { voice_provider: "unknown" }, error: null }) as never,
    );
    await expect(
      fns.adminSetPublished({ data: { id: E, published: true, reason: REASON }, context: ctx(db) }),
    ).rejects.toThrow(UNPUBLISHABLE_PROVIDER_MESSAGE);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("the table's own licence CHECK is translated too (a race past the first check)", async () => {
    const db = client({ error: { message: "check", code: "23514" } });
    db.from.mockReturnValue(
      chainable({ data: { voice_provider: "deepgram" }, error: null }) as never,
    );
    await expect(
      fns.adminSetPublished({ data: { id: E, published: true, reason: REASON }, context: ctx(db) }),
    ).rejects.toThrow(UNPUBLISHABLE_PROVIDER_MESSAGE);
  });

  it("a move that would loop is refused with a readable sentence", async () => {
    const db = client();
    db.from.mockReturnValue(
      chainable({
        data: [
          { id: F, parent_id: null, slug: "a", title: "A", description: null, sort_order: 0 },
          { id: P, parent_id: F, slug: "b", title: "B", description: null, sort_order: 0 },
        ],
        error: null,
      }) as never,
    );
    await expect(
      fns.adminMoveFolder({ data: { id: F, parentId: P, reason: REASON }, context: ctx(db) }),
    ).rejects.toThrow(/inside itself/);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("the reads show only what is real", () => {
  const folderRows = [
    { id: F, parent_id: null, slug: "a", title: "A", description: null, sort_order: 0 },
    { id: P, parent_id: F, slug: "b", title: "B", description: null, sort_order: 1 },
  ];
  function listClient(counts: { data?: unknown; error?: unknown }) {
    return {
      from: vi.fn(() => chainable({ data: folderRows, error: null })),
      rpc: vi.fn(async () => ({ data: counts.data ?? null, error: counts.error ?? null })),
    };
  }

  it("folder counts come from the grouped database function; a folder it does not list has a real zero", async () => {
    const db = listClient({ data: [{ folder_id: F, total: 5, published: 3 }] });
    const rows = await fns.adminListFolders({ context: ctx(db) });
    expect(db.rpc).toHaveBeenCalledWith("staff_podcast_folder_counts");
    expect(rows.find((r: { id: string }) => r.id === F)).toMatchObject({
      episodeCount: 5,
      publishedCount: 3,
    });
    expect(rows.find((r: { id: string }) => r.id === P)).toMatchObject({
      episodeCount: 0,
      publishedCount: 0,
    });
  });

  it("when the counts cannot be read they are null, never 0", async () => {
    const db = listClient({ error: { message: "down" } });
    const rows = await fns.adminListFolders({ context: ctx(db) });
    for (const r of rows) expect(r).toMatchObject({ episodeCount: null, publishedCount: null });
  });

  it("an episode's audio URL is built by the storage client from audio_path (no host written in the code)", async () => {
    const getPublicUrl = vi.fn((p: string) => ({
      data: { publicUrl: `https://cdn.test/bucket/${p}` },
    }));
    const db = {
      from: vi.fn(() =>
        chainable({
          data: [
            {
              id: E,
              folder_id: F,
              slug: "a",
              title: "Alpha",
              description: null,
              duration_seconds: 61,
              published: true,
              audio_path: "one/two/a.mp3",
              published_at: "2026-11-06T10:00:00Z",
              course: "en",
              voice_provider: "deepgram",
              voice_model: "aura-2-saturn-en",
            },
          ],
          error: null,
        }),
      ),
      storage: { from: vi.fn(() => ({ getPublicUrl })) },
    };
    const [row] = await fns.adminListEpisodes({ data: { folderId: F }, context: ctx(db) });
    expect(db.storage.from).toHaveBeenCalledWith("podcast-audio");
    expect(getPublicUrl).toHaveBeenCalledWith("one/two/a.mp3");
    expect(row).toMatchObject({
      audioUrl: "https://cdn.test/bucket/one/two/a.mp3",
      publishedAt: "2026-11-06T10:00:00Z",
      course: "en",
      voiceProvider: "deepgram",
      voiceModel: "aura-2-saturn-en",
    });
  });
});
