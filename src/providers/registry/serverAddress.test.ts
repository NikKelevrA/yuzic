import { checkServerAddress } from './serverAddress';
import { parseServerAddress } from './sources';

const mockAnswers = jest.fn();
jest.mock('./musicbrainz', () => ({
  musicbrainzServerAnswers: (...args: unknown[]) => mockAnswers(...args),
}));

describe('parseServerAddress', () => {
  it.each([
    ['http://192.168.1.10:5000', 'http://192.168.1.10:5000'],
    ['  https://mb.example.com/  ', 'https://mb.example.com'],
    ['HTTP://nas:5000///', 'HTTP://nas:5000'],
    ['http://host/musicbrainz', 'http://host/musicbrainz'],
    ['http://host:5000/ws/2', 'http://host:5000/ws/2'],
  ])('accepts %j', (input, expected) => {
    expect(parseServerAddress(input)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['nas:5000'],
    ['192.168.1.10'],
    ['ftp://nas:5000'],
    ['http://'],
    ['http://nas :5000'],
    ['not an address'],
    ['http://nas:5000?x=1'],
    // A dot fat-fingered into a colon: shaped enough to have slipped past the
    // old "anything but a slash" check, but not a real host[:port].
    ['http://100:122.20.1'],
    ['http://100:122.20.1:5001'],
    ['http://nas:port'],
    ['http://nas:99999'],
    ['http://nas::5000'],
  ])('rejects %j', input => {
    expect(parseServerAddress(input)).toBeNull();
  });
});

describe('checkServerAddress', () => {
  beforeEach(() => mockAnswers.mockReset());

  it('says an address that is not a web address is invalid, without asking the network', async () => {
    await expect(checkServerAddress('musicbrainz', 'nas:5000')).resolves.toEqual({ ok: false, reason: 'invalid' });
    expect(mockAnswers).not.toHaveBeenCalled();
  });

  it('says a server that does not answer is unreachable', async () => {
    mockAnswers.mockResolvedValue(false);

    await expect(checkServerAddress('musicbrainz', 'http://nas:5000')).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('accepts a server that answers, and hands back the tidied address that was asked', async () => {
    mockAnswers.mockResolvedValue(true);

    await expect(checkServerAddress('musicbrainz', ' http://nas:5000/ ')).resolves.toEqual({
      ok: true,
      address: 'http://nas:5000',
    });
    expect(mockAnswers).toHaveBeenCalledWith('http://nas:5000');
  });

  it('accepts a well-formed address for a source with nothing to ask it', async () => {
    await expect(checkServerAddress('deezer', 'http://nas:5000')).resolves.toEqual({
      ok: true,
      address: 'http://nas:5000',
    });
  });
});
