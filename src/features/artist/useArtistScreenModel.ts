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
import { useTracks } from '@/features/song/useTracks';
import { matchArtistToLibrary } from '@/features/library/matchToLibrary';
import { useExternalArtistLookup } from '@/features/sources/registry';
import { useArtistDetails } from './useArtistDetails';
import { classifyDiscography, type ClassifiedDiscography } from './classifyDiscography';

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
  counts: { albums: number; songs: number };
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

  const songCountByAlbumId = useMemo(() => {
    const counts = new Map<string, number>();
    libraryTracks.forEach(track => {
      counts.set(track.album.localId, (counts.get(track.album.localId) ?? 0) + 1);
    });
    return counts;
  }, [libraryTracks]);

  const discography = useMemo<ClassifiedDiscography>(() => {
    if (isLocal) return classifyDiscography(localAlbums, songCountByAlbumId, externalDiscography ?? null);
    // External mode has nothing "owned" to separate out — every release the
    // source reports is unowned by definition, so classifying against an
    // empty library sorts them the same way `classifyDiscography` sorts
    // everything else, without a second sort implementation.
    const ext = external.data;
    const classified = classifyDiscography([], new Map(), { albums: ext?.albums ?? [], singles: ext?.singles ?? [], others: ext?.others ?? [] });
    return {
      ownedAlbums: [],
      ownedSingles: [],
      unownedAlbums: classified.unownedAlbums,
      unownedSingles: classified.unownedSingles,
      unownedOthers: classified.unownedOthers,
    };
  }, [isLocal, localAlbums, songCountByAlbumId, externalDiscography, external.data]);

  const artistTrackIds = useMemo(
    () => (artist ? libraryTracks.filter(t => t.artist.localId === artist.localId).length : 0),
    [libraryTracks, artist]
  );

  const counts = useMemo(() => ({
    albums: isLocal ? localAlbums.length : (external.data ? external.data.albums.length + external.data.singles.length : 0),
    songs: isLocal ? artistTrackIds : 0,
  }), [isLocal, localAlbums.length, external.data, artistTrackIds]);

  const topTracks = isLocal ? [] : (external.data?.topTracks ?? []);
  const similarArtists = isLocal ? [] : (external.data?.similarArtists ?? []);

  const status: ArtistScreenModel['status'] = (() => {
    if (isLocal) {
      if (local.isLoading) return 'loading';
      if (!local.artist) return local.error ? 'error' : 'not-found';
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
  };
}
