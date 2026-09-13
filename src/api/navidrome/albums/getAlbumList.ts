import type { Album } from "@/domain/entities/Album";
import type { Provenance } from "@/domain/identity/Provenance";
import type { NavidromeClient } from "../client";
import { mapAlbum } from "../mapAlbum";
import { SubsonicResponse } from "../types";

export type GetAlbumListResult = Album[];

const PAGE_SIZE = 500;

export async function getAlbumList(
  client: NavidromeClient,
  provenance: Provenance,
  type = "newest"
): Promise<GetAlbumListResult> {
  const all: Album[] = [];
  let offset = 0;

  while (true) {
    const raw = await client.request<SubsonicResponse>("getAlbumList.view", { type, size: PAGE_SIZE, offset });
    const page = raw?.["subsonic-response"]?.albumList?.album ?? [];
    all.push(...page.map((a) => mapAlbum(a, { provenance })));
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}
