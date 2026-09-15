import { useMemo } from 'react';

import { sourceColor } from '@/constants/design';
import type { Artist } from '@/domain/entities/Artist';
import { useArtistTopTracks } from '@/features/artist/useArtistTopTracks';
import { useLBSimilarArtists } from '@/features/artist/useLBSimilarArtists';
import { useSimilarArtists } from '@/features/artist/useSimilarArtists';
import { useSourceUse } from '@/features/settings/sources/useSourceUse';

/** The letter-in-a-disc that says which service a section came from. */
export type SourceBadge = { letter: string; color: string };

/**
 * The outside services an artist page draws from, declared here so the page
 * itself names none of them.
 *
 * The catalogue is the service whose charts give an artist's popular tracks
 * and whose related artists fill an external artist's similar row.
 */
export const ARTIST_CATALOGUE = {
  badge: { letter: 'D', color: sourceColor.deezer } satisfies SourceBadge,
  popularTracksTitleKey: 'artist.sections.popularOnDeezer',
};

/** Whether the catalogue's popular tracks may be fetched right now. */
export function useArtistCatalogueEnabled(): boolean {
  return useSourceUse('deezer.popularTracks');
}

type ExternalSimilarRow = { id: string; badge: SourceBadge; artists: Artist[] };

/**
 * Similar artists from outside services for a library artist, one row per
 * service in the order they are shown, leaving out any with nothing to show.
 * Each service's own setting gates its request; this only orders the answers.
 */
export function useExternalSimilarArtistRows(artist: Artist): ExternalSimilarRow[] {
  const catalogueEnabled = useSourceUse('deezer.similarArtists');
  const mbid = artist.externalIds.mbid;

  // The catalogue's similar artists arrive with its popular tracks, in one
  // lookup shared by query key with the popular-tracks section.
  const { similarArtists: catalogueSimilar } = useArtistTopTracks({
    name: artist.name,
    mbid,
    enabled: catalogueEnabled,
  });
  // Uses the bundled Last.fm key; without one the hook stays disabled.
  const { data: lastfmSimilar = [] } = useSimilarArtists({
    mbid,
    name: artist.name,
    excludeName: artist.name,
    limit: 8,
  });
  // MBID-only, no account needed; skipped for an artist without one.
  const { data: listenbrainzSimilar = [] } = useLBSimilarArtists(
    mbid ? { mbid, excludeName: artist.name } : null,
    8
  );

  return useMemo(() => [
    { id: 'deezer', badge: ARTIST_CATALOGUE.badge, artists: catalogueEnabled ? catalogueSimilar : [] },
    { id: 'lastfm', badge: { letter: 'L', color: sourceColor.lastfm }, artists: lastfmSimilar },
    { id: 'listenbrainz', badge: { letter: 'B', color: sourceColor.listenbrainz }, artists: listenbrainzSimilar },
  ].filter(row => row.artists.length > 0), [catalogueEnabled, catalogueSimilar, lastfmSimilar, listenbrainzSimilar]);
}
