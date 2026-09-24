/**
 * MusicBrainz as an integration provider.
 *
 * Keyless public API, same as Deezer — a plain declaration, no factory. Every
 * capability calls into the existing `src/providers/integration/musicbrainz`
 * functions and
 * mappers, reusing the exact calls `src/features/sources/registry.ts`'s
 * `musicbrainzSource` already made for the same job.
 */
import * as mb from '@/providers/integration/musicbrainz';
import type { MusicbrainzClient } from '@/providers/integration/musicbrainz';
import { mapAlbum as mapMbAlbum } from '@/providers/integration/musicbrainz/mapAlbum';
import { mapArtist as mapMbArtist } from '@/providers/integration/musicbrainz/mapArtist';
import { mapRecordingSearchHit, mapSong as mapMbSong } from '@/providers/integration/musicbrainz/mapSong';
import { sourceColor } from '@/constants/design';
import { integrationProvenance } from '@/domain/identity/Provenance';
import { selectSourceFallbackUrls, selectSourceServerUrls } from '@/features/settings/sources/state';
import store from '@/state/redux/store';
import type { IntegrationProvider } from '../contracts/Provider';

const MB_PROVENANCE = integrationProvenance('musicbrainz');

/**
 * Many distinct MusicBrainz artist/album entries can genuinely name the same
 * real-world artist (unmerged duplicates, or artists who really do share a
 * name) — `disambiguation` labels this, it doesn't rank or collapse it. A
 * search result list can't fix MusicBrainz's own data, so it settles for
 * showing only the first few of whichever catalogue order it got (a
 * self-hosted server is expected to rank these by popularity, putting the
 * one you meant first) rather than a wall of same-named rows.
 *
 * That's the right call against the shared public server, which does no
 * ranking of its own. A server of your own is trusted differently: you
 * pointed at it on purpose, and one that reranks by popularity (the
 * documented expectation above) has already done the work of putting the
 * right entry first, so the same near-duplicate risk that justifies a tight
 * cap on the public server is exactly what a self-hosted one is for solving.
 * The limits below widen accordingly once a server of your own is set.
 */
const PUBLIC_MAX_ARTISTS = 3;
const PUBLIC_MAX_ALBUMS = 3;
/** Songs get no such cap on the useful side — a search is more useful with a
 *  long, popularity-ordered list of them, not a short one. */
const PUBLIC_MAX_SONGS = 15;

const SELF_HOSTED_MAX_ARTISTS = 50;
const SELF_HOSTED_MAX_ALBUMS = 50;
const SELF_HOSTED_MAX_SONGS = 100;

/**
 * The client for the server the user has chosen: their own when they have set
 * an address for it, the shared public one otherwise.
 *
 * Read at the moment of the call, so a change in Settings applies to the next
 * request without anything being rebuilt. The address is handed to the client
 * as its config; the integration itself never sees the store. A client for a
 * server of your own holds no state (it has no limiter to share), so making
 * one per call costs nothing, while the public one stays the single shared
 * client whose limiter every call must queue behind.
 */
export function currentMusicbrainzClient(): MusicbrainzClient {
  const state = store.getState();
  const serverUrl = selectSourceServerUrls(state).musicbrainz;
  const fallback = selectSourceFallbackUrls(state).musicbrainz?.trim();
  return serverUrl?.trim()
    ? mb.createMusicbrainzClient({ serverUrl, fallbackUrls: fallback ? [fallback] : undefined })
    : mb;
}

/**
 * Whether a server answers like a MusicBrainz one, asked with the same client
 * the app will use for it — so an address that passes here is one the search
 * will actually work against, `/ws/2` handling and all.
 */
export async function musicbrainzServerAnswers(serverUrl: string): Promise<boolean> {
  try {
    await mb.createMusicbrainzClient({ serverUrl }).searchArtist('a', 1);
    return true;
  } catch {
    return false;
  }
}

