/**
 * A pointer to another entity, carrying just enough to render and navigate.
 *
 * An album names its artist and a song names its album. Embedding the whole
 * entity there is what turned `Album` into a god object holding every song,
 * each holding its own album; a reference keeps the graph flat and lets the
 * real entity be fetched by the repository that owns it.
 *
 * A reference carries `externalIds` because matching needs them — relating a
 * Deezer album to a library album compares the artist reference too — but
 * nothing about the referenced entity's own state: whether the user owns that
 * artist is a question about the artist, answered by loading it.
 */
import type { CoverSource } from '@/domain/entities/Cover';
import type { ExternalIds } from '../identity/ExternalIds';
import type { LocalId } from '../identity/LocalId';

interface RefCore {
  localId: LocalId;
  nativeId: string;
  externalIds: ExternalIds;
}

export interface ArtistRef extends RefCore {
  name: string;
  cover: CoverSource;
}

export interface AlbumRef extends RefCore {
  title: string;
  cover: CoverSource;
}
