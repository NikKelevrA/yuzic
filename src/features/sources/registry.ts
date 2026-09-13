import { useSelector } from 'react-redux'
import {
  resolveDeezerAlbum,
  resolveDeezerArtistByName,
  getDeezerAlbum,
  getDeezerArtist,
  getDeezerArtistAlbums,
  getDeezerArtistTopTracks,
  getDeezerRelatedArtists,
} from '@/api/deezer'
import {
  selectDeezerExternalEnabled,
  selectMusicbrainzExternalEnabled,
} from '@/utils/redux/selectors/settingsSelectors'
import * as mb from '@/api/musicbrainz'
import { mapAlbum as mapMbAlbum } from '@/api/musicbrainz/mapAlbum'
import { mapArtist as mapMbArtist } from '@/api/musicbrainz/mapArtist'
import { mapSong as mapMbSong } from '@/api/musicbrainz/mapSong'
import type { Album } from '@/domain/entities/Album'
import type { Artist } from '@/domain/entities/Artist'
import type { Song } from '@/domain/entities/Song'
import type { AlbumDetail } from '@/domain/entities/Detail'
import { makeLocalId } from '@/domain/identity/LocalId'
import { integrationProvenance } from '@/domain/identity/Provenance'
import type { CoverSource } from '@/types/Cover'
import { sourceColor } from '@/constants/design'
import type { IntegrationModule, Health } from '@/features/integrations/types'

export type SourceId = 'deezer' | 'musicbrainz'

export type SourceResolvedArtist = {
  source: SourceId
  id: string
  name: string
  coverUrl?: string
}

export type SourceResolvedAlbum = {
  source: SourceId
  id: string
  title: string
  artist: string
  coverUrl?: string
}

/**
 * The bundle `fetchArtist` returns: the artist entity plus everything an
 * artist screen wants alongside it. Not a domain type — `Artist` itself
 * carries no `topTracks`/`similarArtists` fields, because those are
 * relations a caller asks for, not properties of the entity — so this is a
 * source-layer aggregate, the same shape as `AlbumDetail` plays for albums.
 */
export type SourceArtistDetail = {
  artist: Artist
  topTracks: Song[]
  albums: Album[]
  singles: Album[]
  similarArtists: Artist[]
}

export type SourceDefinition = IntegrationModule & {
  // Narrows `IntegrationModule.id: string` back to the closed source-id
  // union so every existing consumer keyed on `SourceId` still compiles.
  id: SourceId
  color: string
  /**
   * Kept as their own top-level fields (not read off `slots`) because every
   * existing consumer (ExternalResolutionProvider, useMatchedNavigation, the
   * Home/Search source headers) calls them directly; `slots['resolution']`
   * / `slots['discovery.shelf']` are an additional capability-view over the
   * same methods, kept in sync below, not a replacement for them.
   */
  resolveArtist(name: string): Promise<SourceResolvedArtist | null>
  resolveAlbum(artist: string, title: string): Promise<SourceResolvedAlbum | null>
  fetchAlbum(id: string): Promise<AlbumDetail | null>
  fetchArtist(id: string, mbid?: string | null): Promise<SourceArtistDetail | null>
  fetchArtistAlbums(artistId: string, limit: number, artistName?: string): Promise<Album[]>
}

/**
 * Both sources are keyless public APIs — no credentials, no server URL, no
 * account. `'none'` still leaks query contents to the provider (§7 rule 1),
 * so it isn't "no auth model", just the weakest tier.
 */
const noAuth = { tier: 'none' as const }

/**
 * There is nothing to authenticate for a keyless public source — it is
 * reachable by construction. "Enabled" is a plain user setting
 * (`selectDeezerExternalEnabled` / `selectMusicbrainzExternalEnabled`), not a
 * connection, so this deliberately does not perform a network ping.
 */
const trivialTestConnection = async (): Promise<Health> => ({ ok: true })


function urlFromCover(cover: CoverSource): string | undefined {
  return cover.kind === 'url' ? cover.url : undefined
}

/**
 * A stand-in `Artist` for `getDeezerArtistAlbums`' fallback parameter, built
 * from just the id/name a caller already has (an artist screen navigated to
 * before the full artist has been fetched). Only ever used to fill in an
 * album's artist reference when Deezer's albums-by-artist endpoint omits the
 * embedded artist object — never returned to a caller as a real artist.
 */
function stubDeezerArtist(artistId: string, artistName: string): Artist {
  const provenance = integrationProvenance('deezer')
  return {
    localId: makeLocalId('artist', provenance, artistId),
    nativeId: artistId,
    provenance,
    externalIds: artistId ? { deezerId: artistId } : {},
    libraryState: 'external',
    name: artistName,
    cover: { kind: 'none' },
    tags: [],
    albumIds: [],
  }
}

