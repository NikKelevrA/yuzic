import { useMemo } from 'react';

import type { ApiAdapter } from '@/providers/contracts/ServerAdapter';
import {
  createSimilarityServiceQueueFillProvider,
  createNativeSimilarityQueueFillProvider,
  createLibraryFallbackProvider,
  type QueueFillProvider,
} from '@/features/playback/queueProviders';
import { useSimilarityService } from './similarityService';

/**
 * Where Autoplay, Smart Shuffle and Play Similar look for tracks nobody
 * chose, strongest first: the similarity service's acoustic matches when one
 * is connected, the server's own similar-songs otherwise, and — when neither
 * has anything to say about this particular seed — more of what the listener
 * already has (the rest of its album, then another by the same artist).
 * That last one is always available; it's the floor everything else lands
 * on, not one more thing to be "configured".
 *
 * Declared here with the other provider declarations, so playback asks for
 * "the fill sources" without naming any of them.
 */
export function useQueueFillProviders(api: ApiAdapter): QueueFillProvider[] {
  const similarity = useSimilarityService();

  return useMemo(() => [
    ...(similarity ? [createSimilarityServiceQueueFillProvider(similarity, api)] : []),
    createNativeSimilarityQueueFillProvider(api),
    createLibraryFallbackProvider(api),
  ], [api, similarity]);
}
