import React, { type ReactNode } from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'

import settingsAppearanceReducer, { addProfile, setThemeColor } from '../state'
import { ProfileSelector } from './ProfileSelector'

/**
 * The Yuzic look is the one profile the user cannot rename, delete or edit —
 * it is what every other profile departs from, and what deleting the last of
 * them leaves you on. This is the screen that has to keep saying so.
 */

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@/components/SingleSelectBottomSheet', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: () => <View testID="profile-sheet" /> }
})
jest.mock('./ProfileNameSheet', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: () => <View testID="name-sheet" /> }
})

function setup() {
  const store = configureStore({ reducer: { settingsAppearance: settingsAppearanceReducer } })
  const Wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  Wrapper.displayName = 'TestStoreWrapper'
  return { store, view: render(<ProfileSelector />, { wrapper: Wrapper }) }
}

describe('ProfileSelector', () => {
  it('offers neither rename nor delete for the Yuzic look', async () => {
    const { view } = setup()
    const screen = await view

    expect(screen.getByTestId('appearance-profile')).toBeTruthy()
    expect(screen.queryByTestId('appearance-profile-rename')).toBeNull()
    expect(screen.queryByTestId('appearance-profile-delete')).toBeNull()
  })

  it('offers both once the user is on a profile of their own', async () => {
    const { store, view } = setup()
    const screen = await view

    await act(async () => { store.dispatch(addProfile({ name: 'Night' })) })

    expect(screen.getByTestId('appearance-profile-rename')).toBeTruthy()
    expect(screen.getByTestId('appearance-profile-delete')).toBeTruthy()
  })

  // Editing the default forks a copy, so this row renames itself without the
  // user having touched it — which is the only signal that it happened.
  it('stops naming the default once an edit has forked it', async () => {
    const { store, view } = setup()
    const screen = await view
    expect(screen.getByText('settings.appearance.profiles.default')).toBeTruthy()

    await act(async () => { store.dispatch(setThemeColor('#123456')) })

    expect(screen.queryByText('settings.appearance.profiles.default')).toBeNull()
    expect(screen.getByText('settings.appearance.profiles.mine')).toBeTruthy()
  })

  it('asks for a name rather than making one silently', async () => {
    const { view } = setup()
    const screen = await view

    expect(screen.queryByTestId('name-sheet')).toBeNull()
    await act(async () => { fireEvent.press(screen.getByTestId('appearance-profile-new')) })
    expect(screen.getByTestId('name-sheet')).toBeTruthy()
  })
})
