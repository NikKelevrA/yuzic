import { FileMusic } from 'lucide-react-native';

import { createLocalAdapter } from '@/providers/server/local';
import type { ServerProviderConfig } from '@/providers/registry/serverProviderTypes';
import i18n from '@/i18n';

export const localProvider: ServerProviderConfig = {
  type: 'local',
  label: 'Local files',
  get description() { return i18n.t('onboarding.connect.providerDescription.local'); },
  icon: { kind: 'glyph', Glyph: FileMusic },
  capabilities: { supportsDemo: false },
  libraryScope: { key: 'localLibraryIds', legacyKey: 'localLibraryId' },
  listLibraries: async () => [{ id: 'device', name: i18n.t('onboarding.local.libraryName') }],
  ping: async () => true,
  connect: async () => ({ success: true, auth: {} }),
  createAdapter: (server) => createLocalAdapter(server),
  buildCoverUrl: (_server, cover) => cover.kind === 'url' ? cover.url : null,
};
