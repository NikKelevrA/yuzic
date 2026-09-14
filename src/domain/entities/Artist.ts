import type { CoverSource } from '@/domain/entities/Cover';
import type { LocalId } from '../identity/LocalId';
import type { EntityCore } from './EntityCore';

/**
 * One artist, whether the user owns their music or is browsing them on Deezer.
 *
 * `biography` and `tags` are the artist's own fields. When they come from an
 * integration rather than the origin server they arrive attributed, through
 * `ResolvedField`, and are never written back onto this record — see the
 * enrichment rules in docs/architecture.md.
 */
export interface Artist extends EntityCore {
  name: string;
  cover: CoverSource;
  biography?: string;
  tags: string[];
  /** Albums by this artist that have been loaded, as references. */
  albumIds: LocalId[];
}
