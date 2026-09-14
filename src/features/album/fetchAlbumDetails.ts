import type { QueryClient } from '@tanstack/react-query';
import { QueryKeys } from '@/state/query/queryKeys';
import { staleTime } from '@/state/query/staleTime';
import type { Album } from '@/domain/entities/Album';
import type { AlbumDetail } from '@/domain/entities/Detail';

export type FetchAlbumDetailsArgs = {
  queryClient: QueryClient;
  serverId: string;
  albums: Album[];
  getAlbum: (id: string) => Promise<AlbumDetail>;
};

export async function fetchAlbumDetailsSettled({
  queryClient,
  serverId,
  albums,
  getAlbum,
}: FetchAlbumDetailsArgs): Promise<AlbumDetail[]> {
  const results = await Promise.allSettled(
    albums.map(album =>
      queryClient.fetchQuery({
        // The cache is scoped by server already, so the origin's own id keys
        // it — matching every other album query in the app.
        queryKey: [QueryKeys.Album, serverId, album.nativeId],
        queryFn: () => getAlbum(album.nativeId),
        staleTime: staleTime.albums,
      })
    )
  );

  return results
    .map(result => result.status === 'fulfilled' ? result.value : null)
    .filter((detail): detail is AlbumDetail => detail !== null);
}
