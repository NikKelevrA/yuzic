import { iconSize, onDark, sourceColor, spacing, statusColor, typography } from '@/constants/design'
import React, { useCallback, useMemo, useState } from 'react'
import { useRadius } from '@/features/theme/useRadius'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useNavigation } from '@react-navigation/native'
import { Ellipsis, Globe } from 'lucide-react-native'
import type { CoverSource } from '@/types/Cover'
import type { Album } from '@/domain/entities/Album'
import type { Artist } from '@/domain/entities/Artist'
import AlbumRow from '@/components/rows/AlbumRow'
import Header, { ArtistHeaderBar } from '../Header'
import { DetailScreen } from '@/components/DetailHeader'
import { useTheme } from '@/features/theme/useTheme'
import { useTranslation } from 'react-i18next'
import { useSimilarArtists } from '@/features/artist/useSimilarArtists';
import { useServerSimilarArtists } from '@/features/artist/useServerSimilarArtists'
import { useLBSimilarArtists } from '@/features/artist/useLBSimilarArtists'
import { useArtistTopTracks } from '@/features/artist/useArtistTopTracks'
import { releaseYearLabel } from '@/features/artist/discography'
import { findArtistsWithSharedGenres, dedupeServerSimilar } from '@/features/artist/localSimilarArtists'
import type { ArtistScreenModel } from '@/features/artist/useArtistScreenModel'
import { useArtistDetails } from '@/features/artist/useArtistDetails'
import MediaTile from '@/features/home/components/MediaTile'
import MostPlayedSection from './MostPlayedSection'
import PopularOnDeezerSection from './PopularOnDeezerSection'
import BioSection from './BioSection'
import { metadataSourceNameKey } from '@/providers/registry/enrichmentBroker'
import TopSongsSection from './TopSongsSection'
import { useMatchedNavigation } from '@/features/sources/useMatchedNavigation'
import { useDeezerDiscoveryEnabled } from '@/features/home/hooks/useDeezerEnabled'
import { useSelector } from 'react-redux'
import { selectShowSourceHeaders } from '@/features/settings/appearance/state';
import { useAlbums } from '@/features/album/useAlbums';
import Touchable from '@/components/Touchable'
import { useScrollClearance } from '@/features/theme/useScrollClearance'

