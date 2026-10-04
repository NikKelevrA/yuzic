/**
 * Route params -> one canonical artist -> one `ResolvedArtist`.
 *
 * Replaces the artist screen's old `localArtist ?? externalArtist` pair:
 * identity resolution (local-library match, or an external lookup when
 * there is none), the base entity fetch, enrichment
 * (`resolveArtistDetails`), and discography classification all happen here,
 * once, so `ArtistScreen`/`Header`/`Content` render a single model instead
 * of each re-deriving pieces of it.
 */
import { useMemo } from 'react';
import type { Artist } from '@/domain/entities/Artist';
import type { Song } from '@/domain/entities/Song';
import type { ResolvedArtist } from './resolveArtistDetails';
import { useArtist } from '@/features/artist/useArtist';
import { useArtists } from '@/features/artist/useArtists';
import { useArtistAlbums } from '@/features/artist/useArtistAlbums';
import { useArtistExternalDiscography } from '@/features/artist/useArtistExternalDiscography';
import { useLiveArtistAlbums } from '@/features/artist/useLiveArtistAlbums';
import { useTracks } from '@/features/song/useTracks';
import { matchArtistToLibrary } from '@/features/library/matchToLibrary';
import { useExternalArtistLookup } from '@/features/sources/registry';
import { useVirtualCatalogBrowsingEnabled } from '@/features/settings/sources/useVirtualCatalogBrowsingEnabled';
import { isVirtualCatalogId } from '@/domain/identity/virtualCatalogId';
import { useArtistDetails } from './useArtistDetails';
import { classifyDiscography, type ClassifiedDiscography } from './classifyDiscography';
import { isSingleOrEp } from './releaseKind';

export type ArtistRouteParams = {
  id?: string;
  source?: string;
  artistId?: string;
  mbid?: string;
  name?: string;
  forceExternal?: string;
};

export type ArtistScreenModel = {
  status: 'loading' | 'not-found' | 'error' | 'ready';
  /** In the user's library, vs. a browse-only lookup from an external source. */
  isLocal: boolean;
  artist: Artist | null;
  /** True when a local artist is showing persisted-cache data because the
   *  server couldn't be reached. */
  degraded: boolean;
  /** The artist's biography and tags, each the artist's own or — where it
   *  has none — filled from the first enabled `artist.enrich` offer, with
   *  who supplied it. `null` until the artist is known and its resolution
   *  has settled. The picture is not here: covers resolve where they are
   *  drawn (`features/artwork/coverResolution`). */
  resolved: ResolvedArtist | null;
  /** External mode only — a library artist's popular tracks come from
   *  `useArtistTopTracks`, called directly by the section that needs them. */
  topTracks: Song[];
  similarArtists: Artist[];
  discography: ClassifiedDiscography;
  counts: { albums: number; singles: number; songs: number };
  /** Settings → Search → "Browse not-yet-downloaded results". Surfaced here
   *  rather than re-read via the hook so every consumer whose rendering must
   *  only change when this is on (the singles count below, release-type row
   *  labels) gates on the exact same value this model itself gated on. */
  virtualCatalogBrowsingEnabled: boolean;
  /** True only for an unsynced virtual-catalog artist (see
   *  `isUnsyncedVirtualArtist`) whose live discography fetch hasn't resolved
   *  yet. Deliberately NOT part of `status` — the artist's own name/cover
   *  are already known by this point, so the whole page no longer waits on
   *  this one live request; `discography`/`counts` are just momentarily
   *  behind what they'll settle to once it resolves. */
  discographyLoading: boolean;
};

function useLocalArtist(id: string | null) {
  const local = useArtist(id ?? '');
  return id ? local : { artist: null, isLoading: false, error: null, degraded: false };
}

