import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Album } from '@/domain/entities/Album';
import { QueryKeys } from '@/state/query/queryKeys';
import { useStarAlbum } from './useStarAlbum';
import { useUnstarAlbum } from './useUnstarAlbum';

const mockDispatch = jest.fn();
const mockAdd = jest.fn();
const mockRemove = jest.fn();
let mockOffline = false;

jest.mock('react-redux', () => ({
  useSelector: () => ({ id: 'srv' }),
  useDispatch: () => mockDispatch,
}));
jest.mock('@/providers/registry/useApi', () => ({
  useApi: () => ({ starred: { add: mockAdd, remove: mockRemove } }),
}));
jest.mock('@/features/connectivity/useIsOffline', () => ({ useIsOffline: () => mockOffline }));

const album = { localId: 'local:album:srv:srv:al1', nativeId: 'al1', title: 'Album' } as unknown as Album;

async function setup<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...(await renderHook(hook, { wrapper })) };
}

const queued = () => mockDispatch.mock.calls.map(([action]) => action.payload);

beforeEach(() => {
  mockDispatch.mockReset();
  mockAdd.mockReset();
  mockRemove.mockReset();
  mockOffline = false;
});

describe('album favourites', () => {
  it('asks the server directly when online', async () => {
    const { result } = await setup(useStarAlbum);

    await act(async () => { await result.current.mutateAsync(album); });

    expect(mockAdd).toHaveBeenCalledWith('al1', 'album');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('queues a favourite offline and shows it in the starred albums at once', async () => {
    mockOffline = true;
    const { result, queryClient } = await setup(useStarAlbum);

    await act(async () => { await result.current.mutateAsync(album); });

    expect(mockAdd).not.toHaveBeenCalled();
    expect(queued()).toEqual([expect.objectContaining({ type: 'starAlbum', serverId: 'srv', album })]);
    expect(queryClient.getQueryData<{ albums: Album[] }>([QueryKeys.Starred, 'srv'])?.albums).toEqual([album]);
  });

  it('queues an un-favourite offline by identity and takes it out of the starred albums', async () => {
    mockOffline = true;
    const { result, queryClient } = await setup(useUnstarAlbum);
    queryClient.setQueryData([QueryKeys.Starred, 'srv'], { songs: [], albums: [album] });

    await act(async () => { await result.current.mutateAsync(album); });

    expect(mockRemove).not.toHaveBeenCalled();
    expect(queued()).toEqual([expect.objectContaining({ type: 'unstarAlbum', albumId: album.localId })]);
    expect(queryClient.getQueryData<{ albums: Album[] }>([QueryKeys.Starred, 'srv'])?.albums).toEqual([]);
  });
});
