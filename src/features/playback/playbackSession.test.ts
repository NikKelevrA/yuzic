import { createPlaybackSession } from './playbackSession';
import type { PlayableResource } from './playableResource';

const resource = (id: string): PlayableResource => ({
  song: { localId: id, nativeId: id, title: id } as PlayableResource['song'],
  streamUrl: `https://example.test/${id}`,
});

describe('createPlaybackSession', () => {
  it('moves the pointer and the song together, telling subscribers once', () => {
    const session = createPlaybackSession();
    const listener = jest.fn();
    session.subscribe(listener);
    const b = resource('b');

    session.setQueue([resource('a'), b]);
    session.setActive(1, b);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.currentIndex()).toBe(1);
    expect(session.currentResource()).toBe(b);
    expect(session.getSnapshot().currentSong).toBe(b.song);
  });

  it('keeps the same snapshot object when a write changes nothing', () => {
    const session = createPlaybackSession();
    const listener = jest.fn();
    session.subscribe(listener);
    const before = session.getSnapshot();

    session.setRepeatMode('off');
    session.setCurrentIndex(0);

    expect(session.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('a queue edit is visible to React only through queueVersion', () => {
    const session = createPlaybackSession();
    session.setQueue([resource('a')]);
    expect(session.getSnapshot().queueVersion).toBe(0);

    session.bumpQueue();
    expect(session.getSnapshot().queueVersion).toBe(1);
  });

  it('clearing the queue drops the shuffle snapshot and shuffle, but keeps repeat', () => {
    const session = createPlaybackSession();
    const a = resource('a');
    session.setQueue([a]);
    session.setSegments([{ startIndex: 0, length: 1, source: { kind: 'user', contextId: 'x', contextType: 'album' } }]);
    session.setOriginalQueue([a]);
    session.setActive(0, a);
    session.setShuffleMode('shuffle');
    session.setRepeatMode('all');

    session.clearQueue();

    expect(session.queue()).toEqual([]);
    expect(session.segments()).toEqual([]);
    expect(session.originalQueue()).toBeNull();
    expect(session.currentResource()).toBeNull();
    expect(session.getSnapshot()).toMatchObject({ currentSong: null, currentIndex: 0, shuffleMode: 'off', repeatMode: 'all' });
  });

  it('swapping the current resource for a refreshed one keeps the pointer where it is', () => {
    const session = createPlaybackSession();
    const a = resource('a');
    session.setActive(3, a);
    const refreshed = { ...a, streamUrl: 'https://example.test/fresh' };

    session.setCurrentResource(refreshed);

    expect(session.currentResource()).toBe(refreshed);
    expect(session.currentIndex()).toBe(3);
  });

  it('stops notifying a subscriber once it unsubscribes', () => {
    const session = createPlaybackSession();
    const listener = jest.fn();
    const unsubscribe = session.subscribe(listener);
    unsubscribe();

    session.setVolume(0.5);

    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot().volume).toBe(0.5);
  });

  it('dates a new listen, and a cleared one reads as none', () => {
    const session = createPlaybackSession();
    session.markNewListen(1234);
    expect(session.listenStartedAt()).toBe(1234);

    session.clearListen();
    expect(session.listenStartedAt()).toBe(0);
  });
});
