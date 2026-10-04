import React from 'react'
import { render } from '@testing-library/react-native'

import type { ArtistScreenModel } from '@/features/artist/useArtistScreenModel'
import type { Artist } from '@/domain/entities/Artist'
import type { CoverSource } from '@/domain/entities/Cover'
import { coverFade } from '@/constants/design'
import { setCoverResolutionContext } from '@/features/artwork/coverResolution'
import { BackgroundSurfaceContext } from '@/features/theme/screenBackgroundContext'
import ArtistHeader from './'

/**
 * How the header's own artwork behaves when the page already has a picture.
 *
 * Over the screen's own colour the hero fades its blurred photograph into it,
 * and that fade ends opaque, which is right when what follows is a flat
 * colour.
 *
 * Over a background image it draws nothing. It used to draw the photograph and
 * mask it out towards its foot so the page came through — which fixed the hard
 * line it left behind but not the reason it was wrong. The photograph still
 * covered the top of the screen with a second picture, over the one someone
 * had chosen to put behind the app.
 */

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }) }))
jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ isDarkMode: true, colors: { secondary: '#fff', subtext: '#999', muted: '#222', card: '#111', onThemeColor: '#fff' } }),
}))
jest.mock('@/features/theme/useRadius', () => ({ useRadius: () => ({ pill: 999, md: 8 }) }))
jest.mock('@/components/DetailHeader', () => ({
  useDetailHeaderInset: () => 0,
  useDetailHeroTitleLayout: () => undefined,
  DetailActionRow: 'DetailActionRow',
  DetailCircleAction: 'DetailCircleAction',
  DetailPlayAction: 'DetailPlayAction',
  DetailHeaderBar: 'DetailHeaderBar',
  DetailHeaderIconButton: 'DetailHeaderIconButton',
}))
jest.mock('@/components/MediaImage', () => ({ MediaImage: 'MediaImage' }))
jest.mock('@/providers/registry/coverBackups', () => ({ coverBackupFor: () => null }))
jest.mock('@/providers/registry/covers', () => ({
  buildCover: (cover: { kind: string; url?: string }) => (cover.kind === 'url' ? cover.url : null),
  buildCoverCacheKey: jest.fn(),
}))
jest.mock('react-native-turbo-image', () => 'TurboImage')
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }))
jest.mock('@react-native-masked-view/masked-view', () => 'MaskedView')
jest.mock('@/components/Touchable', () => 'Touchable')
jest.mock('@/components/options/ArtistOptions', () => 'ArtistOptions')
jest.mock('./ExternalActionRow', () => 'ExternalActionRow')
jest.mock('@/components/useSheetRef', () => ({ useSheetRef: () => ({ current: null }) }))
jest.mock('@/features/playback/PlayingContext', () => ({ usePlayingActions: () => ({ playSongInCollection: jest.fn() }) }))
jest.mock('@/features/offline/DownloadContext', () => ({ useDownload: () => ({ downloadAlbumById: jest.fn(), getCollectionDownloadState: () => ({ isDownloaded: false, isDownloading: false }) }) }))
jest.mock('@/features/downloads/useCollectionDownloadProgress', () => ({ useCollectionDownloadProgress: () => 0 }))
jest.mock('@/components/SpinningLoaderCircle', () => 'SpinningLoaderCircle')
jest.mock('@/components/DownloadStateIcon', () => 'DownloadStateIcon')
jest.mock('@/features/artist/useArtistAlbums', () => ({ useArtistAlbums: () => [] }))
jest.mock('@/features/song/useTracks', () => ({ useTracks: () => ({ tracks: [] }) }))
jest.mock('@/providers/registry/useApi', () => ({ useApi: () => ({ albums: { get: jest.fn() } }) }))
jest.mock('@/state/redux/selectors/serversSelectors', () => ({ selectActiveServer: () => null }))
jest.mock('react-redux', () => ({ useSelector: () => undefined }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
jest.mock('@/components/toast', () => ({ notify: { info: jest.fn(), success: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() } }))

const PHOTO: CoverSource = { kind: 'url', url: 'https://example.com/artist.jpg' }
const SURFACE = { uri: 'file:///docs/theme/background-1.jpg', blur: 24, dim: 0.6 }

function modelFor(cover: CoverSource): ArtistScreenModel {
  const artist: Artist = {
    localId: 'local:artist:ext:listenbrainz:Tiesto' as never,
    nativeId: 'Tiesto',
    provenance: { origin: 'integration', providerId: 'listenbrainz' },
    externalIds: {},
    name: 'Tiesto',
    cover,
    tags: [],
    albumIds: [],
  }
  return {
    status: 'ready',
    isLocal: false,
    artist,
    degraded: false,
    resolved: null,
    topTracks: [],
    similarArtists: [],
    discography: { ownedAlbums: [], ownedSingles: [], unownedAlbums: [], unownedSingles: [] },
    counts: { albums: 1, singles: 0, songs: 13 },
    virtualCatalogBrowsingEnabled: false,
    discographyLoading: false,
  }
}

const over = (surface: typeof SURFACE | null, cover: CoverSource = PHOTO) =>
  render(
    <BackgroundSurfaceContext.Provider value={surface}>
      <ArtistHeader model={modelFor(cover)} showNavigation={false} />
    </BackgroundSurfaceContext.Provider>,
  )

const fadeStops = (view: Awaited<ReturnType<typeof render>>) =>
  view.getByTestId('artist-hero-fade').props.colors as string[]

beforeEach(() => {
  setCoverResolutionContext({ artists: [], albums: [], backups: [], online: true })
})

describe('the artist hero over a background image', () => {
  // It used to draw the photograph and mask it out towards its foot, which
  // fixed the hard line it left but not the reason it was wrong: it still
  // covered the top of the screen with a second picture, over the one the
  // user had chosen to put behind the app.
  it('draws no backdrop of its own at all', async () => {
    const view = await over(SURFACE)

    expect(view.queryByTestId('artist-hero-photo')).toBeNull()
    expect(view.queryByTestId('artist-hero-mask')).toBeNull()
    expect(view.queryByTestId('artist-hero-slab')).toBeNull()
  })

  // Nothing to land on the page means nothing to darken on the way.
  it('draws no fade either, since there is nothing to fade', async () => {
    const view = await over(SURFACE)

    expect(view.queryByTestId('artist-hero-fade')).toBeNull()
  })

  it('still shows the artist, which is content rather than backdrop', async () => {
    const view = await over(SURFACE)

    expect(view.getByText('Tiesto')).toBeTruthy()
  })

  it('draws nothing for an artist with no picture either', async () => {
    const view = await over(SURFACE, { kind: 'none' })

    expect(view.queryByTestId('artist-hero-photo')).toBeNull()
    expect(view.queryByTestId('artist-hero-slab')).toBeNull()
  })
})

describe('the artist hero on a plain background', () => {
  it('keeps the opaque fade and needs no mask', async () => {
    const view = await over(null)

    expect(view.queryByTestId('artist-hero-mask')).toBeNull()
    expect(view.getByTestId('artist-hero-photo')).toBeTruthy()
    expect(fadeStops(view)).toEqual([...coverFade.onDark])
  })

  it('still fills an artist with no picture', async () => {
    const view = await over(null, { kind: 'none' })

    expect(view.queryByTestId('artist-hero-photo')).toBeNull()
    expect(view.getByTestId('artist-hero-slab')).toBeTruthy()
    expect(fadeStops(view)).toEqual([...coverFade.onDark])
  })
})
