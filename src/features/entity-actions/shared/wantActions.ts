import { useDispatch, useSelector } from 'react-redux';
import { selection as hapticsSelection } from '@/utils/haptics';
import { selectActiveServerId } from '@/utils/redux/selectors/serversSelectors';
import { selectIsWanted } from '@/utils/redux/selectors/wantsSelectors';
import { addWant, removeWant, type WantOrigin, type WantUnit } from '@/utils/redux/slices/wantsSlice';
import type { LocalId } from '@/domain/identity/LocalId';
import type { ExternalIds } from '@/domain/identity/ExternalIds';

/**
 * The one Want/Unwant implementation, shared by external songs and external
 * albums (the only two entity kinds with a "want" concept). Both call sites
 * used to duplicate this same dispatch-a-redux-action logic with only the
 * `unit`/`origin` fields differing — those stay as parameters.
 */
export function useWantToggle(localId: LocalId | undefined, unit: WantUnit, origin: WantOrigin) {
  const dispatch = useDispatch();
  const activeServerId = useSelector(selectActiveServerId);
  const isWanted = useSelector(localId ? selectIsWanted(localId) : () => false);

  const toggle = (opts: { externalIds: ExternalIds; title: string; artist: string }) => {
    if (!localId || !activeServerId) return;
    hapticsSelection();
    if (isWanted) {
      dispatch(removeWant({ serverId: activeServerId, localId }));
    } else {
      dispatch(addWant({
        serverId: activeServerId,
        want: {
          localId,
          externalIds: opts.externalIds,
          unit,
          title: opts.title,
          artist: opts.artist,
          origin,
        },
      }));
    }
  };

  return { isWanted, toggle };
}
