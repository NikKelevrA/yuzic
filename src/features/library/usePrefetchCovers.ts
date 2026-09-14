import { useEffect } from 'react';
import { prefetchCovers } from '@/features/artwork/imageCache';
import type { CoverSource } from '@/domain/entities/Cover';

export function usePrefetchCovers(
  covers: readonly (CoverSource | null | undefined)[],
  size: 'thumb' | 'grid' | 'detail' | 'background',
) {
  useEffect(() => {
    prefetchCovers(covers, size);
  }, [covers, size]);
}
