import { createLidarrClient } from '../client';
import type { LidarrConfig } from '@/providers/integration/lidarr/config';

export async function testConnection(config: LidarrConfig) {
  const client = createLidarrClient(config);
  await client.request('/system/status');
  return true;
}