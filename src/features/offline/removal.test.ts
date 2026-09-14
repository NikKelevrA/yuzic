import type { DownloadedCollectionEntry } from './downloadStore';
import type { PersistedDownloadJob } from './localDownloadStore';
import {
  evictFromPlayerCache,
  collectionsWithoutTracks,
  jobMatchesCollectionId,
  jobMatchesDownloadId,
  jobsOutsideScope,
  orphanedTrackIds,
  trackIdsOfJobs,
  tracksInCollectionRemoval,
  tracksInScope,
  tracksWithout,
} from './removal';
import type { LocalDownloadedTrackEntry } from './restore';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';

function track(
  trackId: string,
  overrides: Partial<LocalDownloadedTrackEntry> = {}
): LocalDownloadedTrackEntry {
  return {
    trackId,
    serverId: 'server-1',
    serverType: 'navidrome',
    coverKind: 'navidrome',
    localPath: `file:///downloads/${trackId}.mp3`,
    ...overrides,
  } as LocalDownloadedTrackEntry;
}

function collection(
  id: string,
  trackIds: string[]
): DownloadedCollectionEntry {
  return { id, type: 'album', trackIds, downloadedAt: 0 };
}

/**
 * A queued track, as the store now persists it: a whole domain song.
 *
 * The job queue keys on `localId` rather than the origin's own id, because two
 * origins can each call a track `42` and a download queue holds both at once.
 */
function queued(nativeId: string, serverId = 'server-1'): Song {
  const provenance = serverProvenance(serverId);
  const ref = (kind: 'artist' | 'album', id: string, name: string) => ({
    localId: makeLocalId(kind, provenance, id),
    nativeId: id,
    externalIds: {},
    cover: { kind: 'none' } as const,
    ...(kind === 'artist' ? { name } : { title: name }),
  });

  return {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: nativeId,
    artist: ref('artist', 'artist-1', 'Artist') as Song['artist'],
    album: ref('album', 'album-1', 'Album') as Song['album'],
    cover: { kind: 'none' },
    durationSeconds: 120,
    contentKind: 'song',
    genres: [],
  };
}

/** The identity the queue stores a track under, for asserting against. */
const queuedId = (nativeId: string, serverId = 'server-1') =>
  makeLocalId('song', serverProvenance(serverId), nativeId);

function job(
  id: string,
  trackIds: string[],
  extra: Partial<PersistedDownloadJob> = {}
): PersistedDownloadJob {
  return {
    id,
    tracks: trackIds.map(trackId => queued(trackId)),
    ...extra,
  } as PersistedDownloadJob;
}

describe('tracksInScope', () => {
  it('covers every track when no scope is given', () => {
    const tracks = [track('a'), track('b', { serverId: 'server-2' })];

    expect(tracksInScope(tracks, undefined)).toHaveLength(2);
  });

  it('covers only the named server', () => {
    const tracks = [track('a'), track('b', { serverId: 'server-2' })];

    expect(tracksInScope(tracks, { serverId: 'server-1' }).map(t => t.trackId)).toEqual(['a']);
  });

  it('covers nothing when the scope resolves to no server at all', () => {
    // A scope was explicitly passed but names nothing identifiable. Matching
    // everything here would silently turn a provider clear into a clear-all.
    const tracks = [track('a'), track('b', { serverId: 'server-2' })];

    expect(tracksInScope(tracks, { serverId: null, serverType: null })).toEqual([]);
  });
});

describe('tracksInCollectionRemoval', () => {
  it('covers only the named tracks', () => {
    const tracks = [track('a'), track('b'), track('c')];

    expect(tracksInCollectionRemoval(tracks, ['a', 'c']).map(t => t.trackId)).toEqual(['a', 'c']);
  });

  it('ignores ids that are not downloaded', () => {
    expect(tracksInCollectionRemoval([track('a')], ['a', 'missing'])).toHaveLength(1);
  });

  it('narrows to the scope when one is given', () => {
    const tracks = [track('a'), track('b', { serverId: 'server-2' })];

    expect(
      tracksInCollectionRemoval(tracks, ['a', 'b'], { serverId: 'server-2' }).map(t => t.trackId)
    ).toEqual(['b']);
  });
});

describe('collectionsWithoutTracks', () => {
  it('trims removed tracks out of a collection it shares', () => {
    const collections = [collection('album-1', ['a', 'b', 'c'])];

    expect(collectionsWithoutTracks(collections, new Set(['b']))[0].trackIds).toEqual(['a', 'c']);
  });

  it('drops a collection left with nothing', () => {
    const collections = [collection('album-1', ['a'])];

    expect(collectionsWithoutTracks(collections, new Set(['a']))).toEqual([]);
  });

  it('leaves collections of other providers intact', () => {
    // The regression this guards: deciding from the scope's resolved serverId
    // dropped every collection from every provider whenever the scope could
    // not resolve one.
    const collections = [collection('album-1', ['a']), collection('album-2', ['z'])];

    const remaining = collectionsWithoutTracks(collections, new Set(['a']));

    expect(remaining.map(item => item.id)).toEqual(['album-2']);
  });

  it('is a no-op when nothing was removed', () => {
    const collections = [collection('album-1', ['a', 'b'])];

    expect(collectionsWithoutTracks(collections, new Set())).toEqual(collections);
  });
});

