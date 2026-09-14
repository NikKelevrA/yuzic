import { DownloadProviderType } from '@/features/offline/downloadProvider';
import { CoverSource } from '@/domain/entities/Cover';

export type DownloadRow = {
  id: string;
  collectionId: string;
  type: 'album' | 'playlist' | 'track';
  provider: DownloadProviderType;
  serverId: string | null;
  cover: CoverSource;
  title: string;
  subtitle: string;
  trackIds: string[];
  downloaded: string;
  size: string;
  trackCount: number;
  updatedAt: number;
};
