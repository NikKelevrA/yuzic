import type { Href } from 'expo-router';
import { shallowEqual, useSelector } from 'react-redux';

import { useDownloaderStates, type DownloaderState } from '@/features/downloaders/registry';
import { MANAGED_INTEGRATIONS, type ManagedIntegration } from '@/providers/registry/connections';
import type { RootState } from '@/state/redux/store';

/** Where a connection is listed: a personal account, or a service you run. */
type ConnectionGroup = ManagedIntegration['group'] | 'downloaders';

/** One managed integration, as Connections draws it. */
type ConnectionEntry = {
  id: string;
  group: ConnectionGroup;
  /** A brand name, shown as-is, or an i18n key for one. */
  label: { text: string } | { key: string };
  summaryKey: string;
  route: Href;
  connected: boolean;
  statusKey: string;
};

/** Order the groups appear in, with the header each one carries. */
export const CONNECTION_GROUPS: { group: ConnectionGroup; titleKey: string }[] = [
  { group: 'accounts', titleKey: 'settings.connections.accounts' },
  { group: 'services', titleKey: 'settings.connections.services' },
  { group: 'downloaders', titleKey: 'settings.downloaders.title' },
];

/**
 * Every integration Connections manages, from the declarations.
 *
 * The screen used to write each row out by hand — ListenBrainz here, AudioMuse
 * there, the downloaders in a third block — each with its own status wording
 * inline, so adding an integration meant editing the screen's layout. It now
 * draws whatever this returns: the managed integrations declared in
 * `providers/registry/connections.ts` and the downloaders declared in their
 * registry. Keyless outside services (Deezer, MusicBrainz, Last.fm, …) are
 * not connections — there is nothing to sign in to — and live in Online
 * sources.
 */
export function buildConnectionEntries({
  integrations,
  connected,
  downloaders,
}: {
  integrations: readonly ManagedIntegration[];
  /** Parallel to `integrations`. */
  connected: readonly boolean[];
  downloaders: Pick<DownloaderState, 'def' | 'isConnected'>[];
}): ConnectionEntry[] {
  return [
    ...integrations.map((integration, index): ConnectionEntry => {
      const isConnected = connected[index] ?? false;
      return {
        id: integration.id,
        group: integration.group,
        label: { text: integration.brandName },
        summaryKey: integration.summaryKey,
        route: integration.route,
        connected: isConnected,
        statusKey: isConnected ? integration.statusKeys.connected : integration.statusKeys.disconnected,
      };
    }),
    ...downloaders.map(({ def, isConnected }): ConnectionEntry => ({
      id: def.id,
      group: 'downloaders',
      label: { key: `settings.downloaders.${def.id}.title` },
      summaryKey: 'settings.connections.summary.downloader',
      route: def.settingsRoute,
      connected: isConnected,
      statusKey: isConnected ? 'settings.connections.status.ready' : 'settings.connections.status.notSetUp',
    })),
  ];
}

/** The live entries for the active server. */
export function useConnectionEntries(): ConnectionEntry[] {
  const connected = useSelector(
    (state: RootState) => MANAGED_INTEGRATIONS.map(integration => integration.isConnected(state)),
    shallowEqual,
  );
  const downloaders = useDownloaderStates();
  return buildConnectionEntries({ integrations: MANAGED_INTEGRATIONS, connected, downloaders });
}
