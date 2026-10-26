import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertAiSettingsUpdate,
  assertChatRequest,
  assertSubtaskRequest,
  classifyHttpError,
  DEFAULT_MODEL,
  GEMINI_BASE_URL,
  GeminiAssistant,
  MAX_MESSAGES,
  parseSubtasks,
  rankFallbacks,
} from './gemini';
import type { GoogleConnector } from './google-connect';
import { type Cipher, SecureStore } from './secure-store';

const cipher: Cipher = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${[...plain].reverse().join('')}`),
  decrypt: (data) => [...data.toString().slice(4)].reverse().join(''),
};
const KEY = 'AIzaSyD-test_key_1234567890abcdefghijk';

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Gemini validation', () => {
  it('validates settings, keeping, replacing or removing the key', () => {
    expect(assertAiSettingsUpdate({ model: 'gemini-2.5-flash' })).toEqual({
      model: 'gemini-2.5-flash',
      apiKey: undefined,
    });
    expect(assertAiSettingsUpdate({ model: 'gemini-2.5-flash', apiKey: ` ${KEY} ` }).apiKey).toBe(
      KEY,
    );
    expect(assertAiSettingsUpdate({ model: 'gemini-2.5-flash', apiKey: null }).apiKey).toBeNull();
    expect(() => assertAiSettingsUpdate({ model: 'gemini-2.5-flash', apiKey: 'short' })).toThrow();
    expect(() => assertAiSettingsUpdate({ model: '../models/x' })).toThrow();
  });

  it('validates chat requests', () => {
    const ok = assertChatRequest({ messages: [{ role: 'user', text: 'Oi' }], context: 'ctx' });
    expect(ok).toEqual({
      messages: [{ role: 'user', text: 'Oi' }],
      context: 'ctx',
      allowActions: false,
    });
    expect(() => assertChatRequest({ messages: [] })).toThrow();
    expect(() => assertChatRequest({ messages: [{ role: 'system', text: 'x' }] })).toThrow();
    expect(() => assertChatRequest({ messages: [{ role: 'model', text: 'x' }] })).toThrow();
    expect(() =>
      assertChatRequest({ messages: [{ role: 'user', text: 'x'.repeat(4001) }] }),
    ).toThrow();
    expect(() =>
      assertChatRequest({
        messages: Array.from({ length: MAX_MESSAGES + 1 }, () => ({ role: 'user', text: 'x' })),
      }),
    ).toThrow();
    expect(() =>
      assertChatRequest({ messages: [{ role: 'user', text: 'x' }], context: 'c'.repeat(20_001) }),
    ).toThrow();
  });

  it('validates subtask requests', () => {
    expect(assertSubtaskRequest({ title: 'Gateway' })).toEqual({
      title: 'Gateway',
      description: '',
      context: '',
    });
    expect(() => assertSubtaskRequest({ title: '  ' })).toThrow();
  });

  it('classifies HTTP errors', () => {
    expect(classifyHttpError(400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } })).toBe(
      'auth',
    );
    expect(classifyHttpError(403, {})).toBe('auth');
    expect(classifyHttpError(429, {})).toBe('quota');
    expect(classifyHttpError(404, {})).toBe('model');
    expect(classifyHttpError(503, {})).toBe('unavailable');
    expect(classifyHttpError(400, { error: { message: 'bad request' } })).toBe('unknown');
  });

  it('ranks fallback models: Flash first, newest first, no aliases or tried ones', () => {
    expect(
      rankFallbacks(
        [
          'gemini-2.5-flash',
          'gemini-3.8-flash',
          'gemini-3.5-flash-lite',
          'gemini-3-flash-preview',
          'gemini-flash-latest',
          'gemini-3.1-pro-preview',
          'gemini-3.7-flash',
        ],
        new Set(['gemini-3.7-flash']),
      ),
    ).toEqual([
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3-flash-preview',
    ]);
  });

  it('parses subtask answers defensively', () => {
    expect(parseSubtasks('["Definir escopo", " definir escopo ", "Testar"]')).toEqual([
      'Definir escopo',
      'Testar',
    ]);
    expect(parseSubtasks('```json\n["A"]\n```')).toEqual(['A']);
    expect(parseSubtasks('not json')).toEqual([]);
    expect(
      parseSubtasks(JSON.stringify(Array.from({ length: 15 }, (_, i) => `T${i}`))),
    ).toHaveLength(10);
  });
});

describe('GeminiAssistant', () => {
  let dir: string;
  let calls: { url: string; init: RequestInit }[];
  let next: () => Response | Promise<Response>;

  const create = () =>
    new GeminiAssistant(
      path.join(dir, 'ai-settings.json'),
      new SecureStore(path.join(dir, 'ai-secrets.json'), cipher),
      () => true,
      async (url, init) => {
        calls.push({ url, init });
        return next();
      },
    );

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'didiflow-ai-'));
    calls = [];
    next = () => reply({ candidates: [{ content: { parts: [{ text: 'Olá!' }] } }] });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('needs a key', async () => {
    const ai = create();
    expect(await ai.status()).toEqual({
      hasKey: false,
      canStoreKey: true,
      model: DEFAULT_MODEL,
      account: null,
      googleSignIn: false,
    });
    expect(await ai.chat({ messages: [{ role: 'user', text: 'Oi' }] })).toEqual({
      status: 'error',
      error: 'not-configured',
    });
    expect(calls).toEqual([]);
  });

  it('stores the key encrypted and never returns it', async () => {
    const ai = create();
    const status = await ai.save({ model: 'gemini-2.5-flash-lite', apiKey: KEY });
    expect(status).toEqual({
      hasKey: true,
      canStoreKey: true,
      model: 'gemini-2.5-flash-lite',
      account: null,
      googleSignIn: false,
    });
    expect(JSON.stringify(status)).not.toContain(KEY);
    expect(await readFile(path.join(dir, 'ai-secrets.json'), 'utf8')).not.toContain(KEY);
    expect(await readFile(path.join(dir, 'ai-settings.json'), 'utf8')).not.toContain(KEY);
    expect((await create().status()).model).toBe('gemini-2.5-flash-lite');

    await ai.save({ model: 'gemini-2.5-flash', apiKey: null });
    expect((await ai.status()).hasKey).toBe(false);
  });

  it('sends the chat with system prompt, context and history', async () => {
    const ai = create();
    await ai.save({ model: 'gemini-2.5-flash', apiKey: KEY });
    const result = await ai.chat({
      messages: [
        { role: 'user', text: 'O que priorizar?' },
        { role: 'model', text: 'Veja as atrasadas.' },
        { role: 'user', text: 'E hoje?' },
      ],
      context: 'Hoje: 2026-10-26\n- Gateway (urgente)',
    });
    expect(result).toEqual({ status: 'ok', text: 'Olá!', actions: [] });
    const { url, init } = calls[0];
    expect(url).toBe(`${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent`);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toContain('DidiBot');
    expect(body.systemInstruction.parts[0].text).toContain('- Gateway (urgente)');
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.tools).toBeUndefined();
  });

  it('maps API failures', async () => {
    const ai = create();
    await ai.save({ model: 'gemini-2.5-flash', apiKey: KEY });
    next = () => reply({ error: { status: 'RESOURCE_EXHAUSTED' } }, 429);
    expect(await ai.chat({ messages: [{ role: 'user', text: 'x' }] })).toEqual({
      status: 'error',
      error: 'quota',
    });
    next = () => reply({ promptFeedback: { blockReason: 'SAFETY' } });
    expect((await ai.chat({ messages: [{ role: 'user', text: 'x' }] })).status).toBe('error');
    next = () => {
      throw new TypeError('fetch failed');
    };
    expect(await ai.test()).toEqual({ status: 'error', error: 'network' });
  });

  it('falls back to the Flash aliases when the model is retired or overloaded', async () => {
    const ai = create();
    await ai.save({ model: 'gemini-2.5-flash', apiKey: KEY });
    const answers = [
      reply({ error: { code: 404, message: 'no longer available to new users' } }, 404),
      reply({ error: { code: 503, status: 'UNAVAILABLE' } }, 503),
      reply({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }),
    ];
    next = () => answers.shift()!;
    expect(await ai.test()).toEqual({ status: 'ok', model: 'gemini-flash-lite-latest' });
    // The retired model is replaced by the one that answered.
    expect((await ai.status()).model).toBe('gemini-flash-lite-latest');
    expect(calls.map((call) => call.url.split('/models/')[1])).toEqual([
      'gemini-2.5-flash:generateContent',
      'gemini-flash-latest:generateContent',
      'gemini-flash-lite-latest:generateContent',
    ]);
  });

  it('treats a timeout as an overloaded model and keeps the choice', async () => {
    const ai = create();
    await ai.save({ model: 'gemini-3.8-flash', apiKey: KEY });
    const answers: (() => Response)[] = [
      () => {
        throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      },
      () => reply({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }),
    ];
    next = () => answers.shift()!();
    expect(await ai.test()).toEqual({ status: 'ok', model: 'gemini-flash-latest' });
    expect((await ai.status()).model).toBe('gemini-3.8-flash');
  });

  it('tries the newest Flash models of the key when every alias is overloaded', async () => {
    const ai = create();
    await ai.save({ model: 'gemini-flash-latest', apiKey: KEY });
    next = () => {
      const url = calls[calls.length - 1].url;
      if (url.includes('/models?')) {
        return reply({
          models: [
            { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
            {
              name: 'models/gemini-3.8-flash-lite',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        });
      }
      if (url.includes('gemini-3.5-flash:')) {
        return reply({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] });
      }
      return reply({ error: { status: 'UNAVAILABLE' } }, 503);
    };
    expect(await ai.test()).toEqual({ status: 'ok', model: 'gemini-3.5-flash' });
    expect(calls.map((call) => call.url.split('/models')[1])).toEqual([
      '/gemini-flash-latest:generateContent',
      '/gemini-flash-lite-latest:generateContent',
      '?pageSize=200',
      '/gemini-3.8-flash:generateContent',
      '/gemini-3.5-flash:generateContent',
    ]);
  });

  it('does not retry other models on quota or key errors', async () => {
    const ai = create();
    await ai.save({ model: 'gemini-2.5-flash', apiKey: KEY });
    next = () => reply({ error: { status: 'RESOURCE_EXHAUSTED' } }, 429);
    expect((await ai.test()).status).toBe('error');
    expect(calls).toHaveLength(1);
  });

  it('offers functions only when actions are allowed and returns validated proposals', async () => {
    const ai = create();
    await ai.save({ model: 'gemini-2.5-flash', apiKey: KEY });
    next = () =>
      reply({
        candidates: [
          {
            content: {
              parts: [
                { text: 'Preparei o projeto e duas tarefas.' },
                {
                  functionCall: {
                    name: 'create_project',
                    args: { name: 'Site novo', color: 'azul' },
                  },
                },
                {
                  functionCall: {
                    name: 'create_task',
                    args: {
                      title: 'Criar layout',
                      project: 'Site novo',
                      priority: 'high',
                      due_date: '2026-11-03',
                    },
                  },
                },
                { functionCall: { name: 'delete_everything', args: {} } },
              ],
            },
          },
        ],
      });
    const result = await ai.chat({
      messages: [{ role: 'user', text: 'Crie um projeto' }],
      allowActions: true,
    });
    expect(result).toEqual({
      status: 'ok',
      text: 'Preparei o projeto e duas tarefas.',
      actions: [
        { type: 'create_project', name: 'Site novo' },
        {
          type: 'create_task',
          title: 'Criar layout',
          project: 'Site novo',
          priority: 'high',
          dueDate: '2026-11-03',
        },
      ],
    });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.tools[0].functionDeclarations.map((f: { name: string }) => f.name)).toEqual([
      'create_project',
      'create_task',
      'update_task',
    ]);
    expect(body.systemInstruction.parts[0].text).toContain('só as aplica depois da confirmação');
  });

  it('accepts an answer made only of function calls', async () => {
    const ai = create();
    await ai.save({ model: 'gemini-2.5-flash', apiKey: KEY });
    next = () =>
      reply({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { name: 'update_task', args: { task: 'Gateway', status: 'done' } },
                },
              ],
            },
          },
        ],
      });
    expect(
      await ai.chat({
        messages: [{ role: 'user', text: 'Conclua o gateway' }],
        allowActions: true,
      }),
    ).toEqual({
      status: 'ok',
      text: '',
      actions: [{ type: 'update_task', task: 'Gateway', status: 'done' }],
    });
  });

  it('asks for structured subtasks', async () => {
    const ai = create();
    await ai.save({ model: 'gemini-2.5-flash', apiKey: KEY });
    next = () =>
      reply({
        candidates: [{ content: { parts: [{ text: '["Mapear fluxo","Implementar Pix"]' }] } }],
      });
    expect(await ai.suggestSubtasks({ title: 'Gateway de pagamento', description: 'Pix' })).toEqual(
      {
        status: 'ok',
        items: ['Mapear fluxo', 'Implementar Pix'],
      },
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents[0].parts[0].text).toContain('Tarefa: Gateway de pagamento');
  });

  it('lists Gemini models that generate content', async () => {
    const ai = create();
    await ai.save({ model: 'gemini-2.5-flash', apiKey: KEY });
    next = () =>
      reply({
        models: [
          {
            name: 'models/gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            supportedGenerationMethods: ['generateContent'],
          },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3-pro-image', supportedGenerationMethods: ['generateContent'] },
        ],
      });
    expect(await ai.models()).toEqual({
      status: 'ok',
      models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
    });
  });

  it('stores the key created through Google sign-in and remembers the account', async () => {
    const connector = {
      configured: true,
      connect: async () => ({
        status: 'ok' as const,
        apiKey: KEY,
        account: 'ana@gmail.com',
        projectId: 'didiflow-abc',
      }),
    } as unknown as GoogleConnector;
    const ai = new GeminiAssistant(
      path.join(dir, 'ai-settings.json'),
      new SecureStore(path.join(dir, 'ai-secrets.json'), cipher),
      () => true,
      undefined,
      connector,
    );
    expect(await ai.connectGoogle()).toEqual({
      status: 'ok',
      account: 'ana@gmail.com',
      projectId: 'didiflow-abc',
    });
    const status = await ai.status();
    expect(status).toMatchObject({ hasKey: true, account: 'ana@gmail.com', googleSignIn: true });
    expect(JSON.stringify(status)).not.toContain(KEY);

    await ai.save({ model: status.model });
    expect((await ai.status()).account).toBe('ana@gmail.com');
    await ai.save({ model: status.model, apiKey: null });
    expect(await ai.status()).toMatchObject({ hasKey: false, account: null });
  });

  it('cannot sign in with Google without an OAuth client', async () => {
    expect(await create().connectGoogle()).toEqual({ status: 'error', error: 'not-configured' });
  });
});
