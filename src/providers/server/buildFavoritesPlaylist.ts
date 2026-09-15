/**
 * The synthetic "Favorites" playlist.
 *
 * No server has a single endpoint for this — only star/unstar and a starred
 * listing — so it is assembled on the device rather than fetched. It still
 * gets a real identity built from `FAVORITES_ID` and the same provenance,
 * library-state and ownership contract every other playlist carries, so it can
 * be told apart from a server playlist by something better than a magic
 * string comparison.
 *
 * Shared by every adapter that can list starred songs: each of them had its
 * own copy of this, which is three places for the cover, the title key, or the
 * identity scheme to drift apart.
 */
import { FAVORITES_ID } from '@/constants/favorites';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import i18n from '@/i18n';

export function buildFavoritesPlaylist(songs: Song[], provenance: Provenance): Playlist {
  return {
    localId: makeLocalId('playlist', provenance, FAVORITES_ID),
    nativeId: FAVORITES_ID,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: i18n.t('playlist.favoritesTitle'),
    cover: { kind: 'special', name: 'heart' },
    isOwned: true,
    songIds: songs.map(song => song.localId),
  };
}