const deezerSource: SourceDefinition = {
  id: 'deezer',
  label: 'Deezer',
  color: sourceColor.deezer,
  auth: noAuth,
  testConnection: trivialTestConnection,
  // Deezer fills identity/metadata resolution (resolveArtist/resolveAlbum)
  // and feeds Home's external discovery shelves — hence
  // `useEnabledExternalSources` existing at all. Values are markers onto the
  // existing resolve/fetch methods (`SlotImpl` is `unknown`), not a new API.
  slots: {
    resolution: resolveDeezerArtistByName,
    'discovery.shelf': getDeezerArtistAlbums,
  },

  async resolveArtist(name) {
    const artist = await resolveDeezerArtistByName(name)
    if (!artist) return null
    return { source: 'deezer', id: artist.nativeId, name: artist.name, coverUrl: urlFromCover(artist.cover) }
  },

  async resolveAlbum(artist, title) {
    const album = await resolveDeezerAlbum(artist, title)
    if (!album) return null
    return { source: 'deezer', id: album.nativeId, title: album.title, artist: album.artist.name, coverUrl: urlFromCover(album.cover) }
  },

  async fetchAlbum(id) {
    return getDeezerAlbum(id)
  },

  async fetchArtistAlbums(artistId, limit, artistName) {
    const fallback = artistName ? stubDeezerArtist(artistId, artistName) : null
    return getDeezerArtistAlbums(artistId, limit, fallback)
  },

  async fetchArtist(id, mbid) {
    const base = await getDeezerArtist(id)
    if (!base) return null
    const [albums, topTracks, similarArtists] = await Promise.all([
      getDeezerArtistAlbums(id, 80, base),
      getDeezerArtistTopTracks(id, 10),
      getDeezerRelatedArtists(id, 8),
    ])
    const resolvedMbid = mbid ?? base.externalIds.mbid
    return {
      artist: {
        ...base,
        externalIds: resolvedMbid ? { ...base.externalIds, mbid: resolvedMbid } : base.externalIds,
      },
      topTracks,
      albums: albums.filter(a => a.releaseType !== 'single'),
      singles: albums.filter(a => a.releaseType === 'single'),
      similarArtists,
    }
  },
}

const MB_PROVENANCE = integrationProvenance('musicbrainz')

const musicbrainzSource: SourceDefinition = {
  id: 'musicbrainz',
  label: 'MusicBrainz',
  color: sourceColor.musicbrainz,
  auth: noAuth,
  testConnection: trivialTestConnection,
  // MusicBrainz fills identity/metadata resolution (resolveArtist/
  // resolveAlbum) and feeds Home's external discovery shelves — hence
  // `useEnabledExternalSources` existing at all. Values are markers onto the
  // existing resolve/fetch methods (`SlotImpl` is `unknown`), not a new API.
  slots: {
    resolution: mb.searchArtist,
    'discovery.shelf': mb.getArtistWithReleases,
  },

  async resolveArtist(name) {
    const results = await mb.searchArtist(name, 5)
    const best = results[0]
    if (!best) return null
    const artist = mapMbArtist(best, MB_PROVENANCE)
    return { source: 'musicbrainz', id: artist.nativeId, name: artist.name }
  },

  async resolveAlbum(artist, title) {
    const results = await mb.searchReleaseGroup(artist, title, 5)
    const best = results[0]
    if (!best) return null
    const album = mapMbAlbum(best, { provenance: MB_PROVENANCE })
    return {
      source: 'musicbrainz',
      id: album.nativeId,
      title: album.title,
      artist,
      coverUrl: mb.coverArtArchiveUrl(album.nativeId),
    }
  },

  async fetchAlbum(id) {
    const [rg, tracks] = await Promise.all([
      mb.getReleaseGroup(id),
      mb.getTracksForReleaseGroup(id),
    ])
    const songs = tracks.map(track => mapMbSong(track, { provenance: MB_PROVENANCE, releaseGroup: rg }))
    const album = mapMbAlbum(rg, { provenance: MB_PROVENANCE, songIds: songs.map(s => s.localId) })
    return { album, songs }
  },

  async fetchArtistAlbums(artistId, limit) {
    const artist = await mb.getArtistWithReleases(artistId)
    const rgs = artist['release-groups'] ?? []
    return rgs.slice(0, limit).map(rg => mapMbAlbum(rg, { provenance: MB_PROVENANCE }))
  },

  async fetchArtist(id) {
    const dto = await mb.getArtistWithReleases(id)
    const rgs = dto['release-groups'] ?? []
    const albums = rgs
      .filter(rg => !rg['primary-type'] || rg['primary-type'] === 'Album')
      .map(rg => mapMbAlbum(rg, { provenance: MB_PROVENANCE }))
    const singles = rgs
      .filter(rg => rg['primary-type'] === 'Single' || rg['primary-type'] === 'EP')
      .map(rg => mapMbAlbum(rg, { provenance: MB_PROVENANCE }))
    return {
      artist: mapMbArtist(dto, MB_PROVENANCE),
      topTracks: [],
      albums,
      singles,
      similarArtists: [],
    }
  },
}

export const ALL_SOURCES: SourceDefinition[] = [deezerSource, musicbrainzSource]

export function getSourceMeta(id: string): Pick<SourceDefinition, 'label' | 'color'> | null {
  return ALL_SOURCES.find(s => s.id === id) ?? null
}

export function useEnabledExternalSources(): SourceDefinition[] {
  const deezerEnabled = useSelector(selectDeezerExternalEnabled)
  const musicbrainzEnabled = useSelector(selectMusicbrainzExternalEnabled)
  return ALL_SOURCES.filter(s => {
    if (s.id === 'deezer') return deezerEnabled
    if (s.id === 'musicbrainz') return musicbrainzEnabled
    return false
  })
}
