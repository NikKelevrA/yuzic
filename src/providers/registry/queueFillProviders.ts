import { useMemo } from 'react';

import type { ApiAdapter } from '@/providers/contracts/ServerAdapter';
import {
  createSimilarityServiceQueueFillProvider,
  createNativeSimilarityQueueFillProvider,
  createLibraryFallbackProvider,
  type QueueFillProvider,
} from '@/features/playback/queueProviders';
import { useSimilarityService } from './similarityService';
import { useSelfHostedMusicbrainzConfigured } from '@/features/settings/sources/useSelfHostedMusicbrainzConfigured';

/**
 * Where Autoplay, Smart Shuffle and Play Similar look for tracks nobody
 * chose, strongest first: the similarity service's acoustic matches when one
 * is connected, the server's own similar-songs otherwise, and — when neither
 * has anything to say about this particular seed — more of what the listener
 * already has (the rest of its album, then another by the same artist).
 * That last one is always available; it's the floor everything else lands
 * on, not one more thing to be "configured".
 *
 * The library-fallback tier is self-hosted-MusicBrainz-gated, same as every
 * other barebone change in this fork: nothing about the fallback logic
 * itself reads MusicBrainz, but the standing rule for this fork is that an
 * unconfigured install stays byte-for-byte stock behavior, and stock's
 * autoplay really does just stop when neither similarity tier has an
 * opinion. Safe to drop the gate and always include the fallback for anyone
 * maintaining stock off this fork.
 *
 * Declared here with the other provider declarations, so playback asks for
 * "the fill sources" without naming any of them.
 */
export function useQueueFillProviders(api: ApiAdapter): QueueFillProvider[] {
  const similarity = useSimilarityService();
  const selfHostedMbConfigured = useSelfHostedMusicbrainzConfigured();

  return useMemo(() => [
    ...(similarity ? [createSimilarityServiceQueueFillProvider(similarity, api)] : []),
    createNativeSimilarityQueueFillProvider(api),
    ...(selfHostedMbConfigured ? [createLibraryFallbackProvider(api)] : []),
  ], [api, similarity, selfHostedMbConfigured]);
}
