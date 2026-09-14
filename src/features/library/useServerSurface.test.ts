import { renderHook } from '@testing-library/react-native';

import { ServerFeatureUnavailableError } from '@/providers/contracts/ServerAdapter';
import { isUnavailableOnServer, useServerSurface } from './useServerSurface';

// The query client itself is not under test: capture what the hook asks of it,
// and hand back whatever answer a test sets.
jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryFn: () => Promise<boolean>; enabled: boolean }) => {
    mockQueries.push(options);
    return { data: mockData };
  },
}));
jest.mock('react-redux', () => ({ useSelector: () => ({ id: 'srv-1' }) }));
jest.mock('@/features/connectivity/useServerReachable', () => ({ useServerReachable: () => true }));
jest.mock('@/providers/registry/useApi', () => ({ useApi: () => mockApi }));

/* eslint-disable no-var -- hoisted for the jest.mock factories above */
var mockQueries: { queryFn: () => Promise<boolean>; enabled: boolean }[] = [];
var mockData: boolean | undefined;
var mockApi: Record<string, unknown> = {};
/* eslint-enable no-var */

const lastQuery = () => mockQueries[mockQueries.length - 1];

describe('useServerSurface', () => {
  beforeEach(() => {
    mockQueries = [];
    mockData = undefined;
    mockApi = {};
  });

  it('never offers a surface the adapter does not declare, and never asks', async () => {
    mockData = true;
    const { result } = await renderHook(() => useServerSurface('podcasts'));

    expect(result.current).toBe(false);
    expect(lastQuery().enabled).toBe(false);
  });

  it('keeps the row out until the server has answered', async () => {
    mockApi = { podcasts: { list: jest.fn() } };
    const { result } = await renderHook(() => useServerSurface('podcasts'));

    expect(lastQuery().enabled).toBe(true);
    expect(result.current).toBe(false);
  });

  it('offers it once the server has listed it', async () => {
    mockApi = { shares: { list: jest.fn(async () => []) } };
    mockData = true;
    const { result } = await renderHook(() => useServerSurface('shares'));

    await expect(lastQuery().queryFn()).resolves.toBe(true);
    expect(result.current).toBe(true);
  });

  it('remembers "not offered" when the server says it does not do that', async () => {
    mockApi = { podcasts: { list: jest.fn(async () => { throw new ServerFeatureUnavailableError(); }) } };
    await renderHook(() => useServerSurface('podcasts'));

    await expect(lastQuery().queryFn()).resolves.toBe(false);
  });

  it('treats any other failure as not knowing yet, so it is asked again', async () => {
    mockApi = { podcasts: { list: jest.fn(async () => { throw new Error('network down'); }) } };
    await renderHook(() => useServerSurface('podcasts'));

    await expect(lastQuery().queryFn()).rejects.toThrow('network down');
  });
});

describe('isUnavailableOnServer', () => {
  it('tells a feature the server lacks from a request that failed', () => {
    expect(isUnavailableOnServer(new ServerFeatureUnavailableError())).toBe(true);
    expect(isUnavailableOnServer(new Error('Navidrome API error (502)'))).toBe(false);
  });
});