type Props = {
  model: ArtistScreenModel
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
  const { albums: libraryAlbums } = useAlbums()
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

  // Pure use-case (`features/artist/localSimilarArtists.ts`): drop
  // server-similar entries the local-similar shelf already covers.
  const dedupedServerSimilar = useMemo(
    () => dedupeServerSimilar(serverSimilar, localSimilar),
    [serverSimilar, localSimilar]
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

export default function ArtistContent({ model }: Props) {
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

  const { artist, isLocal, discography } = model
  const { ownedAlbums, ownedSingles, unownedAlbums, unownedSingles } = discography

  const items = useMemo<ArtistContentItem[]>(() => {
    const rows: ArtistContentItem[] = []
    if (!artist) return rows

    if (isLocal) {
      rows.push({ kind: 'mostPlayed', id: 'most-played' })
      rows.push({ kind: 'topSongs', id: 'server-top-songs' })
      rows.push({ kind: 'popularOnDeezer', id: 'popular-on-deezer' })

      const ownedAlbumItems: ArtistContentItem[] = ownedAlbums.map(album => ({ kind: 'localAlbum' as const, id: `album-${album.localId}`, album }))
      const ownedSingleItems: ArtistContentItem[] = ownedSingles.map(album => ({ kind: 'localAlbum' as const, id: `single-${album.localId}`, album }))
      const unownedAlbumItems: ArtistContentItem[] = unownedAlbums.map(album => ({ kind: 'externalAlbum' as const, id: `album-ext-${album.localId}`, album }))
      const unownedSingleItems: ArtistContentItem[] = unownedSingles.map(album => ({ kind: 'externalAlbum' as const, id: `single-ext-${album.localId}`, album }))

      // Owned and unowned releases are kept in separate groups rather than
      // merged chronologically — unowned releases stay behind a "show
      // unowned" tile until the user opts in, so scanning what you actually
      // own isn't interrupted by releases you don't have.
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
    } else {
      rows.push({ kind: 'popularOnDeezer', id: 'popular-on-deezer' })

      const visibleAlbums = unownedAlbums.slice(0, visibleAlbumsCount)
      if (unownedAlbums.length > 0) {
        rows.push({ kind: 'section', id: 'albums-section', title: t('artist.sections.albums') })
        rows.push(...visibleAlbums.map(album => ({ kind: 'externalAlbum' as const, id: `album-${album.localId}`, album })))
        if (visibleAlbumsCount < unownedAlbums.length) {
          rows.push({ kind: 'showMore', id: 'show-more-albums', target: 'albums', remaining: unownedAlbums.length - visibleAlbumsCount })
        }
      }

      if (unownedSingles.length > 0) {
        rows.push({ kind: 'section', id: 'singles-section', title: t('artist.sections.singles') })
        const visibleSingles = unownedSingles.slice(0, visibleSinglesCount)
        rows.push(...visibleSingles.map(album => ({ kind: 'externalAlbum' as const, id: `single-${album.localId}`, album })))
        if (visibleSinglesCount < unownedSingles.length) {
          rows.push({ kind: 'showMore', id: 'show-more-singles', target: 'singles', remaining: unownedSingles.length - visibleSinglesCount })
        }
      }

      if (model.similarArtists.length > 0) {
        rows.push({ kind: 'similar', id: 'similar-artists' })
      }
      rows.push({ kind: 'bio', id: 'bio' })
    }

    return rows
  }, [artist, isLocal, ownedAlbums, ownedSingles, unownedAlbums, unownedSingles, model.similarArtists, visibleAlbumsCount, visibleSinglesCount, showUnownedAlbums, showUnownedSingles, t])

  const renderItem = useCallback(({ item }: { item: ArtistContentItem }) => {
    if (item.kind === 'mostPlayed') {
      return artist ? <MostPlayedSection artist={artist} /> : null
    }

    if (item.kind === 'topSongs') {
      return artist ? <TopSongsSection artist={artist} /> : null
    }

    if (item.kind === 'popularOnDeezer') {
      if (!artist) return null
      return isLocal
        ? <LocalPopularOnDeezerSection artist={artist} />
        : <PopularOnDeezerSection topTracks={model.topTracks} artistId={artist.nativeId} artistName={artist.name} />
    }

    if (item.kind === 'bio') {
      return <BioSectionView model={model} />
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
      return isLocal && artist
        ? <LocalSimilarArtistsSection artist={artist} />
        : <ExternalSimilarArtistsSection similarArtists={model.similarArtists} />
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
  }, [colors, rad.thumb, artist, isLocal, model, navigation, navigateToAlbum, setVisibleAlbumsCount, setVisibleSinglesCount, setShowUnownedAlbums, setShowUnownedSingles, t])

  return (
    <DetailScreen bar={<ArtistHeaderBar model={model} />}>
      {scroll => (
      <FlashList
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<Header model={model} showNavigation={false} />}
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

// A library artist's popular tracks are Deezer's top-tracks for that name —
// gated by the Home "Deezer Top Tracks" toggle, a source independent of
// `metadata.enrich`/the screen model (see `useArtistScreenModel.ts`'s doc
// on `topTracks`). Isolated in its own component so this hook call stays
// unconditional regardless of which branch `renderItem` takes.
function LocalPopularOnDeezerSection({ artist }: { artist: Artist }) {
  const deezerEnabled = useDeezerDiscoveryEnabled()
  const { topTracks } = useArtistTopTracks({
    name: artist.name,
    mbid: artist.externalIds.mbid,
    enabled: deezerEnabled,
  })
  return <PopularOnDeezerSection topTracks={topTracks} artistId={artist.nativeId} artistName={artist.name} />
}

// The biography always comes from an external source: Deezer's top-tracks
// lookup in local mode (a source independent of `metadata.enrich`, same
// toggle as `LocalPopularOnDeezerSection` above), or the resolved external
// artist's own field otherwise — or, when metadata enrichment is on and
// neither of those has one, from `resolveArtistDetails` (Phase 5
// enrichment). Kept as its own resolution here (rather than reading
// `model.resolved.biography` directly) because the model deliberately does
// not depend on the Deezer Top Tracks toggle — see its doc comment.
function BioSectionView({ model }: { model: ArtistScreenModel }) {
  const { t } = useTranslation()
  const { artist, isLocal, resolved: coverResolved } = model
  const deezerEnabled = useDeezerDiscoveryEnabled()
  const { biography: localDeezerBio } = useArtistTopTracks({
    name: artist?.name ?? '',
    mbid: artist?.externalIds.mbid,
    enabled: isLocal && !!artist && deezerEnabled,
  })

  const ownBio = isLocal ? (artist?.biography ?? localDeezerBio) : artist?.biography
  const effectiveArtist: Artist | null = useMemo(() => {
    if (!artist) return null
    if (artist.biography || !isLocal) return artist
    return { ...artist, biography: localDeezerBio }
  }, [artist, isLocal, localDeezerBio])
  // Reuses the same broker-backed resolution as the cover (`coverResolved`)
  // whenever it already accounts for every field this artist has — which is
  // always true in external mode, and true in local mode exactly when there
  // is no Deezer bio to fold in. Only local mode with a Deezer-sourced bio
  // needs a second resolution, keyed on the bio-merged entity.
  const needsOwnResolution = isLocal && !!localDeezerBio && !artist?.biography
  const ownResolution = useArtistDetails(needsOwnResolution ? effectiveArtist : null)
  const resolved = needsOwnResolution ? ownResolution : coverResolved

  const enrichedBio = !ownBio ? resolved?.biography?.value : undefined
  const enrichedSourceNameKey = !ownBio && resolved?.biography ? metadataSourceNameKey(resolved.biography.sourceId) : null

  return (
    <BioSection
      biography={ownBio ?? enrichedBio ?? undefined}
      enrichedSourceLabel={enrichedSourceNameKey ? t(enrichedSourceNameKey) : null}
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
