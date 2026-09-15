import { createDownloadProgress } from './downloadProgress';

describe('createDownloadProgress', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('publishes a burst of reports once, after the flush interval', () => {
    const progress = createDownloadProgress(350);
    const listener = jest.fn();
    progress.subscribe(listener);

    progress.report('a', 10, 100);
    progress.report('a', 50, 100);
    progress.report('b', 1, 0);
    expect(listener).not.toHaveBeenCalled();

    jest.advanceTimersByTime(350);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(progress.getSnapshot()).toEqual({ a: 0.5, b: -1 });
  });

  it('drops a finished track straight away rather than at the next flush', () => {
    const progress = createDownloadProgress(350);
    progress.report('a', 10, 100);
    jest.advanceTimersByTime(350);

    progress.clear('a');

    expect(progress.getSnapshot()).toEqual({});
  });

  it('ignores clearing a track it never heard of', () => {
    const progress = createDownloadProgress(350);
    const listener = jest.fn();
    progress.subscribe(listener);

    progress.clear('unknown');

    expect(listener).not.toHaveBeenCalled();
  });

  it('publishes nothing once disposed', () => {
    const progress = createDownloadProgress(350);
    const listener = jest.fn();
    progress.subscribe(listener);

    progress.report('a', 1, 2);
    progress.dispose();
    jest.advanceTimersByTime(1000);

    expect(listener).not.toHaveBeenCalled();
  });
});
