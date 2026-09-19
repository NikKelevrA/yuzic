import React from 'react';
import { render } from '@testing-library/react-native';

import MediaListRow from './MediaListRow';

// Resolves against the real en.json and interpolates, so the assertions below
// pin the shipped string rather than the key. A row's announcement is exactly
// the kind of thing a key-returning mock cannot tell apart from a bug.
jest.mock('react-i18next', () => {
  const en = require('@/locales/en.json');
  const lookup = (key: string): string =>
    key.split('.').reduce<any>((node, part) => node?.[part], en) ?? key;
  return {
    // MediaImage reaches the provider registry, which initialises i18n, so the
    // mock has to keep the plugin the real module exports as well as `t`.
    initReactI18next: { type: '3rdParty', init: () => {} },
    useTranslation: () => ({
      t: (key: string, vars?: Record<string, string>) =>
        Object.entries(vars ?? {}).reduce(
          (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
          lookup(key)
        ),
    }),
  };
});

// The artwork is not the subject here, and reaching it pulls in the provider
// registry and the store behind it.
jest.mock('@/components/MediaImage', () => ({ MediaImage: () => null }));

jest.mock('@/features/theme/useTheme', () => ({
  useTheme: () => ({ colors: { secondary: '#000', subtext: '#666' }, isDarkMode: false }),
}));
jest.mock('@/features/theme/useRadius', () => ({ useRadius: () => ({ thumb: 6 }) }));
jest.mock('@/features/theme/useListDensity', () => ({
  useListDensity: () => ({ rowPadding: 8, rowGap: 8 }),
}));

const cover = { uri: undefined } as never;

describe('MediaListRow', () => {
  it('announces the artist as well as the title', async () => {
    const view = await render(
      <MediaListRow title="Blue Monday" subtitle="New Order" cover={cover} onPress={jest.fn()} />
    );

    expect(view.getByLabelText('Blue Monday, New Order')).toBeTruthy();
  });

  it('announces the title alone when the row has no second line', async () => {
    const view = await render(<MediaListRow title="Blue Monday" cover={cover} onPress={jest.fn()} />);

    expect(view.getByLabelText('Blue Monday')).toBeTruthy();
  });

  it('does not name a row that cannot be pressed', async () => {
    const view = await render(<MediaListRow title="Blue Monday" subtitle="New Order" cover={cover} />);

    expect(view.queryByLabelText('Blue Monday, New Order')).toBeNull();
  });
});
