import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { R2StorageDriver } from './r2-storage.driver';

const CONFIG = {
  endpoint: 'https://acc.eu.r2.cloudflarestorage.com',
  accessKeyId: 'k',
  secretAccessKey: 's',
  privateBucket: 'patriota-privado',
  publicBucket: 'patriota-publico',
};

function harness() {
  const send = jest
    .fn<Promise<unknown>, [{ input: Record<string, unknown> }]>()
    .mockResolvedValue({});
  const driver = new R2StorageDriver(CONFIG, { send } as unknown as S3Client);
  /** The input of the n-th command sent, and its class. */
  const sent = (n = 0) => {
    const cmd = send.mock.calls[n][0];
    return { cmd, input: cmd.input };
  };
  return { driver, send, sent };
}

describe('R2StorageDriver', () => {
  it('writes to the PRIVATE bucket, under uploads/', async () => {
    const { driver, sent } = harness();

    await driver.put('2026/09/abc-large.webp', Buffer.from('x'), 'image/webp');

    const { cmd, input } = sent();
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(input).toMatchObject({
      Bucket: 'patriota-privado',
      Key: 'uploads/2026/09/abc-large.webp',
      ContentType: 'image/webp',
    });
  });

  it('publishes by a server-side copy from private to public', async () => {
    const { driver, send, sent } = harness();

    await driver.publish(['2026/09/abc-large.webp', '2026/09/abc-small.webp']);

    expect(send).toHaveBeenCalledTimes(2);
    const { cmd, input } = sent(0);
    expect(cmd).toBeInstanceOf(CopyObjectCommand);
    expect(input).toEqual({
      Bucket: 'patriota-publico',
      Key: 'uploads/2026/09/abc-large.webp',
      CopySource: 'patriota-privado/uploads/2026/09/abc-large.webp',
    });
  });

  it('lets a failed copy throw, so the caller keeps the row private', async () => {
    const { driver, send } = harness();
    send.mockRejectedValueOnce(new Error('R2 down'));

    await expect(driver.publish(['2026/09/abc-large.webp'])).rejects.toThrow(
      'R2 down',
    );
  });

  it('deletes from BOTH buckets', async () => {
    const { driver, send, sent } = harness();

    await driver.delete(['2026/09/abc-large.webp']);

    expect(send).toHaveBeenCalledTimes(2);
    expect(sent(0).cmd).toBeInstanceOf(DeleteObjectsCommand);
    expect(sent(0).input).toMatchObject({
      Bucket: 'patriota-privado',
      Delete: { Objects: [{ Key: 'uploads/2026/09/abc-large.webp' }] },
    });
    expect(sent(1).input).toMatchObject({ Bucket: 'patriota-publico' });
  });

  it('never fails a delete — the row is already gone', async () => {
    const { driver, send } = harness();
    send.mockRejectedValue(new Error('R2 down'));

    await expect(
      driver.delete(['2026/09/abc-large.webp']),
    ).resolves.toBeUndefined();
  });

  it('sends nothing to delete an empty list', async () => {
    const { driver, send } = harness();
    await driver.delete([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('passes a byte range straight through, for video seeking', async () => {
    const { driver, sent } = harness();

    await driver.read('2026/09/abc-video.mp4', { start: 100, end: 199 });

    const { cmd, input } = sent();
    expect(cmd).toBeInstanceOf(GetObjectCommand);
    expect(input).toMatchObject({
      Bucket: 'patriota-privado',
      Key: 'uploads/2026/09/abc-video.mp4',
      Range: 'bytes=100-199',
    });
  });

  it('reports the size of a file, and null for one that is not there', async () => {
    const { driver, send, sent } = harness();
    send.mockResolvedValueOnce({ ContentLength: 1234 });

    await expect(driver.head('2026/09/abc-large.webp')).resolves.toBe(1234);
    expect(sent().cmd).toBeInstanceOf(HeadObjectCommand);

    send.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { name: 'NotFound' }),
    );
    await expect(driver.head('2026/09/gone-large.webp')).resolves.toBeNull();
  });

  it('does not mistake any other failure for "not found"', async () => {
    const { driver, send } = harness();
    send.mockRejectedValueOnce(new Error('network'));

    await expect(driver.head('2026/09/abc-large.webp')).rejects.toThrow(
      'network',
    );
  });
});
