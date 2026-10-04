import React from 'react'
import { render } from '@testing-library/react-native'

import ArtistMetaRow from './ArtistMetaRow'

/**
 * `counts.singles` and its row only mean anything once the row-level
 * gating in `useArtistScreenModel` also agrees to show it — see that file's
 * own tests for the counting itself. What belongs here is narrower: given a
 * `counts`/`virtualCatalogBrowsingEnabled` pair, does this row draw the
 * right strings and nothing extra.
 */

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'common.album': 'album',
      'common.albums': 'albums',
      'common.song': 'song',
      'common.songs': 'songs',
      'common.single': 'single',
      'common.singles': 'singles',
    }[key] ?? key),
  }),
}))

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { subtext: '#666' } }),
}))

describe('ArtistMetaRow', () => {
  it('matches current behavior with the switch off, however many singles counts', () => {
    const { getByText, queryByText } = render(
      <ArtistMetaRow
        isLocal
        counts={{ albums: 8, singles: 47, songs: 120 }}
        virtualCatalogBrowsingEnabled={false}
        discographyLoading={false}
      />
    )
    expect(getByText('8 albums')).toBeTruthy()
    expect(getByText('120 songs')).toBeTruthy()
    expect(queryByText(/single/)).toBeNull()
  })

  it('adds a singles item, split from albums, once the switch is on', () => {
    const { getByText } = render(
      <ArtistMetaRow
        isLocal
        counts={{ albums: 8, singles: 47, songs: 120 }}
        virtualCatalogBrowsingEnabled
        discographyLoading={false}
      />
    )
    expect(getByText('8 albums')).toBeTruthy()
    expect(getByText('47 singles')).toBeTruthy()
    expect(getByText('120 songs')).toBeTruthy()
  })

  it('omits the singles item at zero even with the switch on', () => {
    const { queryByText } = render(
      <ArtistMetaRow
        isLocal
        counts={{ albums: 8, singles: 0, songs: 120 }}
        virtualCatalogBrowsingEnabled
        discographyLoading={false}
      />
    )
    expect(queryByText(/singles?/)).toBeNull()
  })

  it('singularizes a single singles count', () => {
    const { getByText } = render(
      <ArtistMetaRow
        isLocal={false}
        counts={{ albums: 0, singles: 1, songs: 0 }}
        virtualCatalogBrowsingEnabled
        discographyLoading={false}
      />
    )
    expect(getByText('1 single')).toBeTruthy()
  })

  it('shows nothing while the live discography fetch is still in flight, even with stale counts', () => {
    const { queryByText } = render(
      <ArtistMetaRow
        isLocal
        counts={{ albums: 0, singles: 0, songs: 0 }}
        virtualCatalogBrowsingEnabled
        discographyLoading
      />
    )
    expect(queryByText(/album|single|song/)).toBeNull()
  })
})
