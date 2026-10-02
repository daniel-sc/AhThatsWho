/** Bound actual streamed bytes as well as the declared content length. */
export async function readBoundedBlob(
  input: Request | Response,
  max: number,
  sizeError: Error,
): Promise<Blob> {
  if (Number(input.headers.get('Content-Length')) > max) throw sizeError;
  const reader = input.body?.getReader();
  if (!reader) return new Blob([]);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        throw sizeError;
      }
      chunks.push(new Uint8Array(value));
    }
    return new Blob(chunks, { type: 'image/jpeg' });
  } finally {
    reader.releaseLock();
  }
}
