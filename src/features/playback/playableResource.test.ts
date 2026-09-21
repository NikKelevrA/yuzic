import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import type { Song } from '@/domain/entities/Song';
import {
  assertPlayable, isPlayable, playableOnly, resourceFromPlayerItem, sameQueue, sourceKind,
} from './playableResource';

const provenance = serverProvenance('srv-1');
const songId = (nativeId: string) => makeLocalId('song', provenance, nativeId);

const song = (nativeId: string): Song => ({
  localId: songId(nativeId),
  nativeId,
  provenance,
  externalIds: {},
  title: nativeId,
  artist: { localId: makeLocalId('artist', provenance, 'a1'), nativeId: 'a1', externalIds: {}, name: 'A', cover: { kind: 'none' } },
  album: { localId: makeLocalId('album', provenance, 'al1'), nativeId: 'al1', externalIds: {}, title: 'Al', cover: { kind: 'none' } },
  cover: { kind: 'none' },
  durationSeconds: 100,
  contentKind: 'song',
  genres: [],
});

const resource = (nativeId: string, streamUrl: string, filePath?: string) =>
  ({ song: song(nativeId), streamUrl, filePath });

describe('isPlayable', () => {
  it.each([
    ['https://host/a.mp3', true],
    ['http://host/a.mp3', true],
    ['file:///downloads/a.mp3', true],
    ['/var/mobile/a.mp3', true],
    ['', false],
    ['   ', false],
    ['downloads/a.mp3', false],
    ['data:audio/mp3;base64,AAA', false],
  ])('%s -> %s', (url, expected) => {
    expect(isPlayable(resource('t1', url))).toBe(expected);
  });
});

describe('sourceKind', () => {
  it('reports a downloaded copy as a file even when the URL looks remote', () => {
    expect(sourceKind(resource('t1', 'https://host/a.mp3', '/downloads/a.mp3'))).toBe('file');
  });

  it('distinguishes remote, file and absent', () => {
    expect(sourceKind(resource('t1', 'https://host/a.mp3'))).toBe('remote');
    expect(sourceKind(resource('t1', 'file:///a.mp3'))).toBe('file');
    expect(sourceKind(resource('t1', ''))).toBe('none');
    expect(sourceKind(null)).toBe('none');
  });
});

describe('assertPlayable / playableOnly', () => {
  it('throws naming the track, so an explicit play never fails silently', () => {
    expect(() => assertPlayable([resource('t1', 'https://host/a.mp3'), resource('t2', '')]))
      .toThrow(songId('t2'));
  });

  it('drops only the unplayable entries for a queue fill', () => {
    const kept = playableOnly([resource('t1', 'https://host/a.mp3'), resource('t2', '')]);
    expect(kept.map(r => r.song.nativeId)).toEqual(['t1']);
  });
});

describe('sameQueue', () => {
  it('compares identity and order, not object references', () => {
    expect(sameQueue(
      [resource('a', 'https://h/a'), resource('b', 'https://h/b')],
      [resource('a', 'https://h/a-different-url'), resource('b', 'https://h/b')]
    )).toBe(true);
  });

  it('notices a reorder and a length change', () => {
    expect(sameQueue([resource('a', 'u'), resource('b', 'u')], [resource('b', 'u'), resource('a', 'u')])).toBe(false);
    expect(sameQueue([resource('a', 'u')], [])).toBe(false);
  });
});

describe('resourceFromPlayerItem', () => {
  it('recovers provenance and the origin id from the media id alone', () => {
    const recovered = resourceFromPlayerItem({
      mediaId: songId('t9'),
      url: 'https://host/t9.mp3',
      title: 'Nine',
      artist: 'A',
      duration: 42,
    });

    expect(recovered?.song.provenance).toEqual({ origin: 'server', serverId: 'srv-1' });
    expect(recovered?.song.nativeId).toBe('t9');
    expect(recovered?.song.localId).toBe(songId('t9'));
    expect(recovered?.song.durationSeconds).toBe(42);
    expect(recovered?.streamUrl).toBe('https://host/t9.mp3');
  });

  it('refuses an item whose media id is not a song identity', () => {
    // A bare server id, or an album's identity, cannot describe a queued track.
    expect(resourceFromPlayerItem({ mediaId: 't9', url: 'https://host/t9.mp3' })).toBeNull();
    expect(resourceFromPlayerItem({
      mediaId: makeLocalId('album', provenance, 'al1'),
      url: 'https://host/t9.mp3',
    })).toBeNull();
  });

  it('refuses an item with no identity or no url', () => {
    expect(resourceFromPlayerItem({ url: 'https://host/t9.mp3' })).toBeNull();
    expect(resourceFromPlayerItem({ mediaId: songId('t9') })).toBeNull();
  });
});
