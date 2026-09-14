import { resolveLyrics, resolveLyricsAttributed } from "./resolveLyrics";
import type { LyricsResult } from "@/providers/contracts/ServerAdapter";
import type { LyricsSongInfo, ResolveLyricsAttributedInput } from "./resolveLyrics";
import type { Song } from "@/domain/entities/Song";
import type { Provider } from "@/providers/contracts/Provider";
import type { BrokerInput } from "@/providers/registry/capabilityBroker";
import { serverProvenance } from "@/domain/identity/Provenance";
import { makeLocalId } from "@/domain/identity/LocalId";

const song: LyricsSongInfo = { songId: "s1", title: "T", artist: "A" };

const serverResult: LyricsResult = { synced: true, lines: [{ startMs: 0, text: "server" }] };
const lrclibResult: LyricsResult = { synced: true, lines: [{ startMs: 0, text: "lrclib" }] };

describe("resolveLyrics", () => {
  it("returns the server result without calling any external source", async () => {
    const getServerLyrics = jest.fn().mockResolvedValue(serverResult);
    const lrclibFetcher = jest.fn();

    const result = await resolveLyrics({
      song,
      getServerLyrics,
      enabledExternalSourcesInOrder: ["lrclib"],
      fetchers: { lrclib: lrclibFetcher },
    });

    expect(result).toEqual(serverResult);
    expect(lrclibFetcher).not.toHaveBeenCalled();
  });

  it("is server-only when nothing external is enabled (today's behavior)", async () => {
    const getServerLyrics = jest.fn().mockResolvedValue(null);
    const lrclibFetcher = jest.fn().mockResolvedValue(lrclibResult);

    const result = await resolveLyrics({
      song,
      getServerLyrics,
      enabledExternalSourcesInOrder: [],
      fetchers: { lrclib: lrclibFetcher },
    });

    expect(result).toBeNull();
    expect(lrclibFetcher).not.toHaveBeenCalled();
  });

  it("falls through to an enabled external source when the server has nothing", async () => {
    const getServerLyrics = jest.fn().mockResolvedValue(null);
    const lrclibFetcher = jest.fn().mockResolvedValue(lrclibResult);

    const result = await resolveLyrics({
      song,
      getServerLyrics,
      enabledExternalSourcesInOrder: ["lrclib"],
      fetchers: { lrclib: lrclibFetcher },
    });

    expect(result).toEqual(lrclibResult);
    expect(lrclibFetcher).toHaveBeenCalledWith(song);
  });

  it("treats an empty-lines server result the same as no result", async () => {
    const getServerLyrics = jest.fn().mockResolvedValue({ synced: true, lines: [] });
    const lrclibFetcher = jest.fn().mockResolvedValue(lrclibResult);

    const result = await resolveLyrics({
      song,
      getServerLyrics,
      enabledExternalSourcesInOrder: ["lrclib"],
      fetchers: { lrclib: lrclibFetcher },
    });

    expect(result).toEqual(lrclibResult);
  });

  it("tries sources in the user's order and stops at the first hit, skipping later ones", async () => {
    // Only "lrclib" ships today, but the resolver is generic over the id
    // type — this proves order/short-circuit behavior ahead of a second
    // real source existing, using a second fake id cast for the test.
    const getServerLyrics = jest.fn().mockResolvedValue(null);
    const first = jest.fn().mockResolvedValue(lrclibResult);
    const second = jest.fn().mockResolvedValue(lrclibResult);

    const result = await resolveLyrics({
      song,
      getServerLyrics,
      enabledExternalSourcesInOrder: ["second", "lrclib"] as unknown as ["lrclib"],
      fetchers: { lrclib: first, second } as unknown as { lrclib: typeof first },
    });

    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(result).toEqual(lrclibResult);
  });

  it("returns null when server and every external source miss", async () => {
    const getServerLyrics = jest.fn().mockResolvedValue(null);
    const lrclibFetcher = jest.fn().mockResolvedValue(null);

    const result = await resolveLyrics({
      song,
      getServerLyrics,
      enabledExternalSourcesInOrder: ["lrclib"],
      fetchers: { lrclib: lrclibFetcher },
    });

    expect(result).toBeNull();
  });
});

