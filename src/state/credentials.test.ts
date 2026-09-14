import {
  credentialKey,
  deleteAllCredentials,
  readCredential,
  readCredentials,
  writeCredential,
  type CredentialScope,
} from './credentials';

// `mock`-prefixed so jest's hoisting of the factory above these declarations
// is allowed to reference them.
const mockGetItemAsync = jest.fn<Promise<string | null>, [string]>();
const mockSetItemAsync = jest.fn<Promise<void>, [string, string, unknown]>();
const mockDeleteItemAsync = jest.fn<Promise<void>, [string]>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: [string]) => mockGetItemAsync(...args),
  setItemAsync: (...args: [string, string, unknown]) => mockSetItemAsync(...args),
  deleteItemAsync: (...args: [string]) => mockDeleteItemAsync(...args),
  AFTER_FIRST_UNLOCK: 'afterFirstUnlock',
}));

const server: CredentialScope = { kind: 'server', serverId: 'V1StGXR8Z5' };
const integration: CredentialScope = { kind: 'integration', providerId: 'listenbrainz' };

beforeEach(() => {
  mockGetItemAsync.mockReset().mockResolvedValue(null);
  mockSetItemAsync.mockReset().mockResolvedValue(undefined);
  mockDeleteItemAsync.mockReset().mockResolvedValue(undefined);
});

describe('credentialKey', () => {
  it('keeps a server and an integration with the same id apart', () => {
    expect(credentialKey({ kind: 'server', serverId: 'x' }, 'token'))
      .not.toBe(credentialKey({ kind: 'integration', providerId: 'x' }, 'token'));
  });

  it('keeps two fields of the same scope apart', () => {
    expect(credentialKey(server, 'password')).not.toBe(credentialKey(server, 'apiKey'));
  });

  it('encodes characters the keystore does not accept, so ids cannot collide', () => {
    // A key admitting only [A-Za-z0-9._-] would otherwise map `a/b` and `a.b`
    // onto neighbouring keys, and one scope could read another's secret.
    const slash = credentialKey({ kind: 'server', serverId: 'a/b' }, 'token');
    const dot = credentialKey({ kind: 'server', serverId: 'a.b' }, 'token');

    expect(slash).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(slash).not.toBe(dot);
  });
});

describe('writeCredential', () => {
  it('stores under the scope key, readable after a reboot but before unlock', () => {
    // Background playback resuming after a restart needs the token before the
    // user has unlocked; WHEN_UNLOCKED would deny it.
    void writeCredential(server, 'token', 'a-value');

    expect(mockSetItemAsync).toHaveBeenCalledWith(
      credentialKey(server, 'token'),
      'a-value',
      expect.objectContaining({ keychainAccessible: 'afterFirstUnlock' })
    );
  });

  it('deletes rather than storing an empty value', async () => {
    // A blank stored secret reads back as "present but wrong", which fails
    // authentication in a way that looks like a server problem.
    await writeCredential(server, 'token', '');

    expect(mockSetItemAsync).not.toHaveBeenCalled();
    expect(mockDeleteItemAsync).toHaveBeenCalledWith(credentialKey(server, 'token'));
  });
});

describe('readCredential', () => {
  it('returns null when the keystore is unavailable, rather than throwing', async () => {
    // A locked or still-booting device is a real runtime state; the caller
    // treats it exactly as "not signed in" and asks again.
    mockGetItemAsync.mockRejectedValue(new Error('keystore locked'));

    await expect(readCredential(server, 'token')).resolves.toBeNull();
  });
});

describe('readCredentials', () => {
  it('omits fields that were never stored rather than returning empty strings', async () => {
    mockGetItemAsync.mockImplementation(async key =>
      key === credentialKey(server, 'apiKey') ? 'stored' : null);

    const found = await readCredentials(server, ['apiKey', 'password']);

    expect(found).toEqual({ apiKey: 'stored' });
    expect('password' in found).toBe(false);
  });
});

describe('deleteAllCredentials', () => {
  it('clears every declared field, since the keystore cannot scan by prefix', async () => {
    await deleteAllCredentials(integration);

    const cleared = mockDeleteItemAsync.mock.calls.map(([key]) => key);
    expect(cleared).toEqual(expect.arrayContaining([
      credentialKey(integration, 'password'),
      credentialKey(integration, 'apiKey'),
      credentialKey(integration, 'token'),
      credentialKey(integration, 'sessionKey'),
      credentialKey(integration, 'clientCertificate'),
      credentialKey(integration, 'clientCertificatePassword'),
    ]));
  });
});
