import React from 'react'
import { act, render, waitFor } from '@testing-library/react-native'

import type { ArtistScreenModel } from '@/features/artist/useArtistScreenModel'
import type { Artist } from '@/domain/entities/Artist'
import type { CoverSource } from '@/domain/entities/Cover'
import { setCoverResolutionContext } from '@/features/artwork/coverResolution'
import ArtistHeader from './'

/**
 * The header draws the artist's picture through cover resolution, the same
 * rule every tile uses — `coverResolution.test.ts` covers the rule itself.
 * What stays to verify here is the header's part: it shows what resolution
 * answers, and credits a backup's picture (never the artist's own, nor the
 * library's copy of the same artist).
 */

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts?.source ? `via ${opts.source}` : key) }),
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
}))

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ isDarkMode: false, colors: { secondary: '#000', subtext: '#666', muted: '#eee', card: '#fff', onThemeColor: '#fff' } }),
}))

jest.mock('@/features/theme/useRadius', () => ({
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

// Which cover `MediaImage` is asked to render, as `kind:url`.
jest.mock('@/components/MediaImage', () => {
  const { Text: RNText } = require('react-native')
  return {
    MediaImage: ({ cover }: { cover: { kind: string; url?: string } }) => (
      <RNText testID="media-image-cover">{`${cover.kind}:${cover.url ?? ''}`}</RNText>
    ),
  }
})

// One backup, answering from a table the tests fill in.
jest.mock('@/providers/registry/coverBackups', () => ({
  coverBackupFor: (source: string) => source === 'deezer'
    ? {
        source,
        handles: () => true,
        lookup: async (subject: { name?: string }) => mockPictures[subject.name ?? ''] ?? null,
      }
    : null,
}))

jest.mock('@/providers/registry/covers', () => ({
  buildCover: (cover: { kind: string; url?: string }) => (cover.kind === 'url' ? cover.url : null),
  buildCoverCacheKey: jest.fn(),
}))
jest.mock('react-native-turbo-image', () => 'TurboImage')
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }))
jest.mock('@/components/Touchable', () => 'Touchable')
jest.mock('@/components/options/ArtistOptions', () => 'ArtistOptions')
jest.mock('./ExternalActionRow', () => 'ExternalActionRow')
jest.mock('@/components/useSheetRef', () => ({ useSheetRef: () => ({ current: null }) }))
jest.mock('@/features/playback/PlayingContext', () => ({ usePlayingActions: () => ({ playSongInCollection: jest.fn() }) }))
jest.mock('@/features/offline/DownloadContext', () => ({ useDownload: () => ({ downloadAlbumById: jest.fn(), getCollectionDownloadState: () => ({ isDownloaded: false, isDownloading: false }) }) }))
jest.mock('@/features/downloads/useCollectionDownloadProgress', () => ({ useCollectionDownloadProgress: () => 0 }))
jest.mock('@/components/SpinningLoaderCircle', () => 'SpinningLoaderCircle')
jest.mock('@/components/DownloadStateIcon', () => 'DownloadStateIcon')
jest.mock('@/features/artist/useArtistAlbums', () => ({ useArtistAlbums: () => [] }));jest.mock('@/features/song/useTracks', () => ({ useTracks: () => ({ tracks: [] }) }));jest.mock('@/providers/registry/useApi', () => ({ useApi: () => ({ albums: { get: jest.fn() } }) }))
jest.mock('@/state/redux/selectors/serversSelectors', () => ({ selectActiveServer: () => null }))
jest.mock('react-redux', () => ({ useSelector: () => undefined }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
jest.mock('@/components/toast', () => ({ notify: { info: jest.fn(), success: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() } }))

/* eslint-disable no-var -- hoisted for the jest.mock factory above */
var mockPictures: Record<string, CoverSource> = {}
/* eslint-enable no-var */

function artistNamed(name: string, cover: CoverSource = { kind: 'none', subject: { kind: 'artist', name } }): Artist {
  return {
    localId: `local:artist:ext:listenbrainz:${name}` as never,
    nativeId: name,
    provenance: { origin: 'integration', providerId: 'listenbrainz' },
    externalIds: {},
    libraryState: 'external',
    name,
    cover,
    tags: [],
    albumIds: [],
  }
}

function modelFor(artist: Artist): ArtistScreenModel {
  return {
    status: 'ready',
    isLocal: false,
    artist,
    degraded: false,
    resolved: null,
    topTracks: [],
    similarArtists: [],
    discography: { ownedAlbums: [], ownedSingles: [], unownedAlbums: [], unownedSingles: [] },
    counts: { albums: 0, songs: 0 },
  }
}

const shownCover = (view: Awaited<ReturnType<typeof render>>) =>
  view.getByTestId('media-image-cover').props.children

describe('ArtistHeader artwork', () => {
  beforeEach(() => {
    mockPictures = {}
    setCoverResolutionContext({ artists: [], albums: [], backups: ['deezer'], online: true })
  })

  it("shows the artist's own picture and credits nobody", async () => {
    const own = artistNamed('Own Cover', { kind: 'url', url: 'https://example.com/server.jpg' })
    mockPictures['Own Cover'] = { kind: 'url', url: 'https://example.com/backup.jpg' }

    const view = await render(<ArtistHeader model={modelFor(own)} showNavigation={false} />)

    expect(shownCover(view)).toBe('url:https://example.com/server.jpg')
    expect(view.queryByText(/^via /)).toBeNull()
  })

  it("fills a gap from an enabled backup and credits it", async () => {
    mockPictures['Backup Filled'] = { kind: 'url', url: 'https://example.com/backup.jpg' }

    const view = await render(<ArtistHeader model={modelFor(artistNamed('Backup Filled'))} showNavigation={false} />)

    await waitFor(() => expect(shownCover(view)).toBe('url:https://example.com/backup.jpg'))
    expect(view.getByText('via settings.sources.deezer.name')).toBeTruthy()
  })

  it("uses the library's copy of the same artist without crediting a source", async () => {
    const library = artistNamed('In Library', { kind: 'url', url: 'https://example.com/library.jpg' })
    mockPictures['In Library'] = { kind: 'url', url: 'https://example.com/backup.jpg' }
    await act(async () => { setCoverResolutionContext({ artists: [library] }) })

    const view = await render(<ArtistHeader model={modelFor(artistNamed('In Library'))} showNavigation={false} />)

    expect(shownCover(view)).toBe('url:https://example.com/library.jpg')
    expect(view.queryByText(/^via /)).toBeNull()
  })

  it('shows the placeholder while no backup is switched on', async () => {
    mockPictures['Backups Off'] = { kind: 'url', url: 'https://example.com/backup.jpg' }
    await act(async () => { setCoverResolutionContext({ backups: [] }) })

    const view = await render(<ArtistHeader model={modelFor(artistNamed('Backups Off'))} showNavigation={false} />)

    expect(shownCover(view)).toBe('none:')
    expect(view.queryByText(/^via /)).toBeNull()
  })
})
