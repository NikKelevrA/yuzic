import { useMemo } from 'react';

import { createAudiomuseClient } from '@/providers/integration/audiomuse/client';
import { getAudiomuseQueueExtension } from '@/providers/integration/audiomuse/similarity';
import { useAudiomuseConfig, useIsAudiomuseConfigured } from '@/state/redux/selectors/audiomuseSelectors';

/**
 * A service that knows which of the server's own tracks sound like others —
 * behind Autoplay's fill, the playlist footer's picks and "make a playlist
 * like this". It indexes the active server's library, so ids in and out are
 * that server's native ids.
 */
export interface SimilarityService {
  similarTrackIds(opts: { seedItemIds: string[]; excludeItemIds: string[]; limit: number }): Promise<string[]>;
}

/**
 * The similarity service connected for the active server, or null when none
 * is. Declared here with the other provider declarations, so features ask for
 * "similar tracks" without naming who answers.
 */
export function useSimilarityService(): SimilarityService | null {
  const configured = useIsAudiomuseConfigured();
  const { serverUrl, apiToken } = useAudiomuseConfig();

  return useMemo(() => {
    if (!configured) return null;
    return {
      similarTrackIds: async opts => {
        const refs = await getAudiomuseQueueExtension(createAudiomuseClient({ serverUrl, apiToken }), opts);
        return refs.map(ref => ref.itemId);
      },
    };
  }, [configured, serverUrl, apiToken]);
}
