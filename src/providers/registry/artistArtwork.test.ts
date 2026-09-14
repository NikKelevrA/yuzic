import type { Artist } from '@/domain/entities/Artist';

const mockResolve = jest.fn();
jest.mock('@/providers/integration/deezer', () => ({
  resolveDeezerArtistByName: (name: string) => mockResolve(name),
}));

import { withArtistArtwork } from './artistArtwork';

const artist = (name: string, cover: Artist['cover'] = { kind: 'none' }): Artist => ({
  localId: `local:artist:ext:listenbrainz:${name}` as Artist['localId'],
  nativeId: name,
  provenance: { origin: 'integration', providerId: 'listenbrainz' },
  externalIds: {},
  libraryState: 'external',
  name,
  cover,
  tags: [],
  albumIds: [],
});

const photo = (name: string): Artist['cover'] => ({ kind: 'url', url: `https://img.example/${encodeURIComponent(name)}.jpg` });

describe('withArtistArtwork', () => {
  beforeEach(() => {
    mockResolve.mockReset();
  });

  it('gives each artist without a picture the catalogue photo for the same name, in order', async () => {
    mockResolve.mockImplementation(async (name: string) => artist(name, photo(name)));

    const result = await withArtistArtwork([artist('Bibio'), artist('Tycho')]);

    expect(result.map(a => a.name)).toEqual(['Bibio', 'Tycho']);
    expect(result.map(a => a.cover)).toEqual([photo('Bibio'), photo('Tycho')]);
  });

  it('keeps everything else about the artist, identity included', async () => {
    mockResolve.mockImplementation(async (name: string) => ({ ...artist(name, photo(name)), localId: 'local:artist:other' }));

    const [result] = await withArtistArtwork([artist('Bibio')]);

    expect(result.localId).toBe('local:artist:ext:listenbrainz:Bibio');
    expect(result.provenance).toEqual({ origin: 'integration', providerId: 'listenbrainz' });
  });

  it('matches names regardless of case and surrounding space', async () => {
    mockResolve.mockImplementation(async () => artist('BIBIO ', photo('Bibio')));

    const [result] = await withArtistArtwork([artist('bibio')]);

    expect(result.cover).toEqual(photo('Bibio'));
  });

  it("leaves the placeholder when the lookup finds a different artist", async () => {
    mockResolve.mockImplementation(async () => artist('Bibio Collective', photo('Bibio Collective')));

    const [result] = await withArtistArtwork([artist('Bibio')]);

    expect(result.cover).toEqual({ kind: 'none' });
  });

  it('does not look up an artist that already has a picture', async () => {
    const [result] = await withArtistArtwork([artist('Bibio', photo('own'))]);

    expect(mockResolve).not.toHaveBeenCalled();
    expect(result.cover).toEqual(photo('own'));
  });

  it('keeps the rest of the list when one lookup fails or finds nobody', async () => {
    mockResolve.mockImplementation(async (name: string) => {
      if (name === 'Broken') throw new Error('Deezer 500');
      if (name === 'Nobody') return null;
      return artist(name, photo(name));
    });

    const result = await withArtistArtwork([artist('Broken'), artist('Nobody'), artist('Tycho')]);

    expect(result.map(a => a.cover)).toEqual([{ kind: 'none' }, { kind: 'none' }, photo('Tycho')]);
  });

  it('never has more than four lookups out at once', async () => {
    let inFlight = 0;
    let peak = 0;
    mockResolve.mockImplementation(async (name: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight--;
      return artist(name, photo(name));
    });

    const names = Array.from({ length: 10 }, (_, i) => `Artist ${i}`);
    const result = await withArtistArtwork(names.map(name => artist(name)));

    expect(peak).toBeLessThanOrEqual(4);
    expect(mockResolve).toHaveBeenCalledTimes(10);
    expect(result.every(a => a.cover.kind === 'url')).toBe(true);
  });
});