export function useArtistScreenModel(params: ArtistRouteParams): ArtistScreenModel {
  const { id, source, artistId, mbid, name, forceExternal } = params;
  const { artists } = useArtists();
  const { tracks: libraryTracks } = useTracks();

  // Re-resolved only when the route's own identity params change (a genuine
  // navigation to a different artist) — not when `artists` changes on its
  // own, e.g. a library sync completing in the background must not flip an
  // already-rendered external-only view into local mode underneath the
  // user.
  const resolvedLocalId = useMemo(() => {
    if (id) return id;
    if (forceExternal === 'true') return null;
    if (!name) return null;
    const match = matchArtistToLibrary({ name, externalIds: mbid ? { mbid } : {} }, artists);
    return match?.nativeId ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, forceExternal, name, artistId, mbid]);

  const local = useLocalArtist(resolvedLocalId);
  const externalEnabled = !resolvedLocalId && !!(artistId || mbid || name);
  const external = useExternalArtistLookup({ enabled: externalEnabled, source, artistId: artistId ?? null, mbid: mbid ?? null, name: name ?? null });

  const isLocal = !!resolvedLocalId;
  const artist: Artist | null = isLocal ? local.artist : (external.data?.artist ?? null);

  const resolved = useArtistDetails(artist);

  const localAlbums = useArtistAlbums(isLocal ? (artist?.nativeId ?? '') : '');
  const { data: externalDiscography } = useArtistExternalDiscography(
    isLocal ? (artist?.name ?? null) : null,
    isLocal && !!artist
  );

  // A virtual-catalog id (see `isVirtualCatalogId`) never has a synced-store
  // entry — it is by definition content the library sync has never seen —
  // so `localAlbums` coming back empty for one isn't "no releases", it's
  // "nobody has asked the server live yet". Gated behind the switch so this
  // never fires for anyone not running a catalog bridge that mints these ids.
  const virtualCatalogBrowsingEnabled = useVirtualCatalogBrowsingEnabled();
  const isUnsyncedVirtualArtist = isLocal && virtualCatalogBrowsingEnabled
    && !!artist && isVirtualCatalogId(artist.nativeId) && localAlbums.length === 0;
  const liveVirtualAlbums = useLiveArtistAlbums(artist?.nativeId ?? '', isUnsyncedVirtualArtist);

  const songCountByAlbumId = useMemo(() => {
    const counts = new Map<string, number>();
    libraryTracks.forEach(track => {
      counts.set(track.album.localId, (counts.get(track.album.localId) ?? 0) + 1);
    });
    return counts;
  }, [libraryTracks]);

  const discography = useMemo<ClassifiedDiscography>(() => {
    if (isLocal) {
      // The live virtual releases join the same "unowned" channel Deezer's
      // by-name supplement already uses — not `localAlbums`, which is
      // (correctly) the set the user actually owns. `classifyDiscography`
      // dedupes against `localAlbums` either way, so a release that later
      // gets downloaded and synced stops arriving here on its own.
      let extra = externalDiscography ?? null;
      if (isUnsyncedVirtualArtist && liveVirtualAlbums.albums.length > 0) {
        // `a.songCount` is the server's own real track count for this
        // release — `mapAlbum` already puts it there from the Subsonic DTO,
        // same as every other album. Passing a hardcoded 0 here (as this
        // used to) means "unknown" to `isSingleOrEp`, which then falls all
        // the way through to its title-text heuristic — and a real single
        // or EP very often has a title that says neither "single" nor "ep",
        // so almost everything silently landed in "albums" instead.
        extra = {
          albums: [...(extra?.albums ?? []), ...liveVirtualAlbums.albums.filter(a => !isSingleOrEp(a, a.songCount ?? 0))],
          singles: [...(extra?.singles ?? []), ...liveVirtualAlbums.albums.filter(a => isSingleOrEp(a, a.songCount ?? 0))],
        };
      }
      return classifyDiscography(localAlbums, songCountByAlbumId, extra);
    }
    // External mode has nothing "owned" to separate out — every release the
    // source reports is unowned by definition, so classifying against an
    // empty library sorts them the same way `classifyDiscography` sorts
    // everything else, without a second sort implementation.
    const ext = external.data;
    const classified = classifyDiscography([], new Map(), { albums: ext?.albums ?? [], singles: ext?.singles ?? [] });
    return {
      ownedAlbums: [],
      ownedSingles: [],
      unownedAlbums: classified.unownedAlbums,
      unownedSingles: classified.unownedSingles,
    };
  }, [isLocal, localAlbums, songCountByAlbumId, externalDiscography, external.data, isUnsyncedVirtualArtist, liveVirtualAlbums.albums]);

  const artistTrackIds = useMemo(
    () => (artist ? libraryTracks.filter(t => t.artist.localId === artist.localId).length : 0),
    [libraryTracks, artist]
  );

  // Pre-existing, unguarded expression — kept byte-for-byte as the
  // switch-off behavior. It already conflates albums and singles (Navidrome
  // doesn't split them at the sync layer for `localAlbums.length`, and the
  // external branch just adds the two source lists together), which is the
  // bug `discography`-based counting below fixes — but every other
  // search/browse path on this screen still assumes this exact number when
  // the switch is off, so it stays unless the switch says otherwise.
  const legacyAlbumsCount = isLocal
    ? localAlbums.length
    : (external.data ? external.data.albums.length + external.data.singles.length : 0);

  const counts = useMemo(() => {
    const songs = isLocal ? artistTrackIds : 0;
    if (!virtualCatalogBrowsingEnabled) {
      return { albums: legacyAlbumsCount, singles: 0, songs };
    }
    // `discography` already classifies album vs. single/EP correctly (and,
    // for external mode, already dedupes against the library) in both
    // modes, so reusing it here fixes the same bug for local and external
    // artists alike with one formula instead of two.
    return {
      albums: discography.ownedAlbums.length + discography.unownedAlbums.length,
      singles: discography.ownedSingles.length + discography.unownedSingles.length,
      songs,
    };
  }, [isLocal, artistTrackIds, virtualCatalogBrowsingEnabled, legacyAlbumsCount, discography]);

  const topTracks = isLocal ? [] : (external.data?.topTracks ?? []);
  const similarArtists = isLocal ? [] : (external.data?.similarArtists ?? []);

  const status: ArtistScreenModel['status'] = (() => {
    if (isLocal) {
      if (local.isLoading) return 'loading';
      if (!local.artist) return local.error ? 'error' : 'not-found';
      // The artist's own name/cover are already known at this point — a
      // live discography fetch that's still in flight no longer holds the
      // whole page hostage behind it (it used to; a slow bridge answering
      // for an artist with many not-yet-downloaded releases could leave the
      // page on a loading skeleton for a long time with nothing to show for
      // it). `discographyLoading` below carries that state for just the
      // release list instead.
      return 'ready';
    }
    if (!artistId && !mbid && !name) return 'not-found';
    if (external.isLoading) return 'loading';
    if (external.error || !external.data) return 'error';
    return 'ready';
  })();

  return {
    status,
    isLocal,
    artist,
    degraded: isLocal ? local.degraded : false,
    resolved,
    topTracks,
    similarArtists,
    discography,
    counts,
    virtualCatalogBrowsingEnabled,
    discographyLoading: isUnsyncedVirtualArtist && liveVirtualAlbums.isLoading,
  };
}
