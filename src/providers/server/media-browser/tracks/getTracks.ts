import type { Song } from "@/domain/entities/Song";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapSong } from "../mapSong";
import type { MediaBrowserItem } from "../types";
import { fetchAllItems } from "../pagedItems";

export async function getTracks(client: MediaBrowserClient): Promise<Song[]> {
  const path =
    `/Users/${encodeURIComponent(client.userId)}/Items` +
    `?IncludeItemTypes=Audio` +
    `&Recursive=true` +
    `&SortBy=SortName` +
    `&Fields=RunTimeTicks,ArtistItems,AlbumId,ProductionYear,DateCreated,UserData,IndexNumber,ParentIndexNumber,MediaSources,Genres` +
    (client.parentId ? `&ParentId=${encodeURIComponent(client.parentId)}` : "");

  const provenance = requireProvenance(client);

  // Paged. This was one unbounded request, which for a large library is a
  // single response big enough to kill the app before any of this runs (#266).
  //
  // Mapped per page rather than after the walk: the whole library's DTOs and
  // the whole library's songs used to be alive together at the end of it, and
  // the DTOs are the bigger half.
  return fetchAllItems<MediaBrowserItem, Song>(client, path, (item) =>
    item?.Id ? mapSong(item, { provenance, brand: client.brand }) : null
  );
}
