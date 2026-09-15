import { createSettlingSender } from './settlingSender';

describe('createSettlingSender', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends only the last value, once it has settled', () => {
    const send = jest.fn();
    const sender = createSettlingSender(send, 250);

    sender.push(0.2);
    jest.advanceTimersByTime(100);
    sender.push(0.5);
    jest.advanceTimersByTime(100);
    sender.push(0.8);
    expect(send).not.toHaveBeenCalled();

    jest.advanceTimersByTime(250);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(0.8);
  });

  it('sends nothing once cancelled', () => {
    const send = jest.fn();
    const sender = createSettlingSender(send, 250);

    sender.push(0.4);
    sender.cancel();
    jest.advanceTimersByTime(1000);

    expect(send).not.toHaveBeenCalled();
  });
});
