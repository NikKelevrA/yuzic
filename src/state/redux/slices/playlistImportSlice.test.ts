import reducer, {
  connectPlaylistImport,
  disconnectPlaylistImport,
  setPlaylistImportAuthenticated,
  recordPlaylistImportAttempts,
} from './playlistImportSlice';

describe('playlistImportSlice', () => {
  it('enables playlist import when a connection succeeds', () => {
    const state = reducer(undefined, connectPlaylistImport({ serverId: 'server-1' }));

    expect(state.byServer['server-1']).toMatchObject({
      isAuthenticated: true,
      isEnabled: true,
    });
  });

  it('disables playlist import when authentication is lost', () => {
    const connected = reducer(undefined, connectPlaylistImport({ serverId: 'server-1' }));
    const state = reducer(connected, setPlaylistImportAuthenticated({ serverId: 'server-1', value: false }));

    expect(state.byServer['server-1']).toMatchObject({
      isAuthenticated: false,
      isEnabled: false,
    });
  });

  it('clears the server URL and attempt history when disconnected', () => {
    const connected = reducer(undefined, connectPlaylistImport({ serverId: 'server-1' }));
    const withAttempts = reducer(connected, recordPlaylistImportAttempts({
      serverId: 'server-1',
      keys: ['playlist-1:track-1'],
      at: 1_000,
      retentionMs: 10_000,
    }));
    const state = reducer(withAttempts, disconnectPlaylistImport({ serverId: 'server-1' }));

    expect(state.byServer['server-1']).toMatchObject({
      serverUrl: '',
      isAuthenticated: false,
      isEnabled: false,
      attempted: {},
    });
  });

  describe('recordPlaylistImportAttempts', () => {
    it('records a fresh attempt', () => {
      const state = reducer(undefined, recordPlaylistImportAttempts({
        serverId: 'server-1',
        keys: ['playlist-1:track-1'],
        at: 1_000,
        retentionMs: 10_000,
      }));

      expect(state.byServer['server-1'].attempted).toEqual({ 'playlist-1:track-1': 1_000 });
    });

    it('prunes entries older than retentionMs on the same write', () => {
      const first = reducer(undefined, recordPlaylistImportAttempts({
        serverId: 'server-1',
        keys: ['playlist-1:old-track'],
        at: 1_000,
        retentionMs: 10_000,
      }));

      // 11_000ms later — past the 10_000ms retention window given at the
      // first write, so the old entry drops out even though this write
      // touches a different key entirely.
      const state = reducer(first, recordPlaylistImportAttempts({
        serverId: 'server-1',
        keys: ['playlist-1:new-track'],
        at: 12_000,
        retentionMs: 10_000,
      }));

      expect(state.byServer['server-1'].attempted).toEqual({ 'playlist-1:new-track': 12_000 });
    });

    it('keeps a still-fresh entry while adding a new one', () => {
      const first = reducer(undefined, recordPlaylistImportAttempts({
        serverId: 'server-1',
        keys: ['playlist-1:track-a'],
        at: 1_000,
        retentionMs: 10_000,
      }));

      const state = reducer(first, recordPlaylistImportAttempts({
        serverId: 'server-1',
        keys: ['playlist-1:track-b'],
        at: 2_000,
        retentionMs: 10_000,
      }));

      expect(state.byServer['server-1'].attempted).toEqual({
        'playlist-1:track-a': 1_000,
        'playlist-1:track-b': 2_000,
      });
    });
  });
});
