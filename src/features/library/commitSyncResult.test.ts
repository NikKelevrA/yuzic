import { commitSyncResult } from './commitSyncResult';
import type { CatalogSyncResult } from './catalogSync';

const result = (over: Partial<CatalogSyncResult> = {}): CatalogSyncResult => ({
  failed: [],
  hasData: true,
  genres: ['Rock'],
  albumStats: [{ id: 'al1', playCount: 3, lastPlayedAt: 1 }],
  songStats: [{ id: 's1', playCount: 5, lastPlayedAt: 1 }],
  ...over,
});

/**
 * A sync killed right after it finished used to leave "last synced" on disk
 * without the play stats, and the relaunch trusted the timestamp and skipped
 * the sync that would have restored them (found on Android: Quick picks and
 * Recents empty after a first sync was interrupted).
 */
describe('commitSyncResult', () => {
  it('writes the stats, waits for them to reach disk, and only then records the sync', async () => {
    const log: string[] = [];
    let releaseFlush: () => void = () => {};
    const flushed = new Promise<void>(resolve => { releaseFlush = resolve; });

    const done = commitSyncResult({
      dispatch: action => { log.push(action.type); },
      flush: () => { log.push('flush'); return flushed; },
      serverId: 'srv',
      result: result(),
      now: () => 42,
    });

    await Promise.resolve();
    expect(log).toEqual(['stats/setServerAlbumStats', 'stats/setServerSongStats', 'flush']);

    releaseFlush();
    await expect(done).resolves.toBe(42);
    expect(log[log.length - 1]).toBe('settingsSync/setLastSyncedAt');
  });

  it('records no sync time when the sync found nothing worth showing', async () => {
    const log: string[] = [];
    await commitSyncResult({
      dispatch: action => { log.push(action.type); },
      flush: async () => { log.push('flush'); },
      serverId: 'srv',
      result: result({ hasData: false, albumStats: [], songStats: [] }),
    });
    expect(log).toEqual([]);
  });

  it('does not dispatch an empty stats list over locally tracked counts', async () => {
    const log: string[] = [];
    await commitSyncResult({
      dispatch: action => { log.push(action.type); },
      flush: async () => {},
      serverId: 'srv',
      result: result({ albumStats: [], songStats: [] }),
    });
    expect(log).toEqual(['settingsSync/setLastSyncedAt']);
  });
});
