import { integrationProvenance } from '@/domain/identity/Provenance';
import { mapSong } from './mapSong';
import type { MbReleaseGroup, MbTrack } from './';

const provenance = integrationProvenance('musicbrainz');

const releaseGroup: MbReleaseGroup = {
  id: 'e0be0716-0d95-3007-a562-e6e86fdbcc37',
  title: 'Discovery',
};

/** A track entry from `getTracksForReleaseGroup` (`inc=recordings+artist-credits`). */
const fullDto: MbTrack = {
  id: 'f9752a3e-836c-3b71-8bd4-19d4a2e2e2f5',
  title: 'One More Time',
  length: 320_000,
  position: 1,
  recording: { id: '2a3a2a3a-1111-2222-3333-444455556666' },
  'artist-credit': [
    { name: 'Daft Punk', artist: { id: '056e4f3e-d505-4dad-8ec1-d04f521cbb56', name: 'Daft Punk' } },
  ],
};

describe('mapSong', () => {
  it('produces a complete song from a full DTO', () => {
    expect(mapSong(fullDto, { provenance, releaseGroup })).toEqual({
      localId: 'local:song:ext:musicbrainz:2a3a2a3a-1111-2222-3333-444455556666',
      nativeId: '2a3a2a3a-1111-2222-3333-444455556666',
      provenance: { origin: 'integration', providerId: 'musicbrainz' },
      externalIds: { mbid: '2a3a2a3a-1111-2222-3333-444455556666' },
      title: 'One More Time',
      artist: {
        localId: 'local:artist:ext:musicbrainz:056e4f3e-d505-4dad-8ec1-d04f521cbb56',
        nativeId: '056e4f3e-d505-4dad-8ec1-d04f521cbb56',
        externalIds: { mbid: '056e4f3e-d505-4dad-8ec1-d04f521cbb56' },
        name: 'Daft Punk',
        cover: { kind: 'none', subject: { kind: 'artist', name: 'Daft Punk', mbid: '056e4f3e-d505-4dad-8ec1-d04f521cbb56' } },
      },
      album: {
        localId: 'local:album:ext:musicbrainz:e0be0716-0d95-3007-a562-e6e86fdbcc37',
        nativeId: 'e0be0716-0d95-3007-a562-e6e86fdbcc37',
        externalIds: { mbid: 'e0be0716-0d95-3007-a562-e6e86fdbcc37', mbidType: 'release-group' },
        title: 'Discovery',
        cover: {
          kind: 'coverartarchive',
          mbid: 'e0be0716-0d95-3007-a562-e6e86fdbcc37',
          mbidType: 'release-group',
        },
      },
      cover: {
        kind: 'coverartarchive',
        mbid: 'e0be0716-0d95-3007-a562-e6e86fdbcc37',
        mbidType: 'release-group',
      },
      durationSeconds: 320,
      contentKind: 'song',
      trackNumber: 1,
      genres: [],
    });
  });

  it('is external — resolved through MusicBrainz, not owned on any server', () => {
  });

  it('derives identity from the provenance it is given', () => {
    expect(mapSong(fullDto, { provenance, releaseGroup }).localId)
      .toBe('local:song:ext:musicbrainz:2a3a2a3a-1111-2222-3333-444455556666');
  });

  it('prefers the recording id over the release-scoped track id', () => {
    expect(mapSong(fullDto, { provenance, releaseGroup }).nativeId)
      .toBe('2a3a2a3a-1111-2222-3333-444455556666');
    expect(mapSong(fullDto, { provenance, releaseGroup }).nativeId)
      .not.toBe(fullDto.id);
  });

  it('falls back to the track id when the release omits the recording relationship', () => {
    const { recording, ...withoutRecording } = fullDto;

    expect(mapSong(withoutRecording, { provenance, releaseGroup }).nativeId).toBe(fullDto.id);
  });

  it('converts length from milliseconds to seconds', () => {
    expect(mapSong({ ...fullDto, length: 245_500 }, { provenance, releaseGroup }).durationSeconds)
      .toBe(246);
  });

  it('produces a valid song from an all-but-required-fields-missing DTO rather than throwing', () => {
    const minimal: MbTrack = { id: 'tr-1', title: 'Untitled', length: null, position: 1 };

    expect(mapSong(minimal, { provenance, releaseGroup })).toMatchObject({
      localId: 'local:song:ext:musicbrainz:tr-1',
      title: 'Untitled',
      durationSeconds: 0,
      contentKind: 'song',
      genres: [],
      externalIds: { mbid: 'tr-1' },
    });
    expect(mapSong(minimal, { provenance, releaseGroup }).artist.name).toBe('Unknown Artist');
  });

  it('carries no stream URL, only the identity a stream can be built from', () => {
    expect(mapSong(fullDto, { provenance, releaseGroup })).not.toHaveProperty('streamUrl');
  });
});
