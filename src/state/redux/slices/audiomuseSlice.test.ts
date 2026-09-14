import reducer, { connectAudiomuse, disconnectAudiomuse, setAudiomuseAuthenticated } from './audiomuseSlice';

describe('audiomuseSlice', () => {
  it('enables AudioMuse when a connection succeeds', () => {
    const state = reducer(undefined, connectAudiomuse({ serverId: 'server-1' }));

    expect(state.byServer['server-1']).toMatchObject({
      isAuthenticated: true,
      isEnabled: true,
    });
  });

  it('disables AudioMuse when authentication is lost', () => {
    const connected = reducer(undefined, connectAudiomuse({ serverId: 'server-1' }));
    const state = reducer(connected, setAudiomuseAuthenticated({ serverId: 'server-1', value: false }));

    expect(state.byServer['server-1']).toMatchObject({
      isAuthenticated: false,
      isEnabled: false,
    });
  });

  it('clears the server URL and disables AudioMuse when disconnected', () => {
    // The API token isn't part of this slice's state any more — it lives in
    // the keystore (see credentialCache) and is cleared separately, by the
    // settings screen calling `forgetCredentials` alongside this action.
    const connected = reducer(undefined, connectAudiomuse({ serverId: 'server-1' }));
    const state = reducer(connected, disconnectAudiomuse({ serverId: 'server-1' }));

    expect(state.byServer['server-1']).toMatchObject({
      serverUrl: '',
      isAuthenticated: false,
      isEnabled: false,
    });
  });
});
