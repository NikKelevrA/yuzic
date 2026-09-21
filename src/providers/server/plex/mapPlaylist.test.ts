import { serverProvenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';
import { mapPlaylist } from './mapPlaylist';
import type { PlexMetadata } from './types';

const provenance = serverProvenance('srv-1');

/** A `/playlists?playlistType=audio` response entry. */
const fullDto: PlexMetadata = {
  ratingKey: 900,
  type: 'playlist',
  title: 'Road Trip',
  thumb: '/library/metadata/900/thumb/1',
  addedAt: 1_672_531_200,
  updatedAt: 1_717_200_000,
  leafCount: 12,
};

describe('mapPlaylist', () => {
  it('produces a complete playlist from a full DTO', () => {
    const songIds = [makeLocalId('song', provenance, 'tr-1')];
    const playlist = mapPlaylist(fullDto, { provenance, songIds });

    expect(playlist).toMatchObject({
      localId: 'local:playlist:srv:srv-1:900',
      nativeId: '900',
      provenance: { origin: 'server', serverId: 'srv-1' },
      title: 'Road Trip',
      isOwned: true,
      songIds,
    });
    expect(playlist.createdAt).toBe(1_672_531_200_000);
    expect(playlist.updatedAt).toBe(1_717_200_000_000);
  });

  it('falls back to addedAt for updatedAt when Plex reports no updatedAt', () => {
    const playlist = mapPlaylist({ ...fullDto, updatedAt: undefined }, { provenance });
    expect(playlist.updatedAt).toBe(playlist.createdAt);
  });

  it('derives identity from the provenance it is given, not from a client', () => {
    const other = mapPlaylist(fullDto, { provenance: serverProvenance('srv-2') });
    expect(other.localId).toBe('local:playlist:srv:srv-2:900');
  });

  it('produces a valid playlist from an all-but-empty DTO rather than throwing', () => {
    const playlist = mapPlaylist({ ratingKey: 1 }, { provenance });

    expect(playlist).toMatchObject({
      localId: 'local:playlist:srv:srv-1:1',
      title: 'Untitled playlist',
      isOwned: true,
      songIds: [],
    });
    expect(playlist.createdAt).toBeUndefined();
    expect(playlist.updatedAt).toBeUndefined();
    expect(playlist.cover).toEqual({ kind: 'none' });
  });
});
