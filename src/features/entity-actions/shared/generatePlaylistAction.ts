import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { notify } from '@/components/toast';

/**
 * The one "generate a similar playlist" implementation, shared by songs,
 * albums and artists (playlists don't have one). Each caller supplies its own
 * `generateSimilarPlaylistFor*` API call (different args per kind — a song,
 * an `AlbumDetail`, or an artist + its songs) plus its own toast keys; the
 * in-flight guard, loading state, success navigation and error toast were
 * duplicated three times and now live once.
 *
 * Preserved as-is: the *gate* deciding whether this row shows at all differs
 * per kind (song gates on "is Audiomuse configured"; album/artist gate on
 * "can generate playlist", which additionally folds in whether songs have
 * loaded) — that stays in each kind's own `visible` predicate, not here.
 */
export function useGeneratePlaylistAction(opts: {
  run: () => Promise<{ trackCount: number; playlistId: string }>;
  t: (key: string, opts?: Record<string, unknown>) => string;
  generatedKey: string;
  failedKey: string;
  close: () => void;
}) {
  const router = useRouter();
  const inFlightRef = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsGenerating(true);
    try {
      const result = await opts.run();
      notify.success(opts.t(opts.generatedKey, { count: result.trackCount }));
      opts.close();
      router.push({ pathname: '/playlistView', params: { id: result.playlistId } });
    } catch {
      notify.error(opts.t(opts.failedKey));
    } finally {
      inFlightRef.current = false;
      setIsGenerating(false);
    }
  };

  return { isGenerating, generate };
}
