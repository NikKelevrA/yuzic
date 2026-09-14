import { useMemo } from 'react';

import type { ApiAdapter } from '@/providers/contracts/ServerAdapter';
import {
  createAudiomuseQueueFillProvider,
  createNativeSimilarityQueueFillProvider,
  type QueueFillProvider,
} from '@/features/playback/queueProviders';
import { useAudiomuseConfig, useIsAudiomuseConfigured } from '@/state/redux/selectors/audiomuseSelectors';

/**
 * Where Autoplay, Smart Shuffle and Play Similar look for tracks nobody
 * chose, strongest first: AudioMuse-AI's acoustic similarity when it is set
 * up, the server's own similar-songs otherwise.
 *
 * Declared here with the other provider declarations, so playback asks for
 * "the fill sources" without naming any of them.
 */
export function useQueueFillProviders(api: ApiAdapter): QueueFillProvider[] {
  const isAudiomuseConfigured = useIsAudiomuseConfigured();
  const audiomuseConfig = useAudiomuseConfig();

  return useMemo(() => [
    ...(isAudiomuseConfigured ? [createAudiomuseQueueFillProvider(audiomuseConfig, api)] : []),
    createNativeSimilarityQueueFillProvider(api),
  ], [api, audiomuseConfig, isAudiomuseConfigured]);
}
