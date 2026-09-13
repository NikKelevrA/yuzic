/**
 * What every provider declares about itself.
 *
 * Two kinds, deliberately distinct rather than one list with a flag. Exactly
 * one server provider is active at a time and the user's library lives on it:
 * it is required core. Integrations are optional, any number can be connected
 * at once, and none of them owns anything. Collapsing the two would mean every
 * caller re-deriving which kind it was holding.
 *
 * What they share is how they are presented and authenticated, and that both
 * expose their abilities through one typed `Capabilities` map — so a feature
 * asks for a capability and never for a provider by name.
 */
import type { Capabilities } from './Capabilities';

/** Stable identifier. The one place a provider's name is legal is its own declaration. */
export type ProviderId = string;

/** How a provider is shown, so no screen keeps its own copy of a label or icon. */
export interface Presentation {
  /** i18n key for the provider's display name. */
  nameKey: string;
  /** Product logo. Distinct from a server's own user-supplied avatar. */
  icon: number;
  /** Brand colour, where a surface tints by provider. */
  color?: string;
}

/** How much a provider is trusted with, and what it needs to connect. */
export type AuthTier =
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

interface ProviderCore {
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

/** The user's music server. Required core; exactly one is active. */
export interface ServerProvider extends ProviderCore {
  kind: 'server';
}

/** An optional service. Any number may be connected. */
export interface IntegrationProvider extends ProviderCore {
  kind: 'integration';
}

export type Provider = ServerProvider | IntegrationProvider;
