import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import Discovery from './';
import { DISCOVERY_USES } from '@/providers/registry/sources';

const mockReplace = jest.fn();
const mockDispatch = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

jest.mock('@/features/theme/useRadius', () => ({
  useRadius: () => ({ pill: 999 }),
}));

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666', border: '#ccc', card: '#111', themeColor: '#0f0', background: '#fff', muted: '#eee' } }),
}));

jest.mock('@/features/settings/sources/state', () => ({
  setSourceUses: (payload: unknown) => ({ type: 'setSourceUses', payload }),
}));

jest.mock('@/features/settings/onboarding/state', () => ({
  setOnboardingDiscoveryPrompted: (payload: boolean) => ({ type: 'setOnboardingDiscoveryPrompted', payload }),
}));

describe('Discovery onboarding step', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockReplace.mockClear();
  });

  it('renders the transparent explanation and both actions', async () => {
    const view = await render(<Discovery />);

    expect(view.getByText('onboarding.discovery.title')).toBeTruthy();
    expect(view.getByText('onboarding.discovery.subtitle')).toBeTruthy();
    expect(view.getByText('onboarding.discovery.whatIsSent')).toBeTruthy();
    expect(view.getByText('onboarding.discovery.enable')).toBeTruthy();
    expect(view.getByText('onboarding.discovery.notNow')).toBeTruthy();
  });

  it('Enable turns on every discovery use and marks prompted', async () => {
    const view = await render(<Discovery />);

    fireEvent.press(view.getByText('onboarding.discovery.enable'));

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'setSourceUses', payload: { uses: DISCOVERY_USES, enabled: true } });
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'setOnboardingDiscoveryPrompted', payload: true });
    expect(mockReplace).toHaveBeenCalledWith('/(home)/(tabs)/(home)');
  });

  it('Not now leaves discovery off but still marks prompted', async () => {
    const view = await render(<Discovery />);

    fireEvent.press(view.getByText('onboarding.discovery.notNow'));

    expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setSourceUses' }));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'setOnboardingDiscoveryPrompted', payload: true });
    expect(mockReplace).toHaveBeenCalledWith('/(home)/(tabs)/(home)');
  });
});
