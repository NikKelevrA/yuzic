import { iconSize, onDark, sourceColor, spacing, statusColor, typography } from '@/constants/design'
import React, { useCallback, useMemo, useState } from 'react'
import { useRadius } from '@/hooks/useRadius'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useNavigation } from '@react-navigation/native'
import { Ellipsis, Globe } from 'lucide-react-native'
import type { CoverSource } from '@/types/Cover'
import type { Album } from '@/domain/entities/Album'
import type { Artist } from '@/domain/entities/Artist'
import type { SourceArtistDetail } from '@/features/sources/registry'
import AlbumRow from '@/components/rows/AlbumRow'
import Header, { ArtistHeaderBar } from '../Header'
import { DetailScreen } from '@/components/DetailHeader'
import { useTheme } from '@/hooks/useTheme'
import { useTranslation } from 'react-i18next'
import { useArtistAlbums, useSimilarArtists } from '@/hooks/artists'
import { useArtistTopTracks } from '@/hooks/artists/useArtistTopTracks'
import TopSongsSection from './TopSongsSection'
import { useServerSimilarArtists } from '@/hooks/artists/useServerSimilarArtists'
import { useLBSimilarArtists } from '@/hooks/artists/useLBSimilarArtists'
import { useArtistExternalDiscography } from '@/hooks/artists/useArtistExternalDiscography'
import { matchAlbumToLibrary } from '@/features/library/matchToLibrary'
import { compareByReleaseYearDesc, releaseYearLabel } from './discography'
import { isSingleOrEp } from './releaseKind'
import { useTracks } from '@/hooks/tracks'
import MediaTile from '@/screens/home/components/MediaTile'
import MostPlayedSection from './MostPlayedSection'
import PopularOnDeezerSection from './PopularOnDeezerSection'
import BioSection from './BioSection'
import { useArtistInfoEnrichment } from '@/features/metadata/useArtistInfoEnrichment'
import { findArtistsWithSharedGenres } from './localSimilarArtists'
import { useMatchedNavigation } from '@/features/sources/useMatchedNavigation'
import { useDeezerDiscoveryEnabled } from '@/features/home/hooks/useDeezerEnabled'
import { useSelector } from 'react-redux'
import { selectShowSourceHeaders } from '@/utils/redux/selectors/settingsSelectors'
import { selectLibraryAlbums } from '@/utils/redux/selectors/librarySelectors'
import Touchable from '@/components/Touchable'
import { useScrollClearance } from '@/hooks/useScrollClearance'

type Props = {
  localArtist: Artist | null
  externalArtist: SourceArtistDetail | null
}

type ArtistContentItem =
  | { kind: 'mostPlayed'; id: string }
  | { kind: 'topSongs'; id: string }
  | { kind: 'popularOnDeezer'; id: string }
  | { kind: 'section'; id: string; title: string }
  | { kind: 'localAlbum'; id: string; album: Album }
  | { kind: 'externalAlbum'; id: string; album: Album }
  | { kind: 'showMore'; id: string; target: 'albums' | 'singles'; remaining: number }
  | { kind: 'showUnowned'; id: string; target: 'albums' | 'singles'; count: number }
  | { kind: 'similar'; id: string }
  | { kind: 'bio'; id: string }

const INITIAL_RELEASE_ROWS = 3

const LOCAL_COLOR = statusColor.success

