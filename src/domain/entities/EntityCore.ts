/**
 * What every domain entity has.
 *
 * There is exactly one type per kind — one `Artist`, not an `Artist` and an
 * `ExternalArtist`. Where a record came from is data on the record
 * (`provenance`), not a second type, because a parallel hierarchy forces every
 * screen that can show either to carry both and pick between them, which is
 * where `localArtist ?? externalArtist` came from.
 *
 * All four fields are required. They were optional while the model was being
 * migrated, which meant every consumer had to decide what an absent one
 * meant, and they did not all decide the same thing.
 */
import type { ExternalIds } from '../identity/ExternalIds';
import type { LocalId } from '../identity/LocalId';
import type { Provenance } from '../identity/Provenance';

export interface EntityCore {
  /** Stable on-device identity, derived from `provenance` and `nativeId`. */
  localId: LocalId;
  /** The id this entity has at its origin, for calling that origin back. */
  nativeId: string;
  /** Which origin produced this record. Immutable. */
  provenance: Provenance;
  /** Identifiers this entity is known by elsewhere. Additive. */
  externalIds: ExternalIds;
}
