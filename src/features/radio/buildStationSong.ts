import type { InternetRadioStation } from '@/providers/contracts/ServerAdapter';
import type { Song } from '@/domain/entities/Song';
import { missingCover, stationCoverSubject, type CoverSource } from '@/domain/entities/Cover';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';

/** Namespaces a station's id so it can never collide with a real track's. */
const LIVE_STREAM_ID_PREFIX = 'radio:';

/**
 * Turns a radio station into something the player can accept.
 *
 * Almost every field is a placeholder: a station has no duration, no artist
 * and no album, and saying otherwise would have the UI draw a progress bar
 * against nothing. The identity is namespaced with a `radio:` prefix so it can
 * never collide with a real track in the persisted queue or in history.
 *
 * `streamId` carries the station's own endpoint, verbatim. A live stream is
 * not `hasReissuableUrl`: the URL belongs to the station, not to the user's
 * server, and asking the server to build one from a station id produces a URL
 * for a track it does not have. That is how the resolver knows to play this
 * exactly as given rather than rebuilding it.
 */
/**
 * A station's artwork: its logo where a directory has one, the radio mark
 * where none does. Exported so the Radio list and the player draw the same
 * picture for the same station rather than each inventing a stand-in.
 */
export function stationCover(station: InternetRadioStation): CoverSource {
  return missingCover(stationCoverSubject(station.name, station.streamUrl));
}

export function stationToSong(station: InternetRadioStation, serverId: string): Song {
  const provenance = serverProvenance(serverId);
  const placeholderRef = (kind: 'artist' | 'album', name: string) => ({
    localId: makeLocalId(kind, provenance, ''),
    nativeId: '',
    externalIds: {},
    cover: { kind: 'none' as const },
    ...(kind === 'artist' ? { name } : { title: name }),
  });

  return {
    localId: makeLocalId('song', provenance, `${LIVE_STREAM_ID_PREFIX}${station.id}`),
    nativeId: `${LIVE_STREAM_ID_PREFIX}${station.id}`,
    provenance,
    externalIds: {},
    title: station.name,
    artist: placeholderRef('artist', 'Live Radio') as Song['artist'],
    album: placeholderRef('album', '') as Song['album'],
    // A gap naming the station, so the one picture rule can fill it from a
    // station directory exactly as it fills any other gap — and draws the
    // radio mark rather than the broken-image glyph when nothing has a logo.
    cover: stationCover(station),
    durationSeconds: 0,
    contentKind: 'liveStream',
    streamId: station.streamUrl,
    genres: [],
  };
}
