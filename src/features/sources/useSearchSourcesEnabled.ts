import { useSelector } from 'react-redux'
import { useIsOffline } from '@/features/connectivity/useIsOffline'
import { selectEnabledSourcesFor } from '@/features/settings/sources/state'
import { ALL_SOURCES, type SourceId } from '@/features/sources/registry'

/**
 * Which sources the user has turned on for Search's "Other sources" scope —
 * each source's search use, separate from what it may fill on Home or on
 * pages. A source lighting up a Home shelf says nothing about whether Search
 * may call it.
 *
 * A source switched on for search still isn't attempted while the device has
 * no network at all.
 */
export function useEnabledSearchSourceIds(): SourceId[] {
  const enabled = useSelector(selectEnabledSourcesFor('search'))
  const isOffline = useIsOffline()
  if (isOffline) return []
  return ALL_SOURCES.filter(source => enabled.includes(source.id)).map(source => source.id)
}
