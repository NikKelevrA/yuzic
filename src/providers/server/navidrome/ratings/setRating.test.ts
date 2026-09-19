import { setRating } from './setRating';
import type { NavidromeClient } from '../client';

function makeClient(status: string) {
  const request = jest.fn().mockResolvedValue({ 'subsonic-response': { status } });
  return {
    client: { request } as unknown as NavidromeClient,
    request,
  };
}

describe('setRating', () => {
  it('addresses the item by plain `id`, unlike star.view next door', async () => {
    // star.view picks the entity kind by which parameter name it is given;
    // setRating.view is older and takes one id whatever the thing is. Getting
    // this wrong is a call that silently rates nothing.
    const { client, request } = makeClient('ok');

    await setRating(client, 'al-3', 4);

    expect(request).toHaveBeenCalledWith('setRating.view', { id: 'al-3', rating: '4' });
  });

  it('sends zero to clear a rating, which is how Subsonic spells it', async () => {
    const { client, request } = makeClient('ok');

    await setRating(client, 'tr-1', 0);

    expect(request).toHaveBeenCalledWith('setRating.view', { id: 'tr-1', rating: '0' });
  });

  it('throws when the server answers with anything but ok', async () => {
    // The caller takes the optimistic star back off on a throw; a refusal
    // that resolved would leave a rating on screen the server never took.
    const { client } = makeClient('failed');

    await expect(setRating(client, 'tr-1', 3)).rejects.toThrow();
  });
});
