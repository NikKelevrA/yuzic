import React from 'react'
import { render } from '@testing-library/react-native'

import type { ArtistScreenModel } from '@/features/artist/useArtistScreenModel'
import ArtistHeader from './index'

/**
 * Ported from the old fetcher-based `useArtworkEnrichment` wiring test
 * (deleted alongside `features/metadata/resolveArtwork.ts` — Phase 5
 * closure, see `providers/registry/enrichmentBroker.ts`). `ArtistHeader`
 * now takes the screen model directly, so these drive it with a model
 * built by hand instead of mocking the resolver's network boundary —
 * `resolveArtistDetails.test.ts` and `enrichmentBroker.test.ts` cover the
 * resolution itself (ordered first-hit fallback, a disabled source
 * contributing nothing); what stays to verify here is what the header does
 * with the result: the server/own cover must always win when present, and
 * the enriched cover must only ever appear to fill a real gap.
 */

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts?.source ? `via ${opts.source}` : key) }),
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
}))

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ isDarkMode: false, colors: { secondary: '#000', subtext: '#666', muted: '#eee', card: '#fff', onThemeColor: '#fff' } }),
}))

jest.mock('@/hooks/useRadius', () => ({
  useRadius: () => ({ pill: 999, md: 8 }),
}))

jest.mock('@/components/DetailHeader', () => ({
  useDetailHeaderInset: () => 0,
  useDetailHeroTitleLayout: () => undefined,
  DetailActionRow: 'DetailActionRow',
  DetailCircleAction: 'DetailCircleAction',
  DetailPlayAction: 'DetailPlayAction',
  DetailHeaderBar: 'DetailHeaderBar',
  DetailHeaderIconButton: 'DetailHeaderIconButton',
}))

// The one thing these tests care about: which cover `MediaImage` is asked to
// render. Mocked to a plain text stub that dumps its `cover` prop's `kind`
// (and `url` when present) so the assertions below can read it back.
jest.mock('@/components/MediaImage', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: RNText } = require('react-native')
  return {
    MediaImage: ({ cover }: { cover: { kind: string; url?: string } }) => (
      <RNText testID="media-image-cover">{`${cover.kind}:${cover.url ?? ''}`}</RNText>
    ),
  }
})

jest.mock('@/utils/builders/buildCover', () => ({
  buildCover: (cover: { kind: string; url?: string }) => (cover.kind === 'url' ? cover.url : null),
  buildCoverArtArchiveUrl: jest.fn(),
  buildCoverCacheKey: jest.fn(),
}))
jest.mock('react-native-turbo-image', () => 'TurboImage')
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }))
jest.mock('@/components/Touchable', () => 'Touchable')
jest.mock('@/components/options/ArtistOptions', () => 'ArtistOptions')
jest.mock('@/utils/useSheetRef', () => ({ useSheetRef: () => ({ current: null }) }))
jest.mock('@/contexts/PlayingContext', () => ({ usePlayingActions: () => ({ playSongInCollection: jest.fn() }) }))
jest.mock('@/contexts/DownloadContext', () => ({ useDownload: () => ({ downloadAlbumById: jest.fn(), getCollectionDownloadState: () => ({ isDownloaded: false, isDownloading: false }) }) }))
jest.mock('@/features/downloads/useCollectionDownloadProgress', () => ({ useCollectionDownloadProgress: () => 0 }))
jest.mock('@/components/SpinningLoaderCircle', () => 'SpinningLoaderCircle')
jest.mock('@/components/DownloadStateIcon', () => 'DownloadStateIcon')
jest.mock('@/hooks/artists/useArtistAlbums', () => ({ useArtistAlbums: () => [] }));jest.mock('@/hooks/tracks/useTracks', () => ({ useTracks: () => ({ tracks: [] }) }));jest.mock('@/api', () => ({ useApi: () => ({ albums: { get: jest.fn() } }) }))
jest.mock('@/state/redux/selectors/serversSelectors', () => ({ selectActiveServer: () => null }))
jest.mock('react-redux', () => ({ useSelector: () => undefined }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
jest.mock('@/components/toast', () => ({ notify: { info: jest.fn(), success: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() } }))
jest.mock('@/providers/registry/enrichmentBroker', () => ({
  metadataSourceNameKey: (id: string) => `provider.${id}`,
}))

const baseArtist: NonNullable<ArtistScreenModel['artist']> = {
  localId: 'local:artist:ext:deezer:ext-1' as never,
  nativeId: 'ext-1',
  provenance: { origin: 'integration', providerId: 'deezer' },
  externalIds: { mbid: 'mbid-1' },
  libraryState: 'external',
  name: 'Radiohead',
  cover: { kind: 'none' },
  tags: [],
  albumIds: [],
}

function baseModel(overrides: Partial<ArtistScreenModel> = {}): ArtistScreenModel {
  return {
    status: 'ready',
    isLocal: false,
    artist: baseArtist,
    degraded: false,
    resolved: null,
    topTracks: [],
    similarArtists: [],
    discography: { ownedAlbums: [], ownedSingles: [], unownedAlbums: [], unownedSingles: [] },
    counts: { albums: 0, songs: 0 },
    ...overrides,
  }
}

describe('ArtistHeader artwork enrichment wiring', () => {
  it('shows the enriched cover only when the artist has no cover of its own (gap case)', async () => {
    const model = baseModel({
      resolved: {
        entity: baseArtist,
        cover: { value: { kind: 'url', url: 'https://example.com/enriched.jpg' }, sourceId: 'deezer' },
      },
    })

    const view = await render(<ArtistHeader model={model} showNavigation={false} />)

    expect(view.getByTestId('media-image-cover').props.children).toBe('url:https://example.com/enriched.jpg')
  })

  it('keeps the server cover unchanged when the artist already has artwork (no gap)', async () => {
    const model = baseModel({
      artist: { ...baseArtist, cover: { kind: 'url', url: 'https://example.com/server.jpg' } },
      resolved: {
        entity: baseArtist,
        // Even if a stale/different resolution were present, the artist's
        // own cover must still win — enrichment is gap-only.
        cover: { value: { kind: 'url', url: 'https://example.com/enriched.jpg' }, sourceId: 'deezer' },
      },
    })

    const view = await render(<ArtistHeader model={model} showNavigation={false} />)

    expect(view.getByTestId('media-image-cover').props.children).toBe('url:https://example.com/server.jpg')
  })

  it('restores the placeholder when artwork enrichment is off (or hasn\'t resolved yet)', async () => {
    const model = baseModel({ resolved: null })

    const view = await render(<ArtistHeader model={model} showNavigation={false} />)

    expect(view.getByTestId('media-image-cover').props.children).toBe('none:')
  })

  it('restores the placeholder when every enrichment source misses', async () => {
    const model = baseModel({
      resolved: { entity: baseArtist, cover: { value: { kind: 'none' }, sourceId: 'deezer' } },
    })

    const view = await render(<ArtistHeader model={model} showNavigation={false} />)

    expect(view.getByTestId('media-image-cover').props.children).toBe('none:')
  })
})
