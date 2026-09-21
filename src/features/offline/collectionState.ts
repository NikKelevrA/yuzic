type TrackIdLike = {
  id?: string | number | null;
  trackId?: string | number | null;
  originalTrack?: {
    id?: string | number | null;
  } | null;
};

type AlbumTrackLike = {
  id: string;
  albumId?: string | null;
};

export function buildDownloadedTrackIdSet(
  tracks: TrackIdLike[]
): Set<string> {
  const ids = tracks
    .map(track => {
      const id = track?.id ?? track?.trackId ?? track?.originalTrack?.id;
      return String(id ?? '').trim();
    })
    .filter(Boolean);

  return new Set(
    ids
  );
}

export function getFullyDownloadedAlbumIds(
  tracks: AlbumTrackLike[],
  downloadedTrackIds: Set<string>
): Set<string> {
  const totalsByAlbumId = new Map<string, number>();
  const downloadedByAlbumId = new Map<string, number>();

  for (const track of tracks) {
    const albumId = String(track.albumId ?? '');
    const trackId = String(track.id ?? '');
    if (!albumId || !trackId) continue;

    totalsByAlbumId.set(albumId, (totalsByAlbumId.get(albumId) ?? 0) + 1);
    if (downloadedTrackIds.has(trackId)) {
      downloadedByAlbumId.set(
        albumId,
        (downloadedByAlbumId.get(albumId) ?? 0) + 1
      );
    }
  }

  const fullyDownloadedAlbumIds = new Set<string>();
  totalsByAlbumId.forEach((total, albumId) => {
    if (total > 0 && (downloadedByAlbumId.get(albumId) ?? 0) === total) {
      fullyDownloadedAlbumIds.add(albumId);
    }
  });

  return fullyDownloadedAlbumIds;
}
