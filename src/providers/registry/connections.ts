import type { Href } from 'expo-router';
import type { RootState } from '@/state/redux/store';
import { selectListenBrainzAuthenticated } from '@/state/redux/selectors/listenbrainzSelectors';
import { selectAudiomuseAuthenticated, selectAudiomuseEnabled } from '@/state/redux/selectors/audiomuseSelectors';

/**
 * The account and service integrations a user manages from Connections.
 *
 * Declared here, with the other provider declarations, so the Connections
 * screen can list them without naming any: it reads this list and draws each
 * entry. Downloaders are declared by their own registry
 * (`features/downloaders/registry.ts`) and join the list there.
 */
export type ManagedIntegration = {
  id: string;
  group: 'accounts' | 'services';
  /** The product's own name, shown untranslated. */
  brandName: string;
  summaryKey: string;
  route: Href;
  /** Whether it is usable now, for the active server. */
  isConnected: (state: RootState) => boolean;
  statusKeys: { connected: string; disconnected: string };
};

export const MANAGED_INTEGRATIONS: readonly ManagedIntegration[] = [
  {
    id: 'listenbrainz',
    group: 'accounts',
    brandName: 'ListenBrainz',
    summaryKey: 'settings.connections.summary.listenbrainz',
    route: '/settings/listenbrainzView',
    isConnected: state => selectListenBrainzAuthenticated(state),
    statusKeys: { connected: 'settings.connections.status.connected', disconnected: 'settings.connections.status.notConnected' },
  },
  {
    id: 'audiomuse',
    group: 'services',
    brandName: 'AudioMuse-AI',
    summaryKey: 'settings.connections.summary.audiomuse',
    route: '/settings/audiomuseView',
    isConnected: state => selectAudiomuseAuthenticated(state) && selectAudiomuseEnabled(state),
    statusKeys: { connected: 'settings.connections.status.ready', disconnected: 'settings.connections.status.notSetUp' },
  },
];
