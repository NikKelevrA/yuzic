/**
 * Who can do this, right now, for this feature?
 *
 * Three separate questions, which the old registry ran together:
 *
 *   1. Can the app talk to this provider at all? — connection health.
 *   2. What can it do? — its declared capabilities.
 *   3. May this feature use it? — feature policy, which the user sets.
 *
 * All three must hold. A connected provider the user has switched off for
 * lyrics must not answer a lyrics request, and a provider the user has enabled
 * but that cannot be reached must not be tried first and silently fail.
 *
 * Enumeration never invokes a provider. Asking who could supply an artist
 * biography must not fetch one from everybody — that eager fan-out on load is
 * what made enrichment expensive and unpredictable.
 */
import type { CapabilityMap, CapabilityName } from '../contracts/Capabilities';
import type { Provider, ProviderId } from '../contracts/Provider';

/** A capability, together with whose it is, so results can be attributed. */
interface CapabilityOffer<K extends CapabilityName> {
  providerId: ProviderId;
  invoke: CapabilityMap[K];
}

export interface BrokerInput {
  /** Everything declared, connected or not. */
  providers: readonly Provider[];
  /** Providers the app can currently reach. */
  isConnected: (id: ProviderId) => boolean;
  /**
   * Whether the user has allowed this provider for this feature. Separate from
   * connection: "can Yuzic call it" and "may this feature call it" are
   * different questions with different answers.
   */
  isAllowed: (id: ProviderId, capability: CapabilityName) => boolean;
  /**
   * User-chosen order, strongest first. A provider absent from the order still
   * participates, after those listed — a newly added provider should not go
   * silently unused just because the stored order predates it.
   */
  order?: readonly ProviderId[];
}

/**
 * Every provider that can serve this capability, in the order they should be
 * tried. Callers take the first that answers unless the feature explicitly
 * blends results.
 */
export function offersFor<K extends CapabilityName>(
  input: BrokerInput,
  capability: K
): CapabilityOffer<K>[] {
  const { providers, isConnected, isAllowed, order = [] } = input;

  const eligible = providers.filter(provider => {
    const invoke = provider.capabilities[capability];
    if (!invoke) return false;
    if (!isConnected(provider.id)) return false;
    return isAllowed(provider.id, capability);
  });

  const rank = (id: ProviderId) => {
    const index = order.indexOf(id);
    return index === -1 ? order.length : index;
  };

  return eligible
    .slice()
    .sort((a, b) => rank(a.id) - rank(b.id))
    .map(provider => ({
      providerId: provider.id,
      // Present because the filter above proved it.
      invoke: provider.capabilities[capability] as CapabilityMap[K],
    }));
}

/** The provider that should be tried first, or null when none qualifies. */
export function firstOfferFor<K extends CapabilityName>(
  input: BrokerInput,
  capability: K
): CapabilityOffer<K> | null {
  return offersFor(input, capability)[0] ?? null;
}

/** Whether anything can serve this capability. Invokes nothing. */
export const hasCapability = (input: BrokerInput, capability: CapabilityName): boolean =>
  offersFor(input, capability).length > 0;
