import React from 'react';
import { render } from '@testing-library/react-native';

import ListenBrainzView from './';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/toast', () => ({ notify: { error: jest.fn(), success: jest.fn(), info: jest.fn(), loading: jest.fn(), dismiss: jest.fn() } }));
jest.mock('react-redux', () => ({ useSelector: (selector: string) => ({
  username: selector === 'username' ? '' : undefined,
  authenticated: selector === 'authenticated' ? false : undefined,
  activeServer: selector === 'activeServer' ? { id: 'server-1' } : undefined,
}[selector]), useDispatch: () => jest.fn() }));
jest.mock('@/state/redux/selectors/listenbrainzSelectors', () => ({
  selectListenBrainzUsername: 'username',
  selectListenBrainzAuthenticated: 'authenticated',
  // A real hook (not a plain selector string like the others above) since the
  // token now comes from credentialCache, not a `RootState` selector.
  useListenBrainzToken: () => '',
  listenBrainzCredentialScope: (serverId: string) => ({ kind: 'integration', providerId: `listenbrainz:${serverId}` }),
}));
jest.mock('@/state/redux/selectors/serversSelectors', () => ({ selectActiveServer: 'activeServer' }));
jest.mock('@/state/redux/slices/listenbrainzSlice', () => ({
  setUsername: jest.fn(), setAuthenticated: jest.fn(), disconnect: jest.fn(),
}));
jest.mock('@/providers/integration/listenbrainz', () => ({ testConnection: jest.fn() }));
jest.mock('@/state/credentialCache', () => ({ setCredential: jest.fn(), forgetCredentials: jest.fn() }));
jest.mock('../../components/SettingsScreen', () => {
  const SettingsScreen = ({ children }: any) => <>{children}</>;
  return SettingsScreen;
});
jest.mock('../../components/SettingsAuthCard', () => () => null);
jest.mock('../../components/SettingsDisconnectButton', () => () => null);

describe('ListenBrainzView', () => {
  it('keeps account setup free of the Home discovery toggle', async () => {
    const view = await render(<ListenBrainzView />);

    expect(view.queryByText('settings.listenBrainz.discovery')).toBeNull();
    expect(view.queryByText('settings.listenBrainz.discoveryDescription')).toBeNull();
  });
});
