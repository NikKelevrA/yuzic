import { firstOfferFor, offersFor, type BrokerInput } from './capabilityBroker';
import type { Provider } from '../contracts/Provider';

const enrich = jest.fn(async () => null);

function provider(id: string, over: Partial<Provider> = {}): Provider {
  return {
    kind: 'integration',
    id,
    presentation: { nameKey: `provider.${id}`, icon: 0 },
    auth: { tier: 'none' },
    capabilities: { 'artist.enrich': enrich },
    testConnection: async () => ({ ok: true }),
    ...over,
  } as Provider;
}

function input(over: Partial<BrokerInput> = {}): BrokerInput {
  return {
    providers: [provider('alpha'), provider('beta')],
    isConnected: () => true,
    isAllowed: () => true,
    ...over,
  };
}

beforeEach(() => enrich.mockClear());

describe('offersFor', () => {
  it('returns only providers that declare the capability', () => {
    const offers = offersFor(input({
      providers: [provider('alpha'), provider('beta', { capabilities: {} })],
    }), 'artist.enrich');

    expect(offers.map(o => o.providerId)).toEqual(['alpha']);
  });

  it('excludes a provider the app cannot currently reach', () => {
    const offers = offersFor(input({ isConnected: id => id !== 'beta' }), 'artist.enrich');

    expect(offers.map(o => o.providerId)).toEqual(['alpha']);
  });

  it('excludes a connected provider the user has switched off for this feature', () => {
    // Connection and permission are different questions. A reachable provider
    // the user disabled for artist info must not answer an artist-info request.
    const offers = offersFor(input({
      isAllowed: (id, capability) => !(id === 'alpha' && capability === 'artist.enrich'),
    }), 'artist.enrich');

    expect(offers.map(o => o.providerId)).toEqual(['beta']);
  });

  it('orders by the user preference, strongest first', () => {
    const offers = offersFor(input({ order: ['beta', 'alpha'] }), 'artist.enrich');

    expect(offers.map(o => o.providerId)).toEqual(['beta', 'alpha']);
  });

  it('keeps a provider missing from the stored order, after those listed', () => {
    // A newly added provider must not go silently unused because the saved
    // order predates it.
    const offers = offersFor(input({
      providers: [provider('alpha'), provider('beta'), provider('gamma')],
      order: ['gamma'],
    }), 'artist.enrich');

    expect(offers.map(o => o.providerId)).toEqual(['gamma', 'alpha', 'beta']);
  });

  it('invokes nothing while enumerating', () => {
    // The point of the split: asking who *could* answer must not make everyone
    // answer. Eager fan-out on load is what made enrichment unpredictable.
    offersFor(input(), 'artist.enrich');
    firstOfferFor(input(), 'artist.enrich');

    expect(enrich).not.toHaveBeenCalled();
  });

  it('hands back a callable that is the provider own implementation', async () => {
    const offer = firstOfferFor(input(), 'artist.enrich');
    await offer?.invoke({} as never);

    expect(enrich).toHaveBeenCalledTimes(1);
  });
});

describe('firstOfferFor', () => {
  it('is null when nothing qualifies, rather than throwing', () => {
    expect(firstOfferFor(input({ isConnected: () => false }), 'artist.enrich')).toBeNull();
    expect(offersFor(input({ isConnected: () => false }), 'artist.enrich')).toEqual([]);
  });

  it('is null for a capability nothing declares', () => {
    expect(firstOfferFor(input(), 'catalogue.search')).toBeNull();
  });
});
