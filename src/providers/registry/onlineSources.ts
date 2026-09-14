import type { UnknownAction } from '@reduxjs/toolkit';
import type { RootState } from '@/state/redux/store';
import {
  selectDeezerDiscoveryEnabled,
  selectListenbrainzDiscoveryEnabled,
  setDeezerDiscoveryEnabled,
  setListenbrainzDiscoveryEnabled,
} from '@/features/settings/home/state';
import {
  selectLastfmEnabled,
  selectMetadataArtworkSourceEnabled,
  setLastfmEnabled,
  setMetadataArtworkSourceEnabled,
} from '@/features/settings/metadata/state';
import { selectSearchSourceEnabled, setSearchSourceEnabled } from '@/features/settings/search/state';

export type OnlineSourceId = 'deezer' | 'listenbrainz' | 'lastfm' | 'musicbrainz' | 'coverartarchive';

/** One way Yuzic uses an online source, with the setting behind it. */
type OnlineSourceUse = {
  labelKey: string;
  subtextKey: string;
  isOn: (state: RootState) => boolean;
  set: (enabled: boolean) => UnknownAction;
};

type OnlineSource = {
  id: OnlineSourceId;
  nameKey: string;
  /** What this source is sent, in one line. */
  sendsKey: string;
  uses: readonly OnlineSourceUse[];
};

const use = (key: string, isOn: OnlineSourceUse['isOn'], set: OnlineSourceUse['set']): OnlineSourceUse => ({
  labelKey: `settings.sources.${key}`,
  subtextKey: `settings.sources.${key}Subtext`,
  isOn,
  set,
});

const source = (id: OnlineSourceId, uses: OnlineSourceUse[]): OnlineSource => ({
  id,
  nameKey: `settings.sources.${id}.name`,
  sendsKey: `settings.sources.${id}.sends`,
  uses,
});

/**
 * Every keyless outside service Yuzic may ask about your music, grouped by
 * service, each use with the one setting its features read.
 *
 * Declared here, with the other provider declarations, so Online sources can
 * draw them without naming any — the same way Connections draws
 * `MANAGED_INTEGRATIONS`. Account integrations (ListenBrainz scrobbling,
 * AudioMuse) stay in Connections; this is only what may be looked up.
 */
export const ONLINE_SOURCES: readonly OnlineSource[] = [
  source('deezer', [
    use('deezer.pages', selectDeezerDiscoveryEnabled, setDeezerDiscoveryEnabled),
    use('deezer.search', selectSearchSourceEnabled('deezer'), enabled => setSearchSourceEnabled({ sourceId: 'deezer', enabled })),
    use('deezer.artwork', selectMetadataArtworkSourceEnabled('deezer'), enabled => setMetadataArtworkSourceEnabled({ sourceId: 'deezer', enabled })),
  ]),
  source('listenbrainz', [
    use('listenbrainz.discovery', selectListenbrainzDiscoveryEnabled, setListenbrainzDiscoveryEnabled),
  ]),
  source('lastfm', [
    use('lastfm.artistInfo', selectLastfmEnabled, setLastfmEnabled),
  ]),
  source('musicbrainz', [
    use('musicbrainz.search', selectSearchSourceEnabled('musicbrainz'), enabled => setSearchSourceEnabled({ sourceId: 'musicbrainz', enabled })),
  ]),
  source('coverartarchive', [
    use('coverartarchive.covers', selectMetadataArtworkSourceEnabled('coverartarchive'), enabled => setMetadataArtworkSourceEnabled({ sourceId: 'coverartarchive', enabled })),
  ]),
];
