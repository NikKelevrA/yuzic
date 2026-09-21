import {
  _clearCredentialCache,
  forgetCredentials,
  getCredentials,
  hydrateAll,
  hydrateCredentials,
  setCredential,
} from './credentialCache';
import type { CredentialScope } from './credentials';

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { mockStore.set(key, value); },
  deleteItemAsync: async (key: string) => { mockStore.delete(key); },
  AFTER_FIRST_UNLOCK: 'afterFirstUnlock',
}));

const server: CredentialScope = { kind: 'server', serverId: 'srv-1' };
const other: CredentialScope = { kind: 'server', serverId: 'srv-2' };
const integration: CredentialScope = { kind: 'integration', providerId: 'listenbrainz' };

beforeEach(() => {
  mockStore.clear();
  _clearCredentialCache();
});

describe('getCredentials', () => {
  it('is empty before hydration, which reads the same as not signed in', async () => {
    // A real state during the first frames after launch. Callers already
    // handle it: the adapter fails its ping, the app shows the disconnected
    // path, and re-renders once hydration lands.
    await setCredential(server, 'token', 'a-token');
    _clearCredentialCache();

    expect(getCredentials(server)).toEqual({});

    await hydrateCredentials(server);
    expect(getCredentials(server).token).toBe('a-token');
  });

  it('keeps scopes apart', async () => {
    await setCredential(server, 'token', 'first');
    await setCredential(other, 'token', 'second');

    expect(getCredentials(server).token).toBe('first');
    expect(getCredentials(other).token).toBe('second');
  });

  it('omits fields that were never stored', async () => {
    await setCredential(integration, 'token', 'only-a-token');

    expect('apiKey' in getCredentials(integration)).toBe(false);
  });
});

describe('setCredential', () => {
  it('updates the keystore and the working copy together, so they cannot diverge', async () => {
    await setCredential(server, 'token', 'v1');
    expect(getCredentials(server).token).toBe('v1');

    await setCredential(server, 'token', 'v2');
    expect(getCredentials(server).token).toBe('v2');

    // Proven against the store itself, not just the cache.
    _clearCredentialCache();
    await hydrateCredentials(server);
    expect(getCredentials(server).token).toBe('v2');
  });

  it('removes a field when set to empty, in both places', async () => {
    await setCredential(server, 'token', 'v1');
    await setCredential(server, 'token', '');

    expect('token' in getCredentials(server)).toBe(false);
    _clearCredentialCache();
    await hydrateCredentials(server);
    expect('token' in getCredentials(server)).toBe(false);
  });
});

describe('forgetCredentials', () => {
  it('clears a scope from the keystore and memory, leaving others intact', async () => {
    await setCredential(server, 'token', 'gone');
    await setCredential(other, 'token', 'kept');

    await forgetCredentials(server);

    expect(getCredentials(server)).toEqual({});
    expect(getCredentials(other).token).toBe('kept');
    _clearCredentialCache();
    await hydrateAll([server, other]);
    expect(getCredentials(server)).toEqual({});
    expect(getCredentials(other).token).toBe('kept');
  });
});

describe('hydrateAll', () => {
  it('loads every scope it is given', async () => {
    await setCredential(server, 'password', 'p');
    await setCredential(integration, 'token', 't');
    _clearCredentialCache();

    await hydrateAll([server, integration]);

    expect(getCredentials(server).password).toBe('p');
    expect(getCredentials(integration).token).toBe('t');
  });
});
