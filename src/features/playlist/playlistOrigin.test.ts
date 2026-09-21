import { resolvePlaylistOrigin } from './playlistOrigin';
import type { Playlist } from '@/domain/entities/Playlist';
import { serverProvenance, integrationProvenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';

function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  const provenance = overrides.provenance ?? serverProvenance('srv-1');
  const nativeId = overrides.nativeId ?? 'p1';
  return {
    localId: makeLocalId('playlist', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: {},
    title: 'Road Trip',
    cover: { kind: 'none' },
    isOwned: true,
    songIds: [],
    ...overrides,
  };
}

describe('resolvePlaylistOrigin', () => {
  it('is owned for a server playlist the user owns', () => {
    expect(resolvePlaylistOrigin(makePlaylist({ isOwned: true }))).toEqual({ kind: 'owned' });
  });

  it('is shared for a server playlist visible but not owned by the user', () => {
    expect(resolvePlaylistOrigin(makePlaylist({ isOwned: false }))).toEqual({ kind: 'shared' });
  });

  it('is external for a playlist from an integration, regardless of isOwned', () => {
    const provenance = integrationProvenance('musicbrainz');
    expect(resolvePlaylistOrigin(makePlaylist({ provenance, isOwned: true }))).toEqual({
      kind: 'external',
      providerId: 'musicbrainz',
    });
  });
});
