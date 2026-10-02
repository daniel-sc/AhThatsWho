import { expect, it, vi } from 'vitest';
import { readBoundedBlob } from '../src/backup/read-blob';

it('rejects oversized declared or streamed bodies and cancels an overflowing stream', async () => {
  const sizeError = new Error('Too large');
  await expect(
    readBoundedBlob(new Response('abc', { headers: { 'Content-Length': '3' } }), 2, sizeError),
  ).rejects.toBe(sizeError);

  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.enqueue(new Uint8Array([3]));
    },
    cancel,
  });
  await expect(
    readBoundedBlob(new Response(stream, { headers: { 'Content-Length': '1' } }), 2, sizeError),
  ).rejects.toBe(sizeError);
  expect(cancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);

  const blob = await readBoundedBlob(new Response('ab'), 2, sizeError);
  expect(await blob.text()).toBe('ab');
});
