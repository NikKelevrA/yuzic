import { fetchPlaylistStatus } from './status';
import type { PlaylistImportConfig } from './client';

export interface PlaylistImportTestConfig extends PlaylistImportConfig {
  targetUser: string;
}

/** Any successful, parseable answer — even zero tracked playlists — proves
 *  the proxy is reachable and serving this endpoint. */
export async function testConnection(config: PlaylistImportTestConfig): Promise<void> {
  await fetchPlaylistStatus(config, config.targetUser);
}
