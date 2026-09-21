import { serverProvenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';
import { JELLYFIN_BRAND } from './brand';
import { mapPlaylist } from './mapPlaylist';
import type { MediaBrowserItem } from './types';

const provenance = serverProvenance('srv-1');

/** A `/Users/{userId}/Items?IncludeItemTypes=Playlist` response entry. */
const fullDto: MediaBrowserItem = {
  Id: 'pl-1',
  Name: 'Road Trip',
  Type: 'Playlist',
  DateCreated: '2023-01-01T00:00:00.000Z',
  DateLastMediaAdded: '2024-06-01T00:00:00.000Z',
};

describe('mapPlaylist', () => {
  it('produces a complete playlist from a full DTO', () => {
    const songIds = [makeLocalId('song', provenance, 'tr-1')];
    const playlist = mapPlaylist(fullDto, { provenance, brand: JELLYFIN_BRAND, songIds });

    expect(playlist).toMatchObject({
      localId: 'local:playlist:srv:srv-1:pl-1',
      nativeId: 'pl-1',
      provenance: { origin: 'server', serverId: 'srv-1' },
      title: 'Road Trip',
      isOwned: true,
      songIds,
    });
    expect(playlist.createdAt).toBe(Date.parse('2023-01-01T00:00:00.000Z'));
    expect(playlist.updatedAt).toBe(Date.parse('2024-06-01T00:00:00.000Z'));
  });

  it('derives identity from the provenance it is given, not from a client', () => {
    const other = mapPlaylist(fullDto, { provenance: serverProvenance('srv-2'), brand: JELLYFIN_BRAND });
    expect(other.localId).toBe('local:playlist:srv:srv-2:pl-1');
  });

  it('resolves a Jellyfin cover from the playlist item id', () => {
    const playlist = mapPlaylist(fullDto, { provenance, brand: JELLYFIN_BRAND });
    expect(playlist.cover).toEqual({ kind: 'jellyfin', itemId: 'pl-1' });
  });

  it('produces a valid playlist from an all-but-empty DTO rather than throwing', () => {
    const playlist = mapPlaylist({ Id: 'pl-2' }, { provenance, brand: JELLYFIN_BRAND });

    expect(playlist).toMatchObject({
      localId: 'local:playlist:srv:srv-1:pl-2',
      title: 'Untitled playlist',
      isOwned: true,
      songIds: [],
    });
    expect(playlist.createdAt).toBeUndefined();
    expect(playlist.updatedAt).toBeUndefined();
  });
});
