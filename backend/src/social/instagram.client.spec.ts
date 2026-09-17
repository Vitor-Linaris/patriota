import { InstagramClient } from './instagram.client';
import { SocialConfig } from './social.config';

/**
 * The Instagram publish is two calls, and the order is the safety
 * property: the container step is inert, the publish step is not. If the
 * first fails there is nothing to undo; if they were ever collapsed or
 * reordered, a partial failure would leave a post up that this code
 * believes never happened.
 */
describe('InstagramClient', () => {
  let client: InstagramClient;
  let calls: { url: string; body: URLSearchParams }[];

  function respond(sequence: (object | Error)[]) {
    let i = 0;
    global.fetch = jest.fn((url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: new URLSearchParams(String(init?.body ?? '')),
      });
      const next = sequence[i++];
      if (next instanceof Error) {
        return Promise.resolve({
          ok: false,
          status: 400,
          text: () =>
            Promise.resolve(
              JSON.stringify({ error: { message: next.message } }),
            ),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(next)),
      });
    }) as unknown as typeof fetch;
  }

  beforeEach(() => {
    calls = [];
    client = new InstagramClient({
      accessToken: 'tok',
      instagramId: '17841400000000000',
    } as unknown as SocialConfig);
  });

  it('creates the container first, then publishes it', async () => {
    respond([
      { id: 'container_1' },
      { id: 'media_1' },
      { permalink: 'https://www.instagram.com/p/abc/' },
    ]);

    const result = await client.publish('legenda', 'https://x/y.jpg');

    expect(calls[0].url).toContain('/media');
    expect(calls[0].url).not.toContain('media_publish');
    expect(calls[0].body.get('image_url')).toBe('https://x/y.jpg');
    expect(calls[0].body.get('caption')).toBe('legenda');

    expect(calls[1].url).toContain('/media_publish');
    // The second call has to carry the FIRST call's id. Passing the
    // wrong one publishes somebody else's container or nothing at all.
    expect(calls[1].body.get('creation_id')).toBe('container_1');

    expect(result.remoteId).toBe('media_1');
    expect(result.remoteUrl).toBe('https://www.instagram.com/p/abc/');
  });

  it('never publishes when the container could not be created', async () => {
    respond([new Error('aspect ratio not supported')]);

    await expect(client.publish('legenda', 'https://x/y.jpg')).rejects.toThrow(
      /aspect ratio/,
    );
    expect(calls).toHaveLength(1);
  });

  it('keeps the post when only the permalink lookup fails', async () => {
    respond([{ id: 'container_1' }, { id: 'media_1' }, new Error('nope')]);

    const result = await client.publish('legenda', 'https://x/y.jpg');

    // It IS published. Failing here would schedule a retry, and the
    // retry would post it a second time — for the sake of a link.
    expect(result.remoteId).toBe('media_1');
    expect(result.remoteUrl).toBeNull();
  });

  it('sends the access token in the body, not the query string', async () => {
    respond([{ id: 'c' }, { id: 'm' }, { permalink: 'p' }]);
    await client.publish('legenda', 'https://x/y.jpg');

    expect(calls[0].url).not.toContain('access_token');
    expect(calls[0].body.get('access_token')).toBe('tok');
  });

  it('refuses to try at all without credentials', async () => {
    const bare = new InstagramClient({} as unknown as SocialConfig);
    await expect(bare.publish('a', 'b')).rejects.toThrow(/META_INSTAGRAM_ID/);
  });
});
