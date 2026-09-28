import React from 'react'
import { render } from '@testing-library/react-native'
import { Text as RNText } from 'react-native'

import { ShelfCarousel } from './ShelfCarousel'

/**
 * The four states a Home shelf can be in.
 *
 * Six shelves each decided this for themselves and each got a different part
 * of it wrong — four spelled their error and empty text in English, two had no
 * error branch at all, and one announced it was empty while it was still
 * loading. The states are why this component exists, so they are what is
 * tested.
 */

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#fff', subtext: '#aaa' } }),
}))
jest.mock('@/components/SkeletonTiles', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: () => <View testID="skeleton" /> }
})
jest.mock('@shopify/flash-list', () => {
  const { View } = require('react-native')
  return {
    FlashList: ({ data, renderItem }: { data: unknown[]; renderItem: (i: unknown) => React.ReactNode }) => (
      <View testID="list">{data.map((item, index) => (
        <View key={index}>{renderItem({ item, index })}</View>
      ))}</View>
    ),
  }
})

type Row = { id: string }

const ROWS: Row[] = [{ id: 'a' }, { id: 'b' }]

async function shelf(props: Partial<React.ComponentProps<typeof ShelfCarousel<Row>>> = {}) {
  return render(
    <ShelfCarousel<Row>
      title="Shelf"
      isLoading={false}
      data={ROWS}
      keyExtractor={item => item.id}
      renderItem={({ item, width }) => <RNText>{`${item.id}@${width}`}</RNText>}
      emptyMessage="nothing here"
      {...props}
    />
  )
}

describe('ShelfCarousel', () => {
  it('shows the rows once it has them', async () => {
    const view = await shelf()
    expect(view.getByTestId('list')).toBeTruthy()
    expect(view.queryByTestId('skeleton')).toBeNull()
  })

  it('hands each row the width, so no shelf works it out again', async () => {
    const view = await shelf()
    // The exact number is the shelf rule's business; that a positive width
    // reaches the row is this component's.
    const rendered = view.getByText(/^a@/).props.children as string
    expect(Number(rendered.split('@')[1])).toBeGreaterThan(0)
  })

  // "No albums in your library yet" while the albums were still arriving.
  it('shows the skeleton while loading, never the empty message', async () => {
    const view = await shelf({ isLoading: true, data: [] })
    expect(view.getByTestId('skeleton')).toBeTruthy()
    expect(view.queryByText('nothing here')).toBeNull()
  })

  it('says the shelf is empty only once it is known to be', async () => {
    const view = await shelf({ data: [] })
    expect(view.getByText('nothing here')).toBeTruthy()
  })

  // Two shelves had no error branch, so a failed request looked like a thin
  // library. The message is the shared localised one, not a hardcoded string.
  it('reports a failure with the shared localised line', async () => {
    const view = await shelf({ isError: true, data: [] })
    expect(view.getByText('common.loadFailed')).toBeTruthy()
    expect(view.queryByText('nothing here')).toBeNull()
  })

  it('prefers the failure over the empty message even with rows cached', async () => {
    const view = await shelf({ isError: true })
    expect(view.getByText('common.loadFailed')).toBeTruthy()
    expect(view.queryByTestId('list')).toBeNull()
  })

  // A heading over an empty rail promises something and then does not deliver.
  it('drops itself, heading and all, when empty with nothing to say', async () => {
    const view = await shelf({ data: [], emptyMessage: undefined })
    expect(view.queryByText('Shelf')).toBeNull()
    expect(view.queryByTestId('list')).toBeNull()
  })

  it('still shows its skeleton while loading, even with no empty message', async () => {
    const view = await shelf({ isLoading: true, data: [], emptyMessage: undefined })
    expect(view.getByTestId('skeleton')).toBeTruthy()
  })

  it('lets a shelf bring its own heading', async () => {
    const view = await shelf({ header: <RNText>picker</RNText>, title: 'ignored' })
    expect(view.getByText('picker')).toBeTruthy()
    expect(view.queryByText('ignored')).toBeNull()
  })
})