export const musicbrainzProvider: IntegrationProvider = {
  kind: 'integration',
  id: 'musicbrainz',
  // No dedicated icon asset exists for MusicBrainz today — see the file
  // report. `icon: 0` matches the broker test's own placeholder convention
  // rather than inventing an asset.
  presentation: { nameKey: 'settings.sources.musicbrainz.name', icon: 0, color: sourceColor.musicbrainz },
  auth: { tier: 'none' },
  capabilities: {
    'catalogue.search': async (query, kinds) => {
      // Artist and album name search returns duplicate/near-duplicate
      // catalogue entries by nature (see PUBLIC_MAX_ARTISTS's own note), so
      // the public server keeps only a small handful, trusting whatever
      // ordering it applied to put the best match first; a server of your
      // own gets the wider, self-hosted limits instead (see their own note).
      // Songs get the generous treatment either way — a search is genuinely
      // more useful with a long, popularity-ordered list of them.
      const isSelfHosted = !!selectSourceServerUrls(store.getState()).musicbrainz?.trim();
      const maxArtists = isSelfHosted ? SELF_HOSTED_MAX_ARTISTS : PUBLIC_MAX_ARTISTS;
      const maxAlbums = isSelfHosted ? SELF_HOSTED_MAX_ALBUMS : PUBLIC_MAX_ALBUMS;
      const maxSongs = isSelfHosted ? SELF_HOSTED_MAX_SONGS : PUBLIC_MAX_SONGS;
      const [artists, releaseGroups, recordings] = await Promise.all([
        kinds.artists ? currentMusicbrainzClient().searchArtist(query, maxArtists) : Promise.resolve([]),
        kinds.albums ? currentMusicbrainzClient().searchReleaseGroupByTitle(query, maxAlbums) : Promise.resolve([]),
        kinds.songs ? currentMusicbrainzClient().searchRecording(query, maxSongs) : Promise.resolve([]),
      ]);
      return {
        // MusicBrainz names no second line for an artist; for a release group
        // it is the first release year, which is this catalogue's own idea of
        // what distinguishes two records with the same title.
        //
        // Re-sliced here on top of the `limit` already sent above: a server
        // of your own is code this app doesn't control, and one that answers
        // more than it was asked for (seen in practice against a self-hosted
        // proxy) must not be able to flood a search with duplicate-looking
        // artists just because it ignored the query string. This is the
        // actual cap; the `limit` param is only ever a hint to the server.
        artists: artists.slice(0, maxArtists).map(dto => ({ entity: mapMbArtist(dto, MB_PROVENANCE), subtitle: '' })),
        albums: releaseGroups.slice(0, maxAlbums).map(dto => {
          const year = dto['first-release-date']?.slice(0, 4) ?? '';
          const artistName = dto['artist-credit']
            ?.map(credit => credit.name ?? credit.artist.name)
            .join(', ');
          // The row names the artist as well as the year: two records with
          // one title are told apart by who made them. The artist rides on
          // separately so a lookup never mistakes "Artist · 2001" for a name.
          return {
            entity: mapMbAlbum(dto, { provenance: MB_PROVENANCE }),
            subtitle: artistName ? (year ? `${artistName} · ${year}` : artistName) : year,
            artistName: artistName || undefined,
          };
        }),
        // A hit with no release-group behind it (a recording MusicBrainz
        // knows but has attached to no release) has nowhere to navigate, so
        // `mapRecordingSearchHit` drops it rather than this list carrying a
        // dead row. Sliced first, not after mapping: maxSongs is a cap on
        // how much of the server's own ranking we take, not on how many
        // survive the drop.
        songs: recordings.slice(0, maxSongs).flatMap(dto => {
          const song = mapRecordingSearchHit(dto, MB_PROVENANCE);
          return song ? [{ entity: song, subtitle: song.artist.name }] : [];
        }),
      };
    },
    'catalogue.album': async nativeId => {
      const client = currentMusicbrainzClient();
      const rg = await client.getReleaseGroup(nativeId);
      const tracks = await client.getTracksForReleaseGroup(nativeId);
      const songs = tracks.map(track => mapMbSong(track, { provenance: MB_PROVENANCE, releaseGroup: rg }));
      const album = mapMbAlbum(rg, { provenance: MB_PROVENANCE, songIds: songs.map(s => s.localId) });
      return { album, songs };
    },
  },
  testConnection: async () => ({ ok: true }),
};
