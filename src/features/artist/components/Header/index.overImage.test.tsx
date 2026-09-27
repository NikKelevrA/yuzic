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
 * The hero fades its blurred photograph into the screen's colour, and both of
 * those fades end opaque — correct over a flat background and a hard line
 * across the screen over a background image, because the page's image simply
 * resumed below where the header's slab stopped.
 *
 * Over an image the photograph is masked out towards its foot instead, so the
 * page comes through it. The gradient can only darken what is behind it, which
 * is why the mask is the part that matters and the stops alone would not do.
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
    counts: { albums: 1, songs: 13 },
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
  it('masks its photograph so the page shows through', async () => {
    const view = await over(SURFACE)

    expect(view.getByTestId('artist-hero-mask')).toBeTruthy()
    expect(view.getByTestId('artist-hero-photo')).toBeTruthy()
  })

  it('stops darkening short of opaque, so there is no slab to end', async () => {
    const view = await over(SURFACE)

    expect(fadeStops(view)).toEqual([...coverFade.onImage])
    expect(fadeStops(view)).not.toContain('rgba(0,0,0,1)')
  })

  it('draws no stand-in slab for an artist with no picture', async () => {
    // The muted rectangle is the same hard edge the fade exists to avoid.
    const view = await over(SURFACE, { kind: 'none' })

    expect(view.queryByTestId('artist-hero-photo')).toBeNull()
    expect(view.queryByTestId('artist-hero-mask')).toBeNull()
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
