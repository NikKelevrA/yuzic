import { onDark, spacing, typography } from '@/constants/design';
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, ScrollView, View, Text, RefreshControl } from 'react-native'
import { useIsFetching } from '@tanstack/react-query'
import { useScrollToTop } from '@react-navigation/native'
import { useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/features/theme/useTheme'
import { useDailyLayout } from '@/features/home/hooks/useDailyLayout'
import { customizeHomeSections } from '@/features/home/homeLayout'
import { useIsOffline } from '@/features/connectivity/useIsOffline'
import { selectSourceUses } from '@/features/settings/sources/state'
import { selectShowSourceHeaders } from '@/features/settings/appearance/state';
import { resolveHomeShelfOrder, selectHomeServerSectionsEnabled, selectHomeShelfOrders, selectHomeShelfVisibilityMap, type HomeShelfTier } from '@/features/settings/home/state';
import { HOME_SOURCE_TIERS } from '@/providers/registry/homeDiscovery'
import { SOURCES } from '@/providers/registry/sources'

import QuickPicksSection from './components/QuickPicksSection'
import RecentlyPlayed from './components/RecentlyPlayed'
import RecentlyAdded from './components/RecentlyAdded'
import MostPlayedAlbums from './components/MostPlayedAlbums'
import BecauseYouListenedSection from './components/BecauseYouListenedSection'
import TopArtistsSection from './components/TopArtistsSection'
import ChartsSection from './components/ChartsSection'
import GenreSection from './components/GenreSection'
import ServerRandomSection from './components/ServerRandomSection'
import ServerNowPlayingSection from './components/ServerNowPlayingSection'
import LocalMixSection from './components/LocalMixSection'
import LBSimilarForYouSection from './components/LBSimilarForYouSection'
import LBCreatedForSection from './components/LBCreatedForSection'
import ContinuePlayingSection from './components/ContinuePlayingSection'
import SourceGroup from './components/SourceGroup'
import { ResumeQueueBanner } from './components/ResumeQueueBanner'
import { DownloadsInProgressBanner } from './components/DownloadsInProgressBanner'
import { useApi } from '@/providers/registry/useApi'
import type { SectionConfig } from '@/features/home/homeLayout'
import { useRadius } from '@/features/theme/useRadius'
import { useScrollClearance } from '@/features/theme/useScrollClearance'

function renderSection(config: SectionConfig, refreshKey: number) {
  switch (config.type) {
    case 'quickPicks':
      return <QuickPicksSection key={config.key} refreshKey={refreshKey} />
    case 'recentlyPlayed':
      return <RecentlyPlayed key={config.key} />
    case 'continuePlaying':
      return <ContinuePlayingSection key={config.key} />
    case 'recentlyAdded':
      return <RecentlyAdded key={config.key} />
    case 'mostPlayed':
      return <MostPlayedAlbums key={config.key} />
    case 'charts':
      return <ChartsSection key={config.key} refreshKey={refreshKey} />
    case 'topArtists':
      return <TopArtistsSection key={config.key} refreshKey={refreshKey} />
    case 'becauseYouListened':
      return <BecauseYouListenedSection key={config.key} artistName={config.artistName!} refreshKey={refreshKey} />
    case 'genre':
      return <GenreSection key={config.key} genre={config.genre!} refreshKey={refreshKey} />
    case 'serverRandom':
      return <ServerRandomSection key={config.key} sectionKey={config.key} refreshKey={refreshKey} />
    case 'serverNowPlaying':
      return <ServerNowPlayingSection key={config.key} sectionKey={config.key} />
    case 'localMix':
      return <LocalMixSection key={config.key} sectionKey={config.key} refreshKey={refreshKey} />
    case 'lbSimilarArtistsForYou':
      return <LBSimilarForYouSection key={config.key} sectionKey={config.key} artistName={config.artistName!} refreshKey={refreshKey} />
    case 'lbCreatedFor':
      return <LBCreatedForSection key={config.key} sectionKey={config.key} mixType={config.mixType!} refreshKey={refreshKey} />
    default:
      return null
  }
}

export default function Home() {
  const { t } = useTranslation()
  const scrollClearance = useScrollClearance()

  // Re-tapping the active tab returns to the top of the feed, the way every
  // iOS tab bar behaves. React Navigation drives this off the same `tabPress`
  // the custom tab bar already emits, so the two stay in step.
  const scrollRef = useRef<ScrollView>(null)
  useScrollToTop(scrollRef)

  const { colors } = useTheme()
  const rad = useRadius()
  const [refreshKey, setRefreshKey] = useState(0)
  const { resume, library, server, sources } = useDailyLayout(refreshKey)
  const isOffline = useIsOffline()
  const sourceUses = useSelector(selectSourceUses)
  const showSourceHeaders = useSelector(selectShowSourceHeaders)
  const homeServerEnabled = useSelector(selectHomeServerSectionsEnabled)
  const homeVisibility = useSelector(selectHomeShelfVisibilityMap)
  const shelfOrders = useSelector(selectHomeShelfOrders)
  const visibleIn = (tier: HomeShelfTier, sections: SectionConfig[]) =>
    customizeHomeSections(sections, homeVisibility, resolveHomeShelfOrder(shelfOrders?.[tier], sections.map(s => s.key)))
  const visibleResume = visibleIn('resume', resume)
  const visibleLibrary = visibleIn('library', library)
  const visibleServer = visibleIn('server', server)
  const api = useApi()
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Track active query count so the spinner clears when fetches complete rather
  // than after a fixed 500ms timeout.
  const isFetching = useIsFetching()
  const refreshStateRef = useRef({ fetchStarted: false, timer: null as ReturnType<typeof setTimeout> | null })

  const clearRefreshing = useCallback(() => {
    const s = refreshStateRef.current
    if (s.timer) { clearTimeout(s.timer); s.timer = null }
    s.fetchStarted = false
    setIsRefreshing(false)
  }, [])

  useEffect(() => {
    if (!isRefreshing) return
    const s = refreshStateRef.current
    if (isFetching > 0) {
      // At least one fetch has started — cancel the safety timer and wait for 0.
      s.fetchStarted = true
      if (s.timer) { clearTimeout(s.timer); s.timer = null }
    } else if (s.fetchStarted) {
      // All fetches done — spinner can go away.
      clearRefreshing()
    }
  }, [isRefreshing, isFetching, clearRefreshing])

  const onRefresh = useCallback(() => {
    const s = refreshStateRef.current
    s.fetchStarted = false
    if (s.timer) clearTimeout(s.timer)
    // Safety: if all data is already within staleTime, isFetching never rises.
    // Cap the spinner at 2s so it doesn't spin forever.
    s.timer = setTimeout(clearRefreshing, 2000)
    setIsRefreshing(true)
    setRefreshKey(k => k + 1)
  }, [clearRefreshing])

  // Server discovery is on whenever the adapter provides it — no per-user
  // toggle, matching how radio and shares appear only where the server can
  // back them. Every outside tier waits for its source's Home switch, and is
  // not attempted offline.
  const activeSources = [
    {
      id: 'server',
      label: t('explore.sources.server'),
      // Your own server is not a third-party brand, so it gets the app's own
      // accent rather than borrowing an outside source's colour.
      color: colors.themeColor,
      letter: 'S',
      sections: visibleServer,
      enabled: Boolean(api.discovery) && homeServerEnabled,
    },
    ...HOME_SOURCE_TIERS.map(tier => ({
      id: tier.source,
      label: t(SOURCES[tier.source].nameKey),
      color: tier.badge.color,
      letter: tier.badge.letter,
      sections: visibleIn(tier.source, sources[tier.source] ?? []),
      enabled: Boolean(sourceUses?.[`${tier.source}.homeShelves`]) && !isOffline,
    })),
  ]

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: scrollClearance }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.secondary}
        />
      }
    >
      <ResumeQueueBanner />
      <DownloadsInProgressBanner />

      {visibleResume.map(config => renderSection(config, refreshKey))}

      {visibleLibrary.length > 0 && (
        <>
          <View style={styles.sourceHeader}>
            <Text style={[styles.sourceHeaderText, { color: colors.subtext }]}>
              {t('explore.sections.fromYourLibrary')}
            </Text>
          </View>
          {visibleLibrary.map(config => renderSection(config, refreshKey))}
        </>
      )}

      {activeSources.map(source => {
        if (!source.enabled || source.sections.length === 0) return null
        // The shelves under a source decide for themselves whether they have
        // anything; the group withholds the heading until one of them says it
        // does, so a source that renders nothing takes its label with it.
        return (
          <SourceGroup
            key={source.id}
            sectionKeys={source.sections.map(config => config.key)}
            header={
              <View style={styles.sourceHeader}>
                {showSourceHeaders && (
                  <View style={[styles.sourceBadge, { backgroundColor: source.color, borderRadius: rad.pill }]}>
                    <Text style={styles.sourceBadgeLetter}>{source.letter}</Text>
                  </View>
                )}
                <Text style={[styles.sourceHeaderText, { color: colors.subtext }]}>
                  {source.label}
                </Text>
              </View>
            }
          >
            {source.sections.map(config => renderSection(config, refreshKey))}
          </SourceGroup>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingTop: spacing.md,
  },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.roomy,
    paddingBottom: spacing.xs,
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
  sourceHeaderText: {
    ...typography.label,
  },
})
