import type { MediaBrowserClient } from "../client";
import { JELLYFIN_BRAND } from "../brand";
import { getNowPlaying, getRandomSongs } from "./discovery";

function clientReturning(body: unknown, parentId?: string) {
  const request = jest.fn(async () => body);
  const client = {
    request,
    serverId: "jf-1",
    userId: "user-1",
    parentId,
    brand: JELLYFIN_BRAND,
  } as unknown as MediaBrowserClient;
  return { client, request };
}

const track = (id: string, name: string) => ({ Id: id, Name: name, Type: "Audio", AlbumId: "al-1", Artists: ["Artist"] });

describe("getRandomSongs", () => {
  it("asks the server to draw at random within the chosen library", async () => {
    const { client, request } = clientReturning({ Items: [track("t1", "One"), track("t2", "Two")] }, "lib-9");

    const songs = await getRandomSongs(client, { size: 30, genre: "Jazz" });

    const path = String((request.mock.calls[0] as unknown[])[0]);
    expect(path).toContain("/Users/user-1/Items?");
    expect(path).toContain("SortBy=Random");
    expect(path).toContain("Limit=30");
    expect(path).toContain("Genres=Jazz");
    expect(path).toContain("ParentId=lib-9");
    expect(songs.map((s) => s.nativeId)).toEqual(["t1", "t2"]);
  });

  it("spells a span of years out, since the server takes a list", async () => {
    const { client, request } = clientReturning({ Items: [] });

    await getRandomSongs(client, { fromYear: 1980, toYear: 1982 });

    expect(String((request.mock.calls[0] as unknown[])[0])).toContain("Years=1980%2C1981%2C1982");
  });
});

describe("getNowPlaying", () => {
  it("lists sessions playing a track, with who and how long ago", async () => {
    const now = Date.parse("2026-09-14T12:00:00Z");
    const { client } = clientReturning([
      { UserName: "ari", LastActivityDate: "2026-09-14T11:58:00Z", NowPlayingItem: track("t1", "One") },
      { UserName: "sam", NowPlayingItem: { Id: "m1", Name: "A Film", Type: "Movie" } },
      { UserName: "idle" },
    ]);

    const entries = await getNowPlaying(client, () => now);

    expect(entries).toEqual([
      expect.objectContaining({ songId: "t1", title: "One", username: "ari", albumId: "al-1", minutesAgo: 2 }),
    ]);
    expect(entries[0].cover.kind).not.toBe("none");
  });
});
