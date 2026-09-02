import { ConfigService } from '@nestjs/config';
import { BrevoMailDriver } from './brevo.driver';
import type { MailMessage, MailSender } from '../mailer.types';

/**
 * The payload shape, pinned.
 *
 * Brevo differs from Resend in three small ways, and each one produces a
 * 400 with very little in it: the key goes in an `api-key` header rather
 * than a Bearer token, `sender`/`to` are objects rather than formatted
 * strings, and tags are plain strings rather than name/value pairs.
 *
 * Getting any of them wrong is invisible until a real send fails, which
 * on this codebase means a reader never receiving their verification
 * link — a silent failure at the worst moment. Hence a test that asserts
 * the wire format rather than just "it called fetch".
 */
describe('BrevoMailDriver', () => {
  const from: MailSender = { name: 'O Patriota', email: 'noreply@opatriota.pt' };
  const message: MailMessage = {
    to: 'leitor@example.com',
    subject: 'Confirme o seu e-mail',
    html: '<p>Olá</p>',
    text: 'Olá',
  };

  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  function driverWith(key: string | undefined) {
    const config = {
      get: (k: string) => (k === 'BREVO_API_KEY' ? key : undefined),
    } as unknown as ConfigService;
    return new BrevoMailDriver(config);
  }

  /** The body of the single fetch call, parsed. */
  const sentBody = () =>
    JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<
      string,
      unknown
    >;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: '<abc@brevo>' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('authenticates with an api-key header, not a Bearer token', async () => {
    await driverWith('xkeysib-test').send(message, from);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('xkeysib-test');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('sends sender and recipient as objects, not formatted strings', async () => {
    await driverWith('k').send(message, from);

    const body = sentBody();
    expect(body.sender).toEqual({
      name: 'O Patriota',
      email: 'noreply@opatriota.pt',
    });
    expect(body.to).toEqual([{ email: 'leitor@example.com' }]);
    // The Resend shape, which Brevo rejects.
    expect(body.from).toBeUndefined();
  });

  it('uses htmlContent/textContent, which is what Brevo reads', async () => {
    await driverWith('k').send(message, from);

    const body = sentBody();
    expect(body.htmlContent).toBe('<p>Olá</p>');
    expect(body.textContent).toBe('Olá');
    expect(body.html).toBeUndefined();
  });

  it('passes the unsubscribe headers through', async () => {
    // Gmail and Yahoo require List-Unsubscribe on bulk mail. Dropping
    // them does not fail the send — it quietly ruins deliverability for
    // the category digests, which is worse.
    await driverWith('k').send(
      {
        ...message,
        headers: {
          'List-Unsubscribe': '<https://opatriota.pt/sair>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      },
      from,
    );

    expect(sentBody().headers).toEqual({
      'List-Unsubscribe': '<https://opatriota.pt/sair>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('sends tags as plain strings', async () => {
    await driverWith('k').send({ ...message, tag: 'digest' }, from);
    expect(sentBody().tags).toEqual(['digest']);
  });

  it('omits headers and tags entirely when there are none', async () => {
    await driverWith('k').send(message, from);
    const body = sentBody();
    expect('headers' in body).toBe(false);
    expect('tags' in body).toBe(false);
  });

  it('returns the message id, for correlating with Brevo webhooks', async () => {
    const res = await driverWith('k').send(message, from);
    expect(res.messageId).toBe('<abc@brevo>');
  });

  it('survives a response with no id rather than throwing', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(driverWith('k').send(message, from)).resolves.toEqual({
      messageId: null,
    });
  });

  it('says what to do when the key is missing', async () => {
    // The message a developer sees at 2am. "undefined is not a string"
    // would not tell them the driver was simply never configured.
    await expect(driverWith(undefined).send(message, from)).rejects.toThrow(
      /BREVO_API_KEY is not set/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a rejection so the outbox can retry', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"message":"Key not found"}',
    });
    await expect(driverWith('k').send(message, from)).rejects.toThrow(
      /Brevo responded 401/,
    );
  });
});
