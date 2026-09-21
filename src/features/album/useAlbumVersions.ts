import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { QueryKeys } from '@/state/query/queryKeys';
import { currentMusicbrainzClient } from '@/providers/registry/musicbrainz';
import { integrationProvenance } from '@/domain/identity/Provenance';
import { mapAlbum } from '@/providers/integration/musicbrainz/mapAlbum';
import { versionsOf } from '@/providers/integration/musicbrainz/discography';
import type { Album } from '@/domain/entities/Album';

const NO_VERSIONS: Album[] = [];
const MB_PROVENANCE = integrationProvenance('musicbrainz');

/**
 * The other versions of a MusicBrainz record: its deluxe and anniversary
 * editions, live and acoustic takes. They are hidden from the artist's list of
 * albums so that list counts records, and this is where they stay reachable.
 *
 * It reads the artist's release groups, the same request the artist screen
 * makes, so it is normally answered from cache. Nothing is asked for a record
 * that did not come from MusicBrainz, or whose artist is unknown.
 */
export function useAlbumVersions(album: Album | null): Album[] {
  const isMusicbrainz =
    album?.provenance.origin === 'integration' && album.provenance.providerId === 'musicbrainz';
  const artistId = album?.artist.nativeId ?? '';
  const artistName = album?.artist.name ?? '';
  const albumId = album?.nativeId ?? '';
  const title = album?.title ?? '';

  const { data } = useQuery<Album[]>({
    queryKey: [QueryKeys.ExternalAlbumVersions, artistId, albumId],
    enabled: isMusicbrainz && !!artistId && !!albumId,
    staleTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      const artist = await currentMusicbrainzClient().getArtistWithReleases(artistId);
      const fallbackArtist = { id: artistId, name: artistName };
      return versionsOf(artist['release-groups'] ?? [], { id: albumId, title }).map(rg =>
        mapAlbum(rg, { provenance: MB_PROVENANCE, fallbackArtist })
      );
    },
  });

  return useMemo(() => data ?? NO_VERSIONS, [data]);
}
