import { coverOrMissing, missingCover, type CoverSource, type CoverSubject } from "@/domain/entities/Cover";
import type { MediaBrowserItem } from "./types";

/**
 * Jellyfin and Emby speak the same MediaBrowser-derived API and differ only
 * in a handful of details (this is Jellyfin's Emby fork lineage showing).
 * `MediaBrowserBrand` captures those differences so the rest of the adapter
 * code can be shared between the two backends.
 */
export interface MediaBrowserBrand {
  kind: "jellyfin" | "emby";
  label: "Jellyfin" | "Emby";
  /**
   * Query-param name used to pass the access token on stream and image URLs.
   *
   * `ApiKey` for Jellyfin, and it has to be: its `AuthorizationContext` reads
   * `ApiKey` unconditionally and `api_key` only when legacy authorization is
   * enabled, which Jellyfin 12 turns off. `X-Emby-Token` — what this said
   * before — is not a query parameter Jellyfin has ever read, on any version
   * checked; those URLs were authenticated by their headers, and worked only
   * because the headers were still being honoured.
   */
  streamTokenParam: "ApiKey" | "api_key";
  /**
   * Whether the client identity goes in the standard `Authorization` header.
   *
   * Jellyfin 12 reads `Authorization` and falls back to `X-Emby-Authorization`
   * only when `EnableLegacyAuthorization` is set — and it ships a migration
   * that turns that off on upgrade. Emby is left on the legacy header, which
   * is what it asks for; there is no reported problem there and no reason to
   * take the risk of changing it.
   */
  usesStandardAuthHeader: boolean;
  /** Emby's /System/Ping returns a non-JSON body; Jellyfin's is JSON. */
  pingAsText: boolean;
}

export const JELLYFIN_BRAND: MediaBrowserBrand = {
  kind: "jellyfin",
  label: "Jellyfin",
  streamTokenParam: "ApiKey",
  usesStandardAuthHeader: true,
  pingAsText: false,
};

export const EMBY_BRAND: MediaBrowserBrand = {
  kind: "emby",
  label: "Emby",
  streamTokenParam: "api_key",
  usesStandardAuthHeader: false,
  pingAsText: true,
};

/** Cover addressed by item ID alone — safe for both brands. */
export function buildCover(
  brand: MediaBrowserBrand,
  itemId: string | undefined
): CoverSource {
  if (!itemId) return { kind: "none" };
  return brand.kind === "jellyfin"
    ? { kind: "jellyfin", itemId }
    : { kind: "emby", itemId };
}

/**
 * Some Emby list endpoints only resolve a cover when an explicit image tag
 * is present in the response (otherwise the image endpoint 404s); Jellyfin
 * doesn't need the tag, so it falls back to itemId-only.
 */
export function buildCoverWithTag(
  brand: MediaBrowserBrand,
  itemId: string | undefined,
  tag: string | undefined
): CoverSource {
  if (brand.kind === "jellyfin") return buildCover(brand, itemId);
  return itemId && tag ? { kind: "emby", itemId, tag } : { kind: "none" };
}

/**
 * An artist's or album's own cover, or a gap naming it.
 *
 * Jellyfin will build an image URL from any item id, so an id alone says
 * nothing about whether a picture exists. The item's `ImageTags` does: when
 * the payload carries the map and it has no `Primary`, the server has no
 * image, and the gap is handed on for a backup to fill. A payload without the
 * map at all (some list endpoints) is taken at its id, as before.
 */
export function itemCover(
  brand: MediaBrowserBrand,
  dto: Pick<MediaBrowserItem, "Id" | "ImageTags">,
  subject: CoverSubject | undefined
): CoverSource {
  if (dto.ImageTags && !dto.ImageTags.Primary) return missingCover(subject);
  return coverOrMissing(buildCoverWithTag(brand, dto.Id, dto.ImageTags?.Primary), subject);
}

/**
 * Song covers: Jellyfin resolves art via the song's own item ID; Emby needs
 * the parent album's ID + image tag instead.
 */
export function buildSongCover(
  brand: MediaBrowserBrand,
  songId: string | undefined,
  albumId: string | undefined,
  albumTag: string | undefined
): CoverSource {
  if (brand.kind === "jellyfin") return buildCover(brand, songId);
  return albumId && albumTag ? { kind: "emby", itemId: albumId, tag: albumTag } : { kind: "none" };
}
