/**
 * What every provider the capability broker serves declares about itself.
 *
 * Every such provider is an optional integration: any number can be connected
 * at once, and none of them owns the user's library. The music server is not
 * one of them — it is required core, reached through the active `ApiAdapter`
 * (`contracts/ServerAdapter.ts`), and how it connects is declared in
 * `registry/serverConnections.ts`. Server capability declarations existed here
 * once, were never asked for, and were removed; see `contracts/Capabilities.ts`.
 *
 * What an integration shares with the rest is how it is presented and
 * authenticated, and that it exposes its abilities through one typed
 * `Capabilities` map — so a feature asks for a capability and never for a
 * provider by name.
 */
import type { Capabilities } from './Capabilities';

/** Stable identifier. The one place a provider's name is legal is its own declaration. */
export type ProviderId = string;

/** How a provider is shown, so no screen keeps its own copy of a label or icon. */
interface Presentation {
  /** i18n key for the provider's display name. */
  nameKey: string;
  /** Product logo. Distinct from a server's own user-supplied avatar. */
  icon: number;
  /** Brand colour, where a surface tints by provider. */
  color?: string;
}

/** How much a provider is trusted with, and what it needs to connect. */
type AuthTier =
  /** A public API. Still leaks what is asked of it, so not "no auth model". */
  | 'none'
  /** A key or token the user supplies. */
  | 'apiKey'
  /** A signed per-user session. */
  | 'account';

export interface AuthDescriptor {
  tier: AuthTier;
  /** Config keys this provider reads to authenticate. Omitted for `'none'`. */
  configKeys?: readonly string[];
}

/** Whether the app can currently reach and use this provider. */
export interface Health {
  ok: boolean;
  message?: string;
}

/** An optional service. Any number may be connected. */
export interface IntegrationProvider {
  kind: 'integration';
  id: ProviderId;
  presentation: Presentation;
  auth: AuthDescriptor;
  capabilities: Capabilities;
  /**
   * Can the app talk to it right now? Answers reachability and credentials
   * only — never whether a feature is allowed to use it, which is policy the
   * broker applies separately.
   */
  testConnection(): Promise<Health>;
}

export type Provider = IntegrationProvider;
