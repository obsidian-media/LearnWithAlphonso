import { describe, expect, it, vi } from "vitest";
import { createPodcastAudioFlows, type AudioServer } from "./podcastApi";

/** The two audio flows keep their order: signed URL, direct upload, then the server proves it is audio (the write, with the reason). */
const file = new File(["12345"], "ep.mp3", { type: "audio/mpeg" });
const INPUT = {
  folderId: "f1",
  slug: "ep",
  title: "Ep",
  description: null,
  course: "en" as const,
  levelId: null,
};

function setup(putStatus = 200) {
  const order: string[] = [];
  const server: AudioServer = {
    createAudioUploadUrl: vi.fn(async () => {
      order.push("signed-url");
      return { signedUrl: "https://storage.test/signed" };
    }),
    verifyUploadedAudio: vi.fn(async () => {
      order.push("verify");
      return { durationSeconds: 61 };
    }),
    createEpisodeUploadUrl: vi.fn(async () => {
      order.push("signed-url");
      return { signedUrl: "https://storage.test/signed" };
    }),
    createEpisode: vi.fn(async () => {
      order.push("create");
      return { durationSeconds: 75 };
    }),
  };
  const put = vi.fn(async () => {
    order.push("put");
    return new Response(null, { status: putStatus });
  }) as unknown as typeof fetch;
  return { order, server, put, flows: createPodcastAudioFlows(server, put) };
}

describe("replace audio", () => {
  it("asks for a signed URL (episode id and size only), PUTs the file, then verifies with the reason", async () => {
    const { order, server, put, flows } = setup();
    const result = await flows.replaceAudio("e1", file, "new master");
    expect(order).toEqual(["signed-url", "put", "verify"]);
    expect(result).toEqual({ durationSeconds: 61 });
    expect(server.createAudioUploadUrl).toHaveBeenCalledWith({
      data: { episodeId: "e1", declaredBytes: 5 },
    });
    expect(put).toHaveBeenCalledWith("https://storage.test/signed", {
      method: "PUT",
      headers: { "content-type": "audio/mpeg" },
      body: file,
    });
    // the reason travels with the write (verify), never with the signed-URL request
    expect(server.verifyUploadedAudio).toHaveBeenCalledWith({
      data: { episodeId: "e1", reason: "new master" },
    });
    expect(
      JSON.stringify((server.createAudioUploadUrl as ReturnType<typeof vi.fn>).mock.calls),
    ).not.toContain("new master");
  });

  it("a failed upload stops before the server is asked to verify and say it worked", async () => {
    const { server, flows } = setup(500);
    await expect(flows.replaceAudio("e1", file, "new master")).rejects.toThrow(
      "The upload did not complete.",
    );
    expect(server.verifyUploadedAudio).not.toHaveBeenCalled();
  });

  it("a file with no type is sent as application/octet-stream", async () => {
    const { put, flows } = setup();
    await flows.replaceAudio("e1", new File(["1"], "x.mp3"), "new master");
    expect(
      (put as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1].headers["content-type"],
    ).toBe("application/octet-stream");
  });
});

describe("create episode", () => {
  it("signed URL with the draft and size, PUT the file, then create with the reason", async () => {
    const { order, server, flows } = setup();
    const result = await flows.createEpisode(INPUT, file, "new series");
    expect(order).toEqual(["signed-url", "put", "create"]);
    expect(result).toEqual({ durationSeconds: 75 });
    expect(server.createEpisodeUploadUrl).toHaveBeenCalledWith({
      data: { ...INPUT, declaredBytes: 5 },
    });
    expect(server.createEpisode).toHaveBeenCalledWith({ data: { ...INPUT, reason: "new series" } });
  });

  it("a failed upload never creates the episode", async () => {
    const { server, flows } = setup(403);
    await expect(flows.createEpisode(INPUT, file, "new series")).rejects.toThrow(
      "The upload did not complete.",
    );
    expect(server.createEpisode).not.toHaveBeenCalled();
  });
});
