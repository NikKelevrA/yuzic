import { isLocalId, makeLocalId, parseLocalId } from './LocalId';
import type { Provenance } from './Provenance';

const server1: Provenance = { origin: 'server', serverId: 'srv-1' };
const server2: Provenance = { origin: 'server', serverId: 'srv-2' };
const integration1: Provenance = { origin: 'integration', providerId: 'deezer' };

describe('makeLocalId', () => {
  it('is deterministic for the same kind, provenance and nativeId', () => {
    expect(makeLocalId('album', server1, 'abc')).toBe(makeLocalId('album', server1, 'abc'));
  });

  it('produces different ids for different servers with the same nativeId', () => {
    expect(makeLocalId('album', server1, 'abc')).not.toBe(makeLocalId('album', server2, 'abc'));
  });

  it('produces different ids for a server vs an integration with the same nativeId', () => {
    expect(makeLocalId('album', server1, 'abc')).not.toBe(makeLocalId('album', integration1, 'abc'));
  });

  it('produces different ids for different entity kinds with the same origin and nativeId', () => {
    expect(makeLocalId('album', server1, 'abc')).not.toBe(makeLocalId('song', server1, 'abc'));
  });
});

describe('parseLocalId', () => {
  it('round-trips everything makeLocalId produces, for a server origin', () => {
    const id = makeLocalId('song', server1, 'native-42');
    expect(parseLocalId(id)).toEqual({
      kind: 'song',
      provenance: server1,
      nativeId: 'native-42',
    });
  });

  it('round-trips everything makeLocalId produces, for an integration origin', () => {
    const id = makeLocalId('artist', integration1, 'native-7');
    expect(parseLocalId(id)).toEqual({
      kind: 'artist',
      provenance: integration1,
      nativeId: 'native-7',
    });
  });

  it('round-trips a nativeId that itself contains colons', () => {
    const id = makeLocalId('playlist', server1, 'a:b:c:1234');
    expect(parseLocalId(id)).toEqual({
      kind: 'playlist',
      provenance: server1,
      nativeId: 'a:b:c:1234',
    });
  });

  it('returns null for a bare server id', () => {
    expect(parseLocalId('abc-123')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseLocalId('')).toBeNull();
  });

  it('returns null for a kind that is no longer valid', () => {
    expect(parseLocalId('local:track:srv:srv-1:abc')).toBeNull();
  });

  it('returns null for a value with an empty scope', () => {
    expect(parseLocalId('local:album:srv::abc')).toBeNull();
  });

  it('returns null for a value with an empty nativeId', () => {
    expect(parseLocalId('local:album:srv:srv-1:')).toBeNull();
  });
});

describe('isLocalId', () => {
  it('agrees with parseLocalId for a value it produced', () => {
    const id = makeLocalId('album', server1, 'abc');
    expect(isLocalId(id)).toBe(parseLocalId(id) !== null);
    expect(isLocalId(id)).toBe(true);
  });

  it('agrees with parseLocalId for a value that does not parse', () => {
    const bogus = 'local:track:srv:srv-1:abc';
    expect(isLocalId(bogus)).toBe(parseLocalId(bogus) !== null);
    expect(isLocalId(bogus)).toBe(false);
  });

  it('agrees with parseLocalId for the empty string', () => {
    expect(isLocalId('')).toBe(parseLocalId('') !== null);
    expect(isLocalId('')).toBe(false);
  });
});

describe('scope encoding', () => {
  it('round-trips a scope containing a colon without shifting the native id', () => {
    const provenance = { origin: 'server', serverId: 'srv:with:colons' } as const;
    const id = makeLocalId('song', provenance, 'native:id:with:colons');

    const parsed = parseLocalId(id);
    expect(parsed).toEqual({
      kind: 'song',
      provenance: { origin: 'server', serverId: 'srv:with:colons' },
      nativeId: 'native:id:with:colons',
    });
  });

  it('keeps ordinary server and provider ids readable in the id', () => {
    const server = makeLocalId('album', { origin: 'server', serverId: 'V1StGXR8Z5' }, 'al-9');
    const integration = makeLocalId('album', { origin: 'integration', providerId: 'deezer' }, '12345');

    expect(server).toBe('local:album:srv:V1StGXR8Z5:al-9');
    expect(integration).toBe('local:album:ext:deezer:12345');
  });

  it('rejects a value whose scope is a malformed percent escape', () => {
    expect(parseLocalId('local:album:srv:%ZZ:al-9')).toBeNull();
  });
});