function SimilarArtistsSubSection<T extends { name: string; cover: CoverSource }>({
  data, itemSize, keyPrefix, badge, onPressItem, keyOf, subtitleOf,
}: {
  data: T[]
  itemSize: number
  keyPrefix: string
  badge: { color: string; letter: string }
  onPressItem: (item: T) => void
  keyOf: (item: T) => string
  subtitleOf: (item: T) => string
}) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const rad = useRadius()
  const showSourceHeaders = useSelector(selectShowSourceHeaders)

  const renderArtist = useCallback(({ item }: { item: T }) => (
    <MediaTile
      cover={item.cover}
      title={item.name}
      subtitle={subtitleOf(item)}
      size={itemSize}
      radius={itemSize / 2}
      onPress={() => onPressItem(item)}
    />
  ), [itemSize, onPressItem, subtitleOf])

  if (data.length === 0) return null

  return (
    <View style={styles.similarSection}>
      <View style={styles.similarTitleRow}>
        {showSourceHeaders && (
          <View style={[styles.sourceBadge, { backgroundColor: badge.color, borderRadius: rad.pill }]}>
            <Text style={styles.sourceBadgeLetter}>{badge.letter}</Text>
          </View>
        )}
        <Text style={[styles.sectionTitle, styles.sectionTitleNopad, { color: colors.secondary }]}>
          {t('artist.sections.similarArtists')}
        </Text>
      </View>
      <FlashList
        horizontal
        data={data}
        keyExtractor={item => `${keyPrefix}-${keyOf(item)}`}
        renderItem={renderArtist}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.similarListContent}
        ItemSeparatorComponent={() => <View style={styles.similarGap} />}
      />
    </View>
  )
}

function LocalSimilarArtistsSection({ artist }: { artist: Artist }) {
  const { t } = useTranslation()
  const navigation = useNavigation<any>()
  const { width: screenWidth } = useWindowDimensions()
  const itemSize = Math.min(132, Math.max(112, (screenWidth - 56) / 2.7))

  const { navigateToArtist } = useMatchedNavigation()
  const deezerEnabled = useDeezerDiscoveryEnabled()
  const libraryAlbums = useSelector(selectLibraryAlbums)
  const artistMbid = artist.externalIds.mbid

  const { similarArtists: deezerSimilar } = useArtistTopTracks({
    name: artist.name,
    mbid: artistMbid,
    enabled: deezerEnabled,
  })

  // The Last.fm read path uses the bundled api_key; if the build has one,
  // the hook returns results and this section renders. If it doesn't, the
  // hook stays disabled and this branch is silently skipped.
  const { data: lastfmSimilar = [] } = useSimilarArtists({
    mbid: artistMbid,
    name: artist.name,
    excludeName: artist.name,
    limit: 8,
  })

  // ListenBrainz similar-artists: MBID-only, no auth required. Runs whenever
  // the local artist carries an MBID (which most do via server metadata).
  const { data: lbSimilar = [] } = useLBSimilarArtists(
    artistMbid ? { mbid: artistMbid, excludeName: artist.name } : null,
    8
  )

  const localSimilar = useMemo(
    () => findArtistsWithSharedGenres(artist.localId, libraryAlbums),
    [artist.localId, libraryAlbums]
  )

  // Server-native similar (Navidrome getArtistInfo2 / Jellyfin+Emby /Similar).
  // Falls back to nothing when the server adapter doesn't implement it, so
  // there is no toggle: it either has data or it doesn't render.
  const { data: serverSimilar = [] } = useServerSimilarArtists(artist.nativeId, 12)

  // Drop server-similar entries that the local-similar shelf already covers —
  // both usually surface the same shared-genre neighbours, and showing two
  // identical rows for the same artist is worse than showing one.
  const localSimilarIds = useMemo(() => new Set(localSimilar.map(a => a.localId)), [localSimilar])
  const dedupedServerSimilar = useMemo(
    () => serverSimilar.filter(a => !localSimilarIds.has(a.localId)),
    [serverSimilar, localSimilarIds]
  )

  const libraryArtistLabel = useCallback(() => t('common.artist'), [t])
  // Every similar-artist source now returns the same domain `Artist`, which
  // carries no display subtext of its own — every subsection shows the same
  // generic label an `ArtistRow` does.
  const externalArtistSubtitle = libraryArtistLabel

  return (
    <>
      <SimilarArtistsSubSection
        data={localSimilar}
        itemSize={itemSize}
        keyPrefix="local"
        badge={{ color: LOCAL_COLOR, letter: 'L' }}
        onPressItem={item => navigation.push('artistView', { id: item.nativeId })}
        keyOf={item => item.localId}
        subtitleOf={libraryArtistLabel}
      />
      {dedupedServerSimilar.length > 0 && (
        <SimilarArtistsSubSection
          data={dedupedServerSimilar}
          itemSize={itemSize}
          keyPrefix="server"
          badge={{ color: LOCAL_COLOR, letter: 'S' }}
          onPressItem={item => navigation.push('artistView', { id: item.nativeId })}
          keyOf={item => item.localId}
          subtitleOf={libraryArtistLabel}
        />
      )}
      {deezerEnabled && deezerSimilar.length > 0 && (
        <SimilarArtistsSubSection
          data={deezerSimilar}
          itemSize={itemSize}
          keyPrefix="deezer"
          badge={{ color: sourceColor.deezer, letter: 'D' }}
          onPressItem={item => navigateToArtist(item)}
          keyOf={item => item.localId}
          subtitleOf={externalArtistSubtitle}
        />
      )}
      {lastfmSimilar.length > 0 && (
        <SimilarArtistsSubSection
          data={lastfmSimilar}
          itemSize={itemSize}
          keyPrefix="lastfm"
          badge={{ color: sourceColor.lastfm, letter: 'L' }}
          onPressItem={item => navigateToArtist(item)}
          keyOf={item => item.localId}
          subtitleOf={externalArtistSubtitle}
        />
      )}
      {lbSimilar.length > 0 && (
        <SimilarArtistsSubSection
          data={lbSimilar}
          itemSize={itemSize}
          keyPrefix="lb"
          badge={{ color: sourceColor.listenbrainz, letter: 'B' }}
          onPressItem={item => navigateToArtist(item)}
          keyOf={item => item.localId}
          subtitleOf={externalArtistSubtitle}
        />
      )}
    </>
  )
}

