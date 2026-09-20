const mockAccountFetch = jest.fn();
const mockServerRequest = jest.fn();

jest.mock('@/providers/http/fetchWithTimeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockAccountFetch(...args),
}));

jest.mock('../client', () => ({
  plexHeaders: () => ({}),
  createPlexClient: jest.fn(() => ({ request: mockServerRequest })),
}));

import { createPlexClient } from '../client';
import { beginPlexPin, pollPlexPin } from './pin';
import { codeAuthServerFailure } from '@/providers/registry/codeAuthServerError';

describe('pollPlexPin', () => {
  beforeEach(() => {
    mockAccountFetch.mockReset();
    mockServerRequest.mockReset();
  });

  it('does not approve a Plex account until the selected server accepts its token', async () => {
    mockAccountFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ authToken: 'account-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ username: 'zack' }) });
    mockServerRequest.mockRejectedValueOnce(new Error('Plex request failed (401)'));

    await expect(pollPlexPin('pin-id', 'https://plex.example', {
      username: 'proxy-user', password: 'proxy-password',
    })).rejects.toThrow('401');

    expect(createPlexClient).toHaveBeenCalledWith({
      serverUrl: 'https://plex.example',
      token: 'account-token',
      basicAuth: { username: 'proxy-user', password: 'proxy-password' },
    });
    expect(mockServerRequest).toHaveBeenCalledWith('/library/sections');
  });

  // The user has approved by the time the server is asked anything, so a
  // refusal here is the server's answer. Unmarked, the caller treats it as a
  // blip, retries until the timeout, and reports an expired code -- for a code
  // that was accepted.
  it('marks a post-approval refusal as the server saying no, not a bad address', async () => {
    mockAccountFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ authToken: 'account-token' }) });
    mockServerRequest.mockRejectedValueOnce(new Error('Plex request failed (401)'));

    const err = await pollPlexPin('pin-id', 'https://plex.example').catch(e => e);

    expect(codeAuthServerFailure(err)).toBe('refused');
    expect(err.message).toContain('401');
  });

  // An unclaimed or unshared server answers 401 with a perfectly good address,
  // so the two cannot share a message: one is about the account, the other is
  // about where the app looked.
  it('marks an unreachable server separately from a refusal', async () => {
    mockAccountFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ authToken: 'account-token' }) });
    mockServerRequest.mockRejectedValueOnce(new Error('Network request failed'));

    const err = await pollPlexPin('pin-id', 'https://plex.example').catch(e => e);

    expect(codeAuthServerFailure(err)).toBe('unreachable');
  });

  it('does not mark a poll that has not reached approval yet', async () => {
    mockAccountFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ authToken: null }) });

    await expect(pollPlexPin('pin-id', 'https://plex.example')).resolves.toBeNull();
    expect(mockServerRequest).not.toHaveBeenCalled();
  });
});

describe('beginPlexPin', () => {
  beforeEach(() => {
    mockAccountFetch.mockReset();
    mockServerRequest.mockReset();
  });

  // `?strong=true` returns a 25-character code built for an `app.plex.tv/auth`
  // URL, not for reading out. Onboarding shows this code and asks the user to
  // type it at plex.tv/link, which only takes the short one -- so asking for a
  // strong PIN left every user holding a code with nowhere to enter it.
  it('asks for the short code plex.tv/link accepts, not a strong PIN', async () => {
    mockAccountFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 579107571, code: 'JQJW' }),
    });

    await expect(beginPlexPin('https://plex.example')).resolves.toEqual({
      code: 'JQJW',
      handle: '579107571',
    });

    const [url, init] = mockAccountFetch.mock.calls[0];
    expect(url).toBe('https://plex.tv/api/v2/pins');
    expect(String(url)).not.toContain('strong');
    expect(init.method).toBe('POST');
  });

  it('fails loudly when Plex answers without a code to show', async () => {
    mockAccountFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) });

    await expect(beginPlexPin('https://plex.example')).rejects.toThrow('sign-in code');
  });
});
