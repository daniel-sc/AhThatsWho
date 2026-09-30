import { driveRequest } from './server/drive';
import type { DriveEnv } from './server/drive-common';
import { assert, object, string } from './domain/integrity';
import { recognitionLanguages } from './domain/languages';
import {
  PARSER_MODEL,
  TRANSCRIPTION_MODEL,
  MAX_AUDIO_BYTES,
  MAX_GENERATION_BYTES,
  TRANSCRIPTION_PROMPT,
  responseBody,
} from './providers/openai-contract';

interface Env extends DriveEnv {
  OPENAI_API_KEY?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Bound the bytes actually received, including uploads without Content-Length.
async function readBody(request: Request, limit: number) {
  if (Number(request.headers.get('Content-Length')) > limit)
    throw new RequestError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Request body is required.');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError(413, 'Request is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks);
}

function languages(values: unknown): string[] {
  assert(
    Array.isArray(values) && values.length <= recognitionLanguages.length,
    'Invalid languages',
  );
  assert(
    values.every((v) => recognitionLanguages.some((l) => l.code === v)),
    'Invalid language',
  );
  return [...new Set(values)] as string[];
}

function generationInput(value: unknown) {
  object(value);
  assert(value.mode === undefined || value.mode === 'auto' || value.mode === 'new', 'Invalid mode');
  string(value.source, 20000);
  assert(value.source.trim(), 'Empty source');
  object(value.hints);
  const hints: Record<string, string> = {};
  for (const key of ['householdId', 'contextId']) {
    if (value.hints[key] === undefined) continue;
    string(value.hints[key], 128);
    hints[key] = value.hints[key];
  }
  for (const [key, limit] of [
    ['candidates', 12],
    ['contexts', 5000],
    ['nameIndex', 5000],
  ] as const) {
    const entries = value[key];
    assert(Array.isArray(entries) && entries.length <= limit, `Invalid ${key}`);
    entries.forEach(object);
  }
  // Only notebook data is accepted. OpenAI request options come from our code.
  const mode = value.mode === 'new' ? 'new' : 'auto';
  if (mode === 'new') delete hints.householdId;
  return {
    source: value.source,
    expectedLanguages: languages(value.expectedLanguages),
    hints,
    candidates: mode === 'new' ? [] : value.candidates,
    contexts: value.contexts,
    nameIndex: mode === 'new' ? [] : value.nameIndex,
    ...(mode === 'new' ? { mode: 'new' as const } : {}),
  };
}

async function transcriptionBody(request: Request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.startsWith('multipart/form-data'))
    throw new RequestError(415, 'Expected audio upload.');
  const body = await readBody(request, MAX_AUDIO_BYTES + 64 * 1024);
  const input = await new Response(body, { headers: { 'Content-Type': type } }).formData();
  const file = input.get('file');
  assert(file instanceof File && file.size > 0, 'Audio is required');
  if (file.size > MAX_AUDIO_BYTES) throw new RequestError(413, 'Audio is too large.');
  assert(/^capture\.(m4a|webm|ogg|wav)$/.test(file.name), 'Unsupported audio file');
  const keywords = input.getAll('keywords[]');
  assert(keywords.length <= 50, 'Too many keywords');
  keywords.forEach((v) => string(v, 1500));
  assert(keywords.join('').length <= 1500, 'Keywords are too long');
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('model', TRANSCRIPTION_MODEL);
  form.append('prompt', TRANSCRIPTION_PROMPT);
  for (const language of languages(input.getAll('languages[]')))
    form.append('languages[]', language);
  for (const keyword of keywords) form.append('keywords[]', keyword);
  return form;
}

async function openai(key: string, path: string, body?: BodyInit, isJSON = false) {
  try {
    const response = await fetch(`https://api.openai.com/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        ...(isJSON ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
      signal: AbortSignal.timeout(80000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const status = [401, 403].includes(response.status) ? 503 : response.status;
      throw new RequestError(
        status,
        'Sponsored AI request failed. Retry later or use a personal key.',
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      502,
      'Sponsored AI could not be reached or returned an unreadable response.',
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/backup/')) return driveRequest(request, env);
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!['/api/ai/generate', '/api/ai/transcribe', '/api/ai/check'].includes(path))
      return json({ error: 'Not found.' }, 404);
    if (request.method !== (path === '/api/ai/check' ? 'GET' : 'POST'))
      return json({ error: 'Method not allowed.' }, 405);
    if (!env.OPENAI_API_KEY) return json({ error: 'Sponsored AI is not configured.' }, 503);
    try {
      if (path === '/api/ai/check') {
        await openai(env.OPENAI_API_KEY, `models/${PARSER_MODEL}`);
        await openai(env.OPENAI_API_KEY, `models/${TRANSCRIPTION_MODEL}`);
        return json({ available: true });
      }
      if (path === '/api/ai/transcribe') {
        const body = await transcriptionBody(request);
        return json(await openai(env.OPENAI_API_KEY, 'audio/transcriptions', body));
      }
      if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json')
        return json({ error: 'Expected JSON.' }, 415);
      const body = await readBody(request, MAX_GENERATION_BYTES);
      const input = generationInput(JSON.parse(await body.text()));
      return json(
        await openai(
          env.OPENAI_API_KEY,
          'responses',
          JSON.stringify(responseBody(input, input.mode)),
          true,
        ),
      );
    } catch (error) {
      // Do not return provider error bodies or log keys, recordings or notebook data.
      return error instanceof RequestError
        ? json({ error: error.message }, error.status)
        : json({ error: 'Invalid AI request.' }, 400);
    }
  },
};
