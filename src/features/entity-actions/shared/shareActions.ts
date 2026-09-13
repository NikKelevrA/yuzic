import { useState } from 'react';
import { useApi } from '@/api';
import { shareItem } from '@/utils/share';
import haptics from '@/utils/haptics';
import { notify } from '@/components/toast';
import { useTranslation } from 'react-i18next';

/**
 * The one share implementation, shared by albums and playlists (the only two
 * kinds that expose Share — songs and artists never did). Both callers used
 * to duplicate `api.shares.create` → `shareItem` → close-on-success with only
 * the item id/title/message differing.
 */
export function useShareAction(opts: {
  itemId: string | undefined;
  title: string;
  message: string;
  failedKey: string;
  close: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [isSharing, setIsSharing] = useState(false);

  const share = async () => {
    if (!opts.itemId || !api.shares || isSharing) return;
    haptics.selection();
    setIsSharing(true);
    try {
      const created = await api.shares.create({ itemId: opts.itemId, description: opts.title });
      if (!created?.url) {
        notify.error(t(opts.failedKey));
        return;
      }
      const shared = await shareItem({ url: created.url, title: opts.title, message: opts.message });
      if (shared) opts.close();
    } catch {
      notify.error(t(opts.failedKey));
    } finally {
      setIsSharing(false);
    }
  };

  return { isSharing, share, canShare: !!api.shares };
}