function ExternalSimilarArtistsSection({ similarArtists }: { similarArtists: Artist[] }) {
  const { t } = useTranslation()
  const { width: screenWidth } = useWindowDimensions()
  const itemSize = Math.min(132, Math.max(112, (screenWidth - 56) / 2.7))
  const { navigateToArtist } = useMatchedNavigation()

  return (
    <SimilarArtistsSubSection
      data={similarArtists}
      itemSize={itemSize}
      keyPrefix="deezer"
      badge={{ color: sourceColor.deezer, letter: 'D' }}
      onPressItem={item => navigateToArtist(item)}
      keyOf={item => item.localId}
      subtitleOf={() => t('common.artist')}
    />
  )
}

export default function ArtistContent({ localArtist, externalArtist }: Props) {
  const scrollClearance = useScrollClearance()
  const navigation = useNavigation<any>()
  const { navigateToAlbum } = useMatchedNavigation()
  const { colors } = useTheme()
  const rad = useRadius()
  const { t } = useTranslation()
  const [visibleAlbumsCount, setVisibleAlbumsCount] = useState(INITIAL_RELEASE_ROWS)
  const [visibleSinglesCount, setVisibleSinglesCount] = useState(INITIAL_RELEASE_ROWS)
  const [showUnownedAlbums, setShowUnownedAlbums] = useState(false)
  const [showUnownedSingles, setShowUnownedSingles] = useState(false)
  const localAlbums = useArtistAlbums(localArtist?.nativeId ?? '')
  const { tracks: libraryTracks } = useTracks()
  const { data: externalDiscography } = useArtistExternalDiscography(localArtist?.name ?? null, !!localArtist)

  const songCountByAlbumId = useMemo(() => {
    const counts = new Map<string, number>()
    libraryTracks.forEach(track => {
      counts.set(track.album.localId, (counts.get(track.album.localId) ?? 0) + 1)
    })
    return counts
  }, [libraryTracks])

  const items = useMemo<ArtistContentItem[]>(() => {
    const rows: ArtistContentItem[] = []

    if (localArtist) {
      rows.push({ kind: 'mostPlayed', id: 'most-played' })
      rows.push({ kind: 'topSongs', id: 'server-top-songs' })
      rows.push({ kind: 'popularOnDeezer', id: 'popular-on-deezer' })

      const albums = localAlbums.filter(album => !isSingleOrEp(album, songCountByAlbumId.get(album.localId) ?? 0))
      const singles = localAlbums.filter(album => isSingleOrEp(album, songCountByAlbumId.get(album.localId) ?? 0))

      // Owned and unowned releases are kept in separate groups rather than
      // merged chronologically — the shared AlbumRow double-checks
      // "already in library" independently as a safety net if this dedup
      // misses an edge case. Unowned releases stay behind a "show unowned" tile
      // (reusing the pagination row's look) until the user opts in, so scanning
      // what you actually own isn't interrupted by releases you don't have.
      const missingAlbums = (externalDiscography?.albums ?? [])
        .filter(ext => !matchAlbumToLibrary({ externalIds: ext.externalIds, title: ext.title, artistName: ext.artist.name }, localAlbums))
      const missingSingles = (externalDiscography?.singles ?? [])
        .filter(ext => !matchAlbumToLibrary({ externalIds: ext.externalIds, title: ext.title, artistName: ext.artist.name }, localAlbums))

      const ownedAlbumItems: ArtistContentItem[] = albums
        .map(album => ({ kind: 'localAlbum' as const, id: `album-${album.localId}`, album }))
        .sort((a, b) => compareByReleaseYearDesc(a.album, b.album))
      const ownedSingleItems: ArtistContentItem[] = singles
        .map(album => ({ kind: 'localAlbum' as const, id: `single-${album.localId}`, album }))
        .sort((a, b) => compareByReleaseYearDesc(a.album, b.album))
      const unownedAlbumItems: ArtistContentItem[] = missingAlbums
        .map(album => ({ kind: 'externalAlbum' as const, id: `album-ext-${album.localId}`, album }))
        .sort((a, b) => compareByReleaseYearDesc(a.album, b.album))
      const unownedSingleItems: ArtistContentItem[] = missingSingles
        .map(album => ({ kind: 'externalAlbum' as const, id: `single-ext-${album.localId}`, album }))
        .sort((a, b) => compareByReleaseYearDesc(a.album, b.album))

      if (ownedAlbumItems.length > 0 || unownedAlbumItems.length > 0) {
        rows.push({ kind: 'section', id: 'albums-section', title: t('artist.sections.albums') })
        rows.push(...ownedAlbumItems.slice(0, visibleAlbumsCount))
        if (visibleAlbumsCount < ownedAlbumItems.length) {
          rows.push({ kind: 'showMore', id: 'show-more-albums', target: 'albums', remaining: ownedAlbumItems.length - visibleAlbumsCount })
        } else if (unownedAlbumItems.length > 0) {
          if (showUnownedAlbums) {
            rows.push(...unownedAlbumItems)
          } else {
            rows.push({ kind: 'showUnowned', id: 'show-unowned-albums', target: 'albums', count: unownedAlbumItems.length })
          }
        }
      }

      if (ownedSingleItems.length > 0 || unownedSingleItems.length > 0) {
        rows.push({ kind: 'section', id: 'singles-section', title: t('artist.sections.singles') })
        rows.push(...ownedSingleItems.slice(0, visibleSinglesCount))
        if (visibleSinglesCount < ownedSingleItems.length) {
          rows.push({ kind: 'showMore', id: 'show-more-singles', target: 'singles', remaining: ownedSingleItems.length - visibleSinglesCount })
        } else if (unownedSingleItems.length > 0) {
          if (showUnownedSingles) {
            rows.push(...unownedSingleItems)
          } else {
            rows.push({ kind: 'showUnowned', id: 'show-unowned-singles', target: 'singles', count: unownedSingleItems.length })
          }
        }
      }

      rows.push({ kind: 'similar', id: 'similar-artists' })
      rows.push({ kind: 'bio', id: 'bio' })
    } else if (externalArtist) {
      rows.push({ kind: 'popularOnDeezer', id: 'popular-on-deezer' })

      const sortedAlbums = [...externalArtist.albums].sort(compareByReleaseYearDesc)
      const sortedSingles = [...externalArtist.singles].sort(compareByReleaseYearDesc)

      if (sortedAlbums.length > 0) {
        rows.push({ kind: 'section', id: 'albums-section', title: t('artist.sections.albums') })
        const visibleAlbums = sortedAlbums.slice(0, visibleAlbumsCount)
        rows.push(...visibleAlbums.map(album => ({ kind: 'externalAlbum' as const, id: `album-${album.localId}`, album })))
        if (visibleAlbumsCount < sortedAlbums.length) {
          rows.push({ kind: 'showMore', id: 'show-more-albums', target: 'albums', remaining: sortedAlbums.length - visibleAlbumsCount })
        }
      }

      if (sortedSingles.length > 0) {
        rows.push({ kind: 'section', id: 'singles-section', title: t('artist.sections.singles') })
        const visibleSingles = sortedSingles.slice(0, visibleSinglesCount)
        rows.push(...visibleSingles.map(album => ({ kind: 'externalAlbum' as const, id: `single-${album.localId}`, album })))
        if (visibleSinglesCount < sortedSingles.length) {
          rows.push({ kind: 'showMore', id: 'show-more-singles', target: 'singles', remaining: sortedSingles.length - visibleSinglesCount })
        }
      }

      if (externalArtist.similarArtists.length > 0) {
        rows.push({ kind: 'similar', id: 'similar-artists' })
      }
      rows.push({ kind: 'bio', id: 'bio' })
    }

    return rows
  }, [localArtist, externalArtist, localAlbums, externalDiscography, songCountByAlbumId, visibleAlbumsCount, visibleSinglesCount, showUnownedAlbums, showUnownedSingles, t])

  const renderItem = useCallback(({ item }: { item: ArtistContentItem }) => {
    if (item.kind === 'mostPlayed') {
      return localArtist ? <MostPlayedSection artist={localArtist} /> : null
    }

    if (item.kind === 'topSongs') {
      return localArtist ? <TopSongsSection artist={localArtist} /> : null
    }

    if (item.kind === 'popularOnDeezer') {
      return (
        <PopularOnDeezerSectionResolver
          localArtist={localArtist}
          externalArtist={externalArtist}
        />
      )
    }

    if (item.kind === 'bio') {
      return (
        <BioSectionResolver
          localArtist={localArtist}
          externalArtist={externalArtist}
        />
      )
    }

    if (item.kind === 'section') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.secondary }]}>
            {item.title}
          </Text>
        </View>
      )
    }

    if (item.kind === 'similar') {
      return localArtist
        ? <LocalSimilarArtistsSection artist={localArtist} />
        : <ExternalSimilarArtistsSection similarArtists={externalArtist?.similarArtists ?? []} />
    }

    // Same tile-row look for both: "keep reading the list" (showMore) and
    // "opt into releases you don't own" (showUnowned) are both progressive
    // disclosure of more rows, just with different icon/copy/trigger.
    if (item.kind === 'showMore' || item.kind === 'showUnowned') {
      const isUnowned = item.kind === 'showUnowned'
      return (
        <Touchable
          style={styles.showMoreRow}
          onPress={() => {
            if (isUnowned) {
              if (item.target === 'albums') setShowUnownedAlbums(true)
              else setShowUnownedSingles(true)
            } else if (item.target === 'albums') {
              setVisibleAlbumsCount(c => c + 5)
            } else {
              setVisibleSinglesCount(c => c + 5)
            }
          }}
        >
          <View style={[styles.showMoreIcon, { backgroundColor: colors.card, borderRadius: rad.thumb }]}>
            {isUnowned
              ? <Globe size={iconSize.row} color={colors.secondary} />
              : <Ellipsis size={iconSize.row} color={colors.secondary} />
            }
          </View>
          <Text style={[styles.showMoreText, { color: colors.secondary }]}>
            {isUnowned ? t('artist.showUnowned', { count: item.count }) : t('artist.showMore', { count: item.remaining })}
          </Text>
        </Touchable>
      )
    }

    if (item.kind === 'localAlbum') {
      return (
        <AlbumRow
          album={item.album}
          onPress={() => navigation.push('albumView', { id: item.album.nativeId })}
          subtextOverride={releaseYearLabel(item.album) ?? undefined}
        />
      )
    }

    return (
      <AlbumRow
        album={item.album}
        onPress={(album) => navigateToAlbum(album)}
        subtextOverride={releaseYearLabel(item.album) ?? undefined}
      />
    )
  }, [colors, rad.thumb, localArtist, externalArtist, navigation, navigateToAlbum, setVisibleAlbumsCount, setVisibleSinglesCount, setShowUnownedAlbums, setShowUnownedSingles, t])

  return (
    <DetailScreen bar={<ArtistHeaderBar localArtist={localArtist} externalArtist={externalArtist} />}>
      {scroll => (
      <FlashList
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<Header localArtist={localArtist} externalArtist={externalArtist} showNavigation={false} />}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: scrollClearance,
          backgroundColor: colors.background,
        }}
        {...scroll}
      />
      )}
    </DetailScreen>
  )
}