describe('tracksWithout', () => {
  it('removes exactly the named tracks', () => {
    const tracks = [track('a'), track('b')];

    expect(tracksWithout(tracks, new Set(['a'])).map(t => t.trackId)).toEqual(['b']);
  });
});

describe('job matching', () => {
  it('matches a download id against the job, its collection, or a track', () => {
    const target = job('job-1', ['t1'], { collectionId: 'album-1' });

    expect(jobMatchesDownloadId(target, 'job-1')).toBe(true);
    expect(jobMatchesDownloadId(target, 'album-1')).toBe(true);
    expect(jobMatchesDownloadId(target, queuedId('t1'))).toBe(true);
    expect(jobMatchesDownloadId(target, 'other')).toBe(false);
  });

  it('matches a collection id against the job or its collection, never a track', () => {
    // Cancelling a collection must not be triggered by a track that happens to
    // share the id.
    const target = job('job-1', ['t1'], { collectionId: 'album-1' });

    expect(jobMatchesCollectionId(target, 'album-1')).toBe(true);
    expect(jobMatchesCollectionId(target, 'job-1')).toBe(true);
    expect(jobMatchesCollectionId(target, queuedId('t1'))).toBe(false);
  });

  it('collects the track ids of the given jobs', () => {
    expect(trackIdsOfJobs([job('j1', ['a', 'b']), job('j2', ['c'])]))
      .toEqual([queuedId('a'), queuedId('b'), queuedId('c')]);
  });
});

describe('jobsOutsideScope', () => {
  it('keeps a job that still has work for another provider', () => {
    // Origin now comes from each track's provenance rather than a duplicated
    // sourceServerId field, so a job spanning two servers is expressed by
    // queueing tracks whose provenance differs.
    const mixed: PersistedDownloadJob = {
      ...job('job-1', []),
      tracks: [queued('a', 'server-1'), queued('b', 'server-2')],
    };

    expect(jobsOutsideScope([mixed], { serverId: 'server-1' })).toHaveLength(1);
  });

  it('drops a job entirely inside the cleared scope', () => {
    const scoped: PersistedDownloadJob = {
      ...job('job-1', []),
      tracks: [queued('a', 'server-1')],
    };

    expect(jobsOutsideScope([scoped], { serverId: 'server-1' })).toEqual([]);
  });
});

describe('orphanedTrackIds', () => {
  it('cancels a track no remaining job still wants', () => {
    expect(orphanedTrackIds([queuedId('a'), queuedId('b')], [job('j1', ['b'])]))
      .toEqual([queuedId('a')]);
  });

  it('leaves a track another job still needs alone', () => {
    // The same track can belong to two collections; removing one must not
    // cancel the download the other still depends on.
    expect(orphanedTrackIds([queuedId('a')], [job('j1', ['a'])])).toEqual([]);
  });

  it('cancels everything when the queue is empty', () => {
    expect(orphanedTrackIds(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('evictFromPlayerCache', () => {
  it('drops every deleted track from the engine cache', () => {
    // The whole point: the engine has had `evict` since 1.0.0 and nothing
    // called it, so a deleted download kept playing from cache and the space
    // was never reclaimed.
    const evicted: string[] = [];

    evictFromPlayerCache(
      [{ trackId: 'local:song:srv:s1:1' }, { trackId: 'local:song:srv:s1:2' }],
      id => { evicted.push(id); }
    );

    expect(evicted).toEqual(['local:song:srv:s1:1', 'local:song:srv:s1:2']);
  });

  it('keys the eviction by the id the engine was given', () => {
    // `trackId` is the song's localId, which is what went to the player as
    // `mediaId`. Evicting a nativeId would silently clear nothing — or, worse,
    // another origin's track that happens to share the number.
    const evicted: string[] = [];

    evictFromPlayerCache([{ trackId: 'local:song:srv:s1:42' }], id => { evicted.push(id); });

    expect(evicted).toEqual(['local:song:srv:s1:42']);
  });

  it('carries on when one track cannot be evicted', () => {
    // One failure must not strand the rest, and none of them may fail the
    // deletion the user actually asked for.
    const evicted: string[] = [];

    expect(() => evictFromPlayerCache(
      [{ trackId: 'a' }, { trackId: 'b' }, { trackId: 'c' }],
      id => {
        if (id === 'b') throw new Error('engine not set up');
        evicted.push(id);
      }
    )).not.toThrow();

    expect(evicted).toEqual(['a', 'c']);
  });
});
