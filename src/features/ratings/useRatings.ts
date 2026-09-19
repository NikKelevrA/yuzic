import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDispatch, useSelector } from 'react-redux'

import { clampRating } from '@/domain/entities/Rating'
// The store, not the barrel. `components/toast` also exports `ToastHost`,
// so importing the name from there pulls the whole toast *component* — and
// through it gesture-handler — into every module that only wants to say
// something went wrong. That is a cost on a hook the settings screen and the
// sort sheet both call just to ask whether ratings exist.
import { notify } from '@/components/toast/notify'
import { selection } from '@/components/haptics'
import { useApi } from '@/providers/registry/useApi'
import { useServerReachable } from '@/features/connectivity/useServerReachable'
import { selectActiveServerId } from '@/state/redux/selectors/serversSelectors'
import {
  clearRatingOverride,
  selectRatingOverrides,
  setRatingOverride,
} from '@/state/redux/slices/ratingsSlice'
import { effectiveRating } from './effectiveRating'

/** The shape every rateable thing shares — an id, and what it was rated. */
type Rateable = { nativeId: string; userRating?: number }

/**
 * What this thing is rated, out of five — or undefined where the server does
 * not carry a rating for it.
 *
 * Reads the catalog's value and the overlay of what this device has written
 * since together; see `effectiveRating` for which wins.
 */
export function useRating(entity: Rateable | null | undefined): number | undefined {
  const serverId = useSelector(selectActiveServerId)
  const overrides = useSelector(selectRatingOverrides(serverId ?? undefined))
  if (!entity) return undefined
  return effectiveRating(entity.userRating, overrides[entity.nativeId])
}

/**
 * Writes a rating, showing it immediately and taking it back if the server
 * refuses.
 *
 * Optimistic because a star that waits for a round trip before filling in
 * reads as a tap that did not land, and the whole ask was to rate a track
 * without stopping what you were doing. The revert is the other half of that
 * bargain: a rating the server did not take must not stay on screen.
 *
 * Refuses outright when the server cannot be reached rather than queueing.
 * A rating is not a starred flag — it has one value rather than a toggle's
 * two, so a queue of them would need an ordering to replay, and an offline
 * write that silently loses to a later one from another device is worse than
 * being told it cannot be done now.
 */
export function useSetRating() {
  const api = useApi()
  const dispatch = useDispatch()
  const serverId = useSelector(selectActiveServerId)
  const reachable = useServerReachable()
  const { t } = useTranslation()

  return useCallback(
    async (nativeId: string, rating: number): Promise<boolean> => {
      const ratings = api.ratings
      if (!ratings || !serverId || !nativeId) return false
      if (!reachable) {
        notify.error(t('ratings.offline'))
        return false
      }

      const value = clampRating(rating)
      selection()
      dispatch(setRatingOverride({ serverId, nativeId, rating: value }))
      try {
        await ratings.set(nativeId, value)
        return true
      } catch {
        dispatch(clearRatingOverride({ serverId, nativeId }))
        notify.error(t('ratings.failed'))
        return false
      }
    },
    [api.ratings, dispatch, reachable, serverId, t]
  )
}
