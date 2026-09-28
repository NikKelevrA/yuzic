import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { fetchSimilarArtistsFromListeners, LISTENERS_HOME_USE } from '@/providers/registry/homeDiscovery';
import { QueryKeys } from '@/state/query/queryKeys';
import { useMatchedNavigation } from '@/features/sources/useMatchedNavigation';
import { useArtistMbid } from '@/features/artist/useArtistMbid';
import { useArtists } from '@/features/artist/useArtists';
import { selectSourceUse } from '@/features/settings/sources/state';
import {
} from '@/features/home/constants';
import { ShelfCarousel } from './ShelfCarousel';
import OptionsTile from './OptionsTile';
import { useSourceSectionPresence } from './SourceGroup';
import type { Artist } from '@/domain/entities/Artist';

/**
 * How long to wait before trying the next seed. Each seed can cost a
 * MusicBrainz lookup, and MusicBrainz takes one request a second.
 */
export const NEXT_SEED_DELAY_MS = 1100;

type Props = {
  /** This shelf's key in the home layout, so the source group above it knows
   * which of its sections has just gone quiet. */
  sectionKey: string;
  /** Library artists to seed from, in order. */
  artistNames: string[];
  refreshKey?: number;
};

/**
 * "Artists similar to <one you love>" from ListenBrainz's public graph —
 * MBID-keyed, no auth required, so what turns it on is the ListenBrainz
 * discovery setting rather than a connected account. The seed comes from the
 * local library.
 *
 * ListenBrainz has no listeners on record for plenty of smaller artists, and
 * with a single seed the shelf simply vanished for a library full of them. So
 * it works down its seeds one at a time and shows the first that has any; the
 * rest are never asked about.
 *
 * Home already withholds the whole ListenBrainz group when that setting is
 * off; the check is repeated here so the shelf cannot call out from anywhere
 * else it gets mounted.
 */
export default function LBSimilarForYouSection({ sectionKey, artistNames, refreshKey = 0 }: Props) {
  const { t } = useTranslation();
  const { navigateToArtist } = useMatchedNavigation();
  const { artists: libraryArtists } = useArtists();
  const discoveryEnabled = useSelector(selectSourceUse(LISTENERS_HOME_USE));

  // Which seed is being tried. A new set of seeds or a refresh starts again at
  // the first, without an effect to reset it.
  const seedsKey = artistNames.join('\n');
  const [attempt, setAttempt] = useState({ seedsKey, refreshKey, index: 0 });
  const index = attempt.seedsKey === seedsKey && attempt.refreshKey === refreshKey ? attempt.index : 0;
  const artistName = artistNames[index] ?? '';
  const hasNextSeed = index < artistNames.length - 1;

  const seed = useMemo(
    () => libraryArtists.find((a) => a.name === artistName) ?? null,
    [artistName, libraryArtists]
  );
  // Subsonic servers don't carry MusicBrainz ids, so the library mbid is null
  // for everyone not on Jellyfin/Emby and this shelf never rendered for them.
  // Looking the seed up by name is what makes it work on any server.
  // The lookup is allowed by discovery itself rather than by MusicBrainz's
  // search switch: discovery's description says it sends artist names to
  // MusicBrainz, and without the lookup this shelf never appeared for a seed
  // the server had no MBID for, however ListenBrainz was set.
  const { mbid: seedMbid, isResolving } = useArtistMbid(artistName, seed?.externalIds.mbid, {
    enabled: discoveryEnabled,
    allowLookup: true,
  });


  const query = useQuery<Artist[]>({
    queryKey: [QueryKeys.LbSimilarForYou, seedMbid ?? '', refreshKey],
    queryFn: async () => {
      if (!seedMbid) return [];
      return fetchSimilarArtistsFromListeners(seedMbid, 10);
    },
    enabled: discoveryEnabled && Boolean(seedMbid),
    staleTime: 1000 * 60 * 60 * 24,
    networkMode: 'online',
  });

  const data = query.data ?? [];
  // Nothing to be had from this seed: no MusicBrainz artist matched its name,
  // or ListenBrainz answered with nobody. A failed request is not the same
  // answer, and moving on from one would only repeat the failure.
  const seedHasNothing =
    discoveryEnabled &&
    !isResolving &&
    (!seedMbid || (query.isSuccess && !query.isFetching && data.length === 0));

  useEffect(() => {
    if (!seedHasNothing || !hasNextSeed) return;
    const timer = setTimeout(
      () => setAttempt({ seedsKey, refreshKey, index: index + 1 }),
      NEXT_SEED_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [seedHasNothing, hasNextSeed, seedsKey, refreshKey, index]);

  const isLoading =
    discoveryEnabled &&
    (isResolving || (Boolean(seedMbid) && query.isLoading) || (seedHasNothing && hasNextSeed));
  const hasContent = isLoading || data.length > 0;

  useSourceSectionPresence(sectionKey, hasContent);

  const renderArtist = useCallback(({ item, width }: { item: Artist; width: number }) => (
    <OptionsTile
      entity={{ kind: 'artist', artist: item }}
      cover={item.cover}
      title={item.name}
      subtitle={t('common.artist')}
      size={width}
      radius={width / 2}
      onPress={() => navigateToArtist(item)}
    />
  ), [navigateToArtist, t]);

  // A heading over an empty rail is worse than no shelf — and the source
  // header above it goes with it, told by the presence report. `ShelfCarousel`
  // follows the same rule when given no empty message; this keeps the check
  // here because the presence report has to be told before the render.
  if (!hasContent) return null;

  return (
    <ShelfCarousel
      title={t('explore.sections.lbSimilarForYou', { artist: artistName })}
      isLoading={isLoading}
      isError={query.isError}
      data={data}
      keyExtractor={(item) => item.localId}
      renderItem={renderArtist}
      skeletonVariant="artist"
    />
  );
}
