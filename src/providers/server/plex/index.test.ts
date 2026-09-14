import type { Server } from '@/providers/contracts/Server';


const mockRequest = jest.fn();
const mockBuildStreamUrl = jest.fn((path: string) => `https://plex.example${path}`);

jest.mock('./client', () => ({
  createPlexClient: jest.fn(() => ({ request: mockRequest, buildStreamUrl: mockBuildStreamUrl, buildImageUrl: jest.fn() })),
}));

import { createPlexAdapter } from './';

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