// PopularOnDeezerSection needs different data plumbing per mode (local mode
// fetches via useArtistTopTracks; external mode already has the data fetched)
// — isolated here so that hook call stays unconditional within its own
// component regardless of which branch renderItem takes.
function PopularOnDeezerSectionResolver({ localArtist, externalArtist }: {
  localArtist: Artist | null
  externalArtist: SourceArtistDetail | null
}) {
  const deezerEnabled = useDeezerDiscoveryEnabled()
  const { topTracks: localTopTracks } = useArtistTopTracks({
    name: localArtist?.name ?? '',
    mbid: localArtist?.externalIds.mbid,
    enabled: !!localArtist && deezerEnabled,
  })

  if (localArtist) {
    return <PopularOnDeezerSection topTracks={localTopTracks} artistId={localArtist.nativeId} artistName={localArtist.name} />
  }
  if (externalArtist) {
    return (
      <PopularOnDeezerSection
        topTracks={externalArtist.topTracks ?? []}
        artistId={externalArtist.artist.nativeId}
        artistName={externalArtist.artist.name}
      />
    )
  }
  return null
}

// Same per-mode plumbing as PopularOnDeezerSectionResolver: local mode pulls
// the Deezer biography via useArtistTopTracks (the same query the resolver
// above runs, so react-query dedupes it), external mode already has it on
// the artist. Gated by the Deezer Top Tracks setting in local mode, matching
// the pre-unification behavior where the bio lived inside TopTracksSection.
//
// When neither source has a bio, `useArtistInfoEnrichment` (metadata.enrich,
// GAPS ONLY — see features/metadata) may fill the gap; it stays a no-op
// whenever a real bio already exists, so this never overrides server/Deezer
// data, only supplements its absence.
function BioSectionResolver({ localArtist, externalArtist }: {
  localArtist: Artist | null
  externalArtist: SourceArtistDetail | null
}) {
  const deezerEnabled = useDeezerDiscoveryEnabled()
  const { biography: localBiography } = useArtistTopTracks({
    name: localArtist?.name ?? '',
    mbid: localArtist?.externalIds.mbid,
    enabled: !!localArtist && deezerEnabled,
  })

  const ownBio = localArtist ? localBiography : externalArtist?.artist.biography
  const artistName = localArtist?.name ?? externalArtist?.artist.name ?? ''
  const artistMbid = localArtist?.externalIds.mbid ?? externalArtist?.artist.externalIds?.mbid ?? null

  const { bio: enrichedBio, sourceLabel } = useArtistInfoEnrichment({
    name: artistName,
    mbid: artistMbid,
    hasOwnBio: !!ownBio,
  })

  return (
    <BioSection
      biography={ownBio ?? enrichedBio ?? undefined}
      enrichedSourceLabel={ownBio ? null : sourceLabel}
    />
  )
}

const styles = StyleSheet.create({
  sectionHeader: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.controlGap,
  },
  sectionTitle: {
    ...typography.navigationTitle,
    paddingHorizontal: spacing.lg,
  },
  sectionTitleNopad: {
    paddingHorizontal: 0,
  },
  similarSection: {
    paddingTop: spacing.roomy,
    paddingBottom: spacing.controlGap,
  },
  similarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.controlGap,
  },
  sourceBadge: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceBadgeLetter: {
    ...typography.micro,
    fontWeight: '600',
    color: onDark.text,
  },
  similarListContent: {
    paddingHorizontal: spacing.lg,
  },
  similarGap: {
    width: 12,
  },
  showMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.xs,
  },
  showMoreIcon: {
    width: 64,
    height: 64,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showMoreText: {
    ...typography.button,
  },
})