const SERVER = serverProvenance("srv-1");

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    localId: makeLocalId("song", SERVER, "s1"),
    nativeId: "s1",
    provenance: SERVER,
    externalIds: {},
    libraryState: "in-library",
    title: "T",
    artist: { localId: makeLocalId("artist", SERVER, "ar1"), nativeId: "ar1", externalIds: {}, name: "A", cover: { kind: "none" } },
    album: { localId: makeLocalId("album", SERVER, "al1"), nativeId: "al1", externalIds: {}, title: "Al", cover: { kind: "none" } },
    cover: { kind: "none" },
    durationSeconds: 100,
    contentKind: "song",
    genres: [],
    ...overrides,
  };
}

function lyricsProvider(id: string, invoke: jest.Mock): Provider {
  return {
    kind: "integration",
    id,
    presentation: { nameKey: `provider.${id}`, icon: 0 },
    auth: { tier: "none" },
    capabilities: { lyrics: invoke },
    testConnection: async () => ({ ok: true }),
  };
}

function broker(providers: Provider[], order?: string[]): BrokerInput {
  return { providers, isConnected: () => true, isAllowed: () => true, order };
}

describe("resolveLyricsAttributed", () => {
  it("returns the origin's lyrics, attributed to it, without calling any broker offer", async () => {
    const song = makeSong();
    const getServerLyrics = jest.fn().mockResolvedValue({ lines: [{ startMs: 0, text: "server" }], synced: true });
    const invoke = jest.fn();
    const input: ResolveLyricsAttributedInput = {
      song,
      getServerLyrics,
      broker: broker([lyricsProvider("lrclib", invoke)]),
    };

    const result = await resolveLyricsAttributed(input);

    expect(invoke).not.toHaveBeenCalled();
    expect(result).toEqual({ value: { lines: [{ startMs: 0, text: "server" }], synced: true }, sourceId: "srv-1" });
  });

  it("zero calls when the lyrics capability is disabled", async () => {
    const song = makeSong();
    const getServerLyrics = jest.fn().mockResolvedValue(null);
    const invoke = jest.fn();
    const brokerInput = broker([lyricsProvider("lrclib", invoke)]);
    brokerInput.isAllowed = () => false;

    const result = await resolveLyricsAttributed({ song, getServerLyrics, broker: brokerInput });

    expect(invoke).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("falls through to the first enabled offer, attributed to it", async () => {
    const song = makeSong();
    const getServerLyrics = jest.fn().mockResolvedValue(null);
    const invoke = jest.fn().mockResolvedValue({ lines: [{ startMs: 0, text: "external" }], synced: false });

    const result = await resolveLyricsAttributed({
      song,
      getServerLyrics,
      broker: broker([lyricsProvider("lrclib", invoke)]),
    });

    expect(result).toEqual({ value: { lines: [{ startMs: 0, text: "external" }], synced: false }, sourceId: "lrclib" });
  });

  it("stops at the first hit, in the broker's order — zero calls to later providers", async () => {
    const song = makeSong();
    const getServerLyrics = jest.fn().mockResolvedValue(null);
    const first = jest.fn().mockResolvedValue({ lines: [{ startMs: 0, text: "hit" }], synced: true });
    const second = jest.fn();

    await resolveLyricsAttributed({
      song,
      getServerLyrics,
      broker: broker([lyricsProvider("alpha", first), lyricsProvider("beta", second)], ["alpha", "beta"]),
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("returns null when the origin and every offer miss", async () => {
    const song = makeSong();
    const getServerLyrics = jest.fn().mockResolvedValue(null);
    const invoke = jest.fn().mockResolvedValue(null);

    const result = await resolveLyricsAttributed({
      song,
      getServerLyrics,
      broker: broker([lyricsProvider("lrclib", invoke)]),
    });

    expect(result).toBeNull();
  });
});
