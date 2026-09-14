import { createLidarrClient } from './client';
import type { LidarrConfig } from '@/providers/integration/lidarr/config';
import * as artists from './artists';

// Auth / connection
export { testConnection } from './auth';

// Artists
export function getQualityProfiles(config: LidarrConfig) {
  return artists.getQualityProfiles(createLidarrClient(config));
}
export type { LidarrQualityProfile } from './artists';

// Albums
export { downloadAlbum } from './albums';
export { albumRequestFromExternal } from './albums/resolution';

// Queue
export {
  fetchQueue,
  cancelQueueItem,
} from './queue';
