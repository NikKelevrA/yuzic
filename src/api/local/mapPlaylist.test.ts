import { serverProvenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';
import { mapPlaylist } from './mapPlaylist';
import type { LocalPlaylist } from './store';

const provenance = serverProvenance('local');

const fullDto: LocalPlaylist = {
  id: 'local:playlist:1',
  title: 'Road Trip',
  trackIds: ['local:1', 'local:2'],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_710_000_000_000,
};

describe('mapPlaylist', () => {
  it('produces a complete playlist from a full DTO', () => {
    const songIds = [makeLocalId('song', provenance, 'local:1'), makeLocalId('song', provenance, 'local:2')];
    const playlist = mapPlaylist(fullDto, { provenance, songIds });

    expect(playlist).toMatchObject({
      localId: 'local:playlist:srv:local:local:playlist:1',
      nativeId: 'local:playlist:1',
      provenance: { origin: 'server', serverId: 'local' },
      libraryState: 'in-library',
      title: 'Road Trip',
      isOwned: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_710_000_000_000,
      songIds,
    });
    expect(playlist.cover).toEqual({ kind: 'none' });
  });

  it('derives identity from the provenance it is given, not from a client', () => {
    const other = mapPlaylist(fullDto, { provenance: serverProvenance('local-2') });
    expect(other.localId).toBe('local:playlist:srv:local-2:local:playlist:1');
  });

  it('produces a valid playlist from a DTO with no tracks rather than throwing', () => {
    const empty: LocalPlaylist = { id: 'local:playlist:2', title: 'Empty', trackIds: [], createdAt: 0, updatedAt: 0 };
    const playlist = mapPlaylist(empty, { provenance });

    expect(playlist).toMatchObject({
      localId: 'local:playlist:srv:local:local:playlist:2',
      title: 'Empty',
      isOwned: true,
      songIds: [],
    });
  });
});
