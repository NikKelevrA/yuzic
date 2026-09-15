import type { Server } from '@/providers/contracts/Server';


const mockRequest = jest.fn();
const mockRequestText = jest.fn();
const mockBuildStreamUrl = jest.fn((path: string) => `https://plex.example${path}`);

jest.mock('./client', () => ({
  createPlexClient: jest.fn(() => ({
    request: mockRequest, requestText: mockRequestText, buildStreamUrl: mockBuildStreamUrl, buildImageUrl: jest.fn(),
  })),
}));

import { createPlexAdapter } from './';
import { PlexRequestError } from './requestError';

const server: Server = {
  id: 'plex',
  type: 'plex',
  serverUrl: 'https://plex.example',
  username: 'Plex',
  auth: { token: 'token' },
  isAuthenticated: true,
};

describe('Plex adapter', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockBuildStreamUrl.mockClear();
  });

  it('pings a protected resource, not public server identity', async () => {
    mockRequest.mockResolvedValue({ MediaContainer: { Directory: [] } });
    await expect(createPlexAdapter(server).auth.ping()).resolves.toBe(true);
    expect(mockRequest).toHaveBeenCalledWith('/library/sections');

    mockRequest.mockRejectedValueOnce(new Error('401'));
    await expect(createPlexAdapter(server).auth.ping()).resolves.toBe(false);
  });

  it('flattens Plex search hubs into Yuzic search results', async () => {
    mockRequest.mockResolvedValue({
      MediaContainer: {
        Hub: [{ Metadata: [{ type: 'track', ratingKey: '7', title: 'Track', grandparentTitle: 'Artist', parentRatingKey: '2', parentTitle: 'Album', Media: [{ duration: 120000, Part: [{ key: '/library/parts/7' }] }] }] }],
      },
    });

    await expect(createPlexAdapter(server).search.search('track')).resolves.toEqual({
      albums: [], artists: [], songs: [expect.objectContaining({ nativeId: '7', title: 'Track', streamId: '/library/parts/7' })],
    });
  });
  it("paginates catalog requests instead of silently stopping at Plex’s first page", async () => {
    mockRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/library/sections") return { MediaContainer: { Directory: [{ key: "1" }] } };
      const start = (init?.headers as Record<string, string> | undefined)?.["X-Plex-Container-Start"];
      return start === "0"
        ? { MediaContainer: { totalSize: 3, Metadata: [
          { type: "track", ratingKey: "1", title: "One", Media: [{ Part: [{ key: "/library/parts/1" }] }] },
          { type: "track", ratingKey: "2", title: "Two", Media: [{ Part: [{ key: "/library/parts/2" }] }] },
        ] } }
        : { MediaContainer: { totalSize: 3, Metadata: [
          { type: "track", ratingKey: "3", title: "Three", Media: [{ Part: [{ key: "/library/parts/3" }] }] },
        ] } };
    });

    await expect(createPlexAdapter(server).tracks.list()).resolves.toHaveLength(3);
    expect(mockRequest).toHaveBeenNthCalledWith(1, "/library/sections");
    expect(mockRequest).toHaveBeenNthCalledWith(2, "/library/sections/1/all?type=10", {
      headers: { "X-Plex-Container-Start": "0", "X-Plex-Container-Size": "200" },
    });
    expect(mockRequest).toHaveBeenNthCalledWith(3, "/library/sections/1/all?type=10", {
      headers: { "X-Plex-Container-Start": "2", "X-Plex-Container-Size": "200" },
    });
  });


  describe("lyrics", () => {
    const trackWith = (streams: object[]) => ({
      MediaContainer: { Metadata: [{ type: "track", ratingKey: "7", Media: [{ Part: [{ key: "/library/parts/7", Stream: streams }] }] }] },
    });

    beforeEach(() => mockRequestText.mockReset());

    it("reads a timed lyrics stream as synced lines", async () => {
      mockRequest.mockResolvedValue(trackWith([{ streamType: 2 }, { streamType: 4, key: "/library/streams/9", format: "lrc" }]));
      mockRequestText.mockResolvedValue("[00:01.00] First\n[00:04.50] Second");

      await expect(createPlexAdapter(server).lyrics.getBySongId("7")).resolves.toEqual({
        synced: true,
        lines: [{ startMs: 1000, text: "First" }, { startMs: 4500, text: "Second" }],
      });
      expect(mockRequestText).toHaveBeenCalledWith("/library/streams/9");
    });

    it("reads untimed lyrics as plain lines", async () => {
      mockRequest.mockResolvedValue(trackWith([{ streamType: 4, key: "/library/streams/9", format: "txt" }]));
      mockRequestText.mockResolvedValue("First\n\nSecond\n");

      await expect(createPlexAdapter(server).lyrics.getBySongId("7")).resolves.toEqual({
        synced: false,
        lines: [{ startMs: 0, text: "First" }, { startMs: 0, text: "Second" }],
      });
    });

    it("has none for a track without a lyrics stream, without asking for one", async () => {
      mockRequest.mockResolvedValue(trackWith([{ streamType: 2 }]));

      await expect(createPlexAdapter(server).lyrics.getBySongId("7")).resolves.toBeNull();
      expect(mockRequestText).not.toHaveBeenCalled();
    });
  });

  describe("similar songs", () => {
    it("maps sonically similar tracks, leaving out the seed", async () => {
      mockRequest.mockResolvedValue({ MediaContainer: { Metadata: [
        { type: "track", ratingKey: "7", title: "Seed" },
        { type: "track", ratingKey: "8", title: "Near" },
      ] } });

      const songs = await createPlexAdapter(server).similar.getSimilarSongs("7");

      expect(songs.map(song => song.nativeId)).toEqual(["8"]);
      expect(mockRequest).toHaveBeenCalledWith(expect.stringMatching(/^\/library\/metadata\/7\/nearest\?/));
    });

    it("has none on a library without sonic analysis, but still rejects a real failure", async () => {
      mockRequest.mockRejectedValueOnce(new PlexRequestError(404));
      await expect(createPlexAdapter(server).similar.getSimilarSongs("7")).resolves.toEqual([]);

      mockRequest.mockRejectedValueOnce(new PlexRequestError(500));
      await expect(createPlexAdapter(server).similar.getSimilarSongs("7")).rejects.toThrow("Plex request failed (500)");
    });
  });

  describe("playlist writes", () => {
    const entries = [
      { type: "track", ratingKey: "a", playlistItemID: 11 },
      { type: "track", ratingKey: "b", playlistItemID: 12 },
      { type: "track", ratingKey: "a", playlistItemID: 13 },
    ];

    beforeEach(() => {
      mockRequest.mockImplementation(async (path: string) => {
        if (path === "/identity") return { MediaContainer: { machineIdentifier: "mid" } };
        if (path.startsWith("/playlists/p1/items") && !path.includes("/move") && !/items\/\d/.test(path)) {
          return { MediaContainer: { totalSize: entries.length, Metadata: entries } };
        }
        if (path.startsWith("/playlists?")) return { MediaContainer: { Metadata: [{ ratingKey: 99, type: "playlist" }] } };
        return {};
      });
    });

    const calls = () => mockRequest.mock.calls.filter(([, init]) => init?.method);

    it("creates an audio playlist under this server's library and returns its id", async () => {
      await expect(createPlexAdapter(server).playlists.create("Road trip")).resolves.toBe("99");

      const [path, init] = calls()[0];
      expect(init).toEqual({ method: "POST" });
      expect(path).toContain("type=audio");
      expect(path).toContain("title=Road%20trip");
      expect(decodeURIComponent(path)).toContain("uri=server://mid/com.plexapp.plugins.library");
    });

    it("adds a song by its library URI", async () => {
      await createPlexAdapter(server).playlists.addSong("p1", "42");

      expect(calls()).toEqual([[
        `/playlists/p1/items?uri=${encodeURIComponent("server://mid/com.plexapp.plugins.library/library/metadata/42")}`,
        { method: "PUT" },
      ]]);
    });

    it("removes the entry at the position by its playlist item id", async () => {
      await createPlexAdapter(server).playlists.removeSong("p1", "a", 2);

      expect(calls()).toEqual([["/playlists/p1/items/13", { method: "DELETE" }]]);
    });

    it("moves an entry after the one that will precede it, or to the top with none", async () => {
      const adapter = createPlexAdapter(server);

      await adapter.playlists.moveSong("p1", { songId: "a", from: 0, to: 1 });
      await adapter.playlists.moveSong("p1", { songId: "a", from: 2, to: 0 });

      expect(calls()).toEqual([
        ["/playlists/p1/items/11/move?after=12", { method: "PUT" }],
        ["/playlists/p1/items/13/move", { method: "PUT" }],
      ]);
    });

    it("renames and deletes", async () => {
      const adapter = createPlexAdapter(server);

      await adapter.playlists.rename("p1", "New name");
      await adapter.playlists.delete("p1");

      expect(calls()).toEqual([
        ["/playlists/p1?title=New%20name", { method: "PUT" }],
        ["/playlists/p1", { method: "DELETE" }],
      ]);
    });
  });

  describe("discovery", () => {
    const track = (id: string, genres: string[] = []) => ({
      type: "track", ratingKey: id, title: id, Genre: genres.map(tag => ({ tag })), Media: [{ Part: [{ key: `/library/parts/${id}` }] }],
    });

    it("draws a random page from each library and interleaves them", async () => {
      mockRequest.mockImplementation(async (path: string) => {
        if (path === "/library/sections") return { MediaContainer: { Directory: [{ key: "1" }, { key: "2" }] } };
        if (path.startsWith("/library/sections/1/all?type=10&sort=random")) return { MediaContainer: { Metadata: [track("a1"), track("a2")] } };
        if (path.startsWith("/library/sections/2/all?type=10&sort=random")) return { MediaContainer: { Metadata: [track("b1")] } };
        throw new Error(`unexpected ${path}`);
      });

      const songs = await createPlexAdapter(server).discovery!.getRandomSongs({ size: 3 });

      expect(songs.map(song => song.nativeId)).toEqual(["a1", "b1", "a2"]);
    });

    it("keeps only tracks tagged with the asked-for genre, from a wider draw", async () => {
      mockRequest.mockImplementation(async (path: string) => {
        if (path === "/library/sections") return { MediaContainer: { Directory: [{ key: "1" }] } };
        return { MediaContainer: { Metadata: [track("j1", ["Jazz"]), track("r1", ["Rock"]), track("j2", ["jazz"])] } };
      });

      const songs = await createPlexAdapter(server).discovery!.getRandomSongs({ size: 5, genre: "Jazz" });

      expect(songs.map(song => song.nativeId)).toEqual(["j1", "j2"]);
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining("sort=random"), {
        headers: { "X-Plex-Container-Start": "0", "X-Plex-Container-Size": "20" },
      });
    });

    it("lists tracks playing in sessions, and nothing when Plex refuses to show them", async () => {
      mockRequest.mockResolvedValueOnce({
        MediaContainer: { Metadata: [
          { ...track("t1"), grandparentTitle: "Artist", parentTitle: "Album", parentRatingKey: "al1", thumb: "/thumb/t1", User: { title: "ari" } },
          { type: "episode", ratingKey: "e1", title: "Show", User: { title: "sam" } },
        ] },
      });
      await expect(createPlexAdapter(server).discovery!.getNowPlaying()).resolves.toEqual([
        expect.objectContaining({ songId: "t1", artist: "Artist", albumId: "al1", username: "ari", cover: { kind: "plex", path: "/thumb/t1" } }),
      ]);

      mockRequest.mockRejectedValueOnce(new Error("Plex request failed (401)"));
      await expect(createPlexAdapter(server).discovery!.getNowPlaying()).resolves.toEqual([]);
    });
  });
});
