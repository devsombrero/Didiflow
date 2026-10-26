import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  AiChatMessage,
  AiChatRequest,
  AiConnectResult,
  AiError,
  AiModel,
  AiResult,
  AiSettingsUpdate,
  AiStatus,
  AiSubtaskRequest,
} from './contract';
import type { GoogleConnector } from './google-connect';
import type { SecureStore } from './secure-store';
import { IpcValidationError } from './validation';

/**
 * DidiBot: Gemini API (free tier) called from the main process with the
 * user's AI Studio key. The key lives in its own OS-encrypted store and never
 * goes back to the renderer.
 */
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
/** Aliases that follow Google's newest Flash models (old versions get retired). */
export const DEFAULT_MODEL = 'gemini-flash-latest';
/** Tried in order when the chosen model is retired (404) or overloaded (503). */
export const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
/** Text models only: no speech, image, robotics or tool-specific variants. */
const CHAT_MODEL = /^gemini-[a-z0-9.-]*(flash|pro)/;
const NON_CHAT_MODEL =
  /(tts|image|robotics|computer-use|customtools|transcribe|audio|live|embedding|nano-banana)/;
export const API_KEY_KEY = 'gemini-api-key';
export const AI_STUDIO_KEYS_URL = 'https://aistudio.google.com/apikey';

export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_CONTEXT_LENGTH = 20_000;
const REQUEST_TIMEOUT_MS = 45_000;

const MODEL_PATTERN = /^[a-z0-9][a-z0-9.-]{1,63}$/;
const API_KEY_PATTERN = /^[A-Za-z0-9_-]{30,80}$/;

const SYSTEM_PROMPT = [
  'Você é o DidiBot, assistente do DidiFlow, um aplicativo de gestão pessoal de demandas, prazos e indicadores.',
  'Responda sempre em português do Brasil, de forma objetiva e prática, usando Markdown simples (títulos curtos, listas e negrito).',
  'Quando falar das tarefas do usuário, use apenas os dados do contexto. Se faltar informação, diga isso e sugira o que registrar no DidiFlow.',
  'Nunca invente tarefas, datas, horas ou números.',
  'Priorize por prazo (atrasadas e vencendo primeiro), depois prioridade (urgente, alta, média, baixa) e progresso.',
].join('\n');

export interface AiSettings {
  model: string;
  /** Google account that created the key through "Conectar conta Google". */
  account?: string;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Validation (everything coming from the renderer).
// ---------------------------------------------------------------------------

export function assertModel(value: unknown): string {
  if (typeof value !== 'string' || !MODEL_PATTERN.test(value)) {
    throw new IpcValidationError('Invalid model');
  }
  return value;
}

export function normalizeApiKey(value: string): string | null {
  const key = value.trim();
  return API_KEY_PATTERN.test(key) ? key : null;
}

export function assertAiSettingsUpdate(value: unknown): AiSettingsUpdate {
  if (typeof value !== 'object' || value === null) {
    throw new IpcValidationError('Invalid AI settings');
  }
  const { model, apiKey } = value as Record<string, unknown>;
  let key: string | null | undefined;
  if (apiKey === null || apiKey === undefined) key = apiKey;
  else if (typeof apiKey === 'string' && apiKey.length <= 200) {
    key = normalizeApiKey(apiKey) ?? undefined;
    if (key === undefined) throw new IpcValidationError('Invalid Gemini API key');
  } else throw new IpcValidationError('Invalid Gemini API key');
  return { model: assertModel(model), apiKey: key };
}

function text(value: unknown, max: number, label: string, optional = false): string {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > max) {
    throw new IpcValidationError(`Invalid ${label}`);
  }
  return value;
}

export function assertChatRequest(value: unknown): AiChatRequest {
  if (typeof value !== 'object' || value === null) {
    throw new IpcValidationError('Invalid chat request');
  }
  const { messages, context } = value as Record<string, unknown>;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw new IpcValidationError('Invalid chat messages');
  }
  const valid: AiChatMessage[] = messages.map((message) => {
    const { role, text: body } = (message ?? {}) as Record<string, unknown>;
    if (role !== 'user' && role !== 'model') throw new IpcValidationError('Invalid chat role');
    const content = text(body, MAX_MESSAGE_LENGTH, 'chat message');
    if (!content.trim()) throw new IpcValidationError('Empty chat message');
    return { role, text: content };
  });
  if (valid[valid.length - 1].role !== 'user') {
    throw new IpcValidationError('The last chat message must come from the user');
  }
  return { messages: valid, context: text(context, MAX_CONTEXT_LENGTH, 'chat context', true) };
}

export function assertSubtaskRequest(value: unknown): AiSubtaskRequest {
  if (typeof value !== 'object' || value === null) {
    throw new IpcValidationError('Invalid subtask request');
  }
  const { title, description, context } = value as Record<string, unknown>;
  const name = text(title, 200, 'task title');
  if (!name.trim()) throw new IpcValidationError('Empty task title');
  return {
    title: name,
    description: text(description, MAX_MESSAGE_LENGTH, 'task description', true),
    context: text(context, 2000, 'task context', true),
  };
}

// ---------------------------------------------------------------------------
// Gemini REST helpers.
// ---------------------------------------------------------------------------

/** Maps a Gemini HTTP error to a category the renderer can explain. */
export function classifyHttpError(status: number, body: unknown): AiError {
  const error = (body as { error?: { status?: string; message?: string; details?: unknown[] } })
    ?.error;
  const reasons = JSON.stringify(error?.details ?? []);
  if (reasons.includes('API_KEY_INVALID') || status === 401 || status === 403) return 'auth';
  if (status === 429 || error?.status === 'RESOURCE_EXHAUSTED') return 'quota';
  if (status === 404) return 'model';
  if (status === 400 && /api key/i.test(error?.message ?? '')) return 'auth';
  if (status >= 500) return 'unavailable';
  return 'unknown';
}

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export function extractText(response: GenerateResponse): string | null {
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const output = parts
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  return output || null;
}

/** Subtask titles from a JSON answer: trimmed, unique, at most 10. */
export function parseSubtasks(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const title = item.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (title && !seen.has(title.toLowerCase())) {
      seen.add(title.toLowerCase());
      items.push(title);
    }
    if (items.length === 10) break;
  }
  return items;
}

export class GeminiAssistant {
  private settings: Promise<AiSettings> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly settingsFile: string,
    private readonly secrets: SecureStore,
    private readonly canStoreKey: () => boolean,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
    private readonly google: GoogleConnector | null = null,
  ) {}

  /** Google sign-in that creates the Gemini key automatically (see google-connect.ts). */
  async connectGoogle(): Promise<AiConnectResult> {
    if (!this.google?.configured) return { status: 'error', error: 'not-configured' };
    const result = await this.google.connect();
    if (result.status === 'error') return result;
    await this.secrets.set(API_KEY_KEY, result.apiKey);
    const settings = { ...(await this.load()), account: result.account };
    this.settings = Promise.resolve(settings);
    await this.persist(settings);
    return { status: 'ok', account: result.account, projectId: result.projectId };
  }

  async status(): Promise<AiStatus> {
    return {
      hasKey: (await this.secrets.get(API_KEY_KEY)) !== null,
      canStoreKey: this.canStoreKey(),
      model: (await this.load()).model,
      account: (await this.load()).account ?? null,
      googleSignIn: this.google?.configured ?? false,
    };
  }

  async save(update: AiSettingsUpdate): Promise<AiStatus> {
    if (update.apiKey === null) await this.secrets.remove(API_KEY_KEY);
    else if (update.apiKey !== undefined) await this.secrets.set(API_KEY_KEY, update.apiKey);
    // A removed key also forgets which Google account created it.
    const previous = await this.load();
    const settings: AiSettings =
      update.apiKey === null || update.apiKey !== undefined
        ? { model: update.model }
        : { model: update.model, account: previous.account };
    this.settings = Promise.resolve(settings);
    await this.persist(settings);
    return this.status();
  }

  /** Models of this key that can generate content, Gemini first. */
  async models(): Promise<AiResult<{ models: AiModel[] }>> {
    const key = await this.secrets.get(API_KEY_KEY);
    if (!key) return { status: 'error', error: 'not-configured' };
    const response = await this.request(`${GEMINI_BASE_URL}/models?pageSize=200`, key, {
      method: 'GET',
    });
    if (response.status === 'error') return response;
    const list = (
      response.body as {
        models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
      }
    ).models;
    const models = (list ?? [])
      .filter(
        (model) =>
          CHAT_MODEL.test(model.name?.slice('models/'.length) ?? '') &&
          !NON_CHAT_MODEL.test(model.name ?? '') &&
          model.supportedGenerationMethods?.includes('generateContent'),
      )
      .map((model) => ({
        id: model.name!.slice('models/'.length),
        name: model.displayName ?? model.name!.slice('models/'.length),
      }));
    return { status: 'ok', models };
  }

  /** Checks the key and the chosen model with a tiny request. */
  async test(): Promise<AiResult<{ model: string }>> {
    const result = await this.generate({
      contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK' }] }],
      generationConfig: { maxOutputTokens: 256 },
    });
    if (result.status === 'error') return result;
    return { status: 'ok', model: result.model };
  }

  async chat(request: AiChatRequest): Promise<AiResult<{ text: string }>> {
    const context = request.context?.trim();
    const result = await this.generate({
      systemInstruction: {
        parts: [
          {
            text: context
              ? `${SYSTEM_PROMPT}\n\nContexto do usuário (dados do DidiFlow):\n${context}`
              : SYSTEM_PROMPT,
          },
        ],
      },
      contents: request.messages.map((message) => ({
        role: message.role,
        parts: [{ text: message.text }],
      })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    });
    if (result.status === 'error') return result;
    return { status: 'ok', text: result.text };
  }

  async suggestSubtasks(request: AiSubtaskRequest): Promise<AiResult<{ items: string[] }>> {
    const prompt = [
      'Sugira de 3 a 7 subtarefas concretas, em ordem de execução, para a tarefa abaixo.',
      'Cada subtarefa deve começar com um verbo no infinitivo e ter no máximo 80 caracteres.',
      'Responda somente com um array JSON de strings.',
      '',
      `Tarefa: ${request.title}`,
      request.description ? `Descrição:\n${request.description}` : '',
      request.context ? `Contexto: ${request.context}` : '',
    ]
      .filter((line, index) => line !== '' || index === 3)
      .join('\n');
    const result = await this.generate({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
        responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
      },
    });
    if (result.status === 'error') return result;
    const items = parseSubtasks(result.text);
    return items.length ? { status: 'ok', items } : { status: 'error', error: 'unknown' };
  }

  /** Chosen model first, then the Flash aliases when it is retired or overloaded. */
  private async generate(payload: object): Promise<AiResult<{ text: string; model: string }>> {
    const key = await this.secrets.get(API_KEY_KEY);
    if (!key) return { status: 'error', error: 'not-configured' };
    const { model: chosen } = await this.load();
    const candidates = [...new Set([chosen, ...FALLBACK_MODELS])];
    let last: AiResult<{ text: string; model: string }> = { status: 'error', error: 'unknown' };
    let retired = false;
    for (const model of candidates) {
      last = await this.generateWith(model, key, payload);
      if (last.status === 'ok') {
        // The chosen model was retired by Google: keep the one that answered.
        if (retired && model !== chosen) await this.rememberModel(model);
        break;
      }
      if (model === chosen && last.error === 'model') retired = true;
      if (last.error !== 'model' && last.error !== 'unavailable') break;
    }
    return last;
  }

  private async rememberModel(model: string): Promise<void> {
    const settings = { ...(await this.load()), model };
    this.settings = Promise.resolve(settings);
    await this.persist(settings);
  }

  private async generateWith(
    model: string,
    key: string,
    payload: object,
  ): Promise<AiResult<{ text: string; model: string }>> {
    const response = await this.request(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
      key,
      { method: 'POST', body: JSON.stringify(payload) },
    );
    if (response.status === 'error') return response;
    const body = response.body as GenerateResponse;
    if (body.promptFeedback?.blockReason) return { status: 'error', error: 'blocked' };
    const output = extractText(body);
    if (!output) {
      const reason = body.candidates?.[0]?.finishReason;
      return { status: 'error', error: reason === 'SAFETY' ? 'blocked' : 'unknown' };
    }
    return { status: 'ok', text: output, model };
  }

  private async request(
    url: string,
    key: string,
    init: RequestInit,
  ): Promise<{ status: 'ok'; body: unknown } | { status: 'error'; error: AiError }> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // A timeout usually means an overloaded model: let the caller try another one.
      const name = (error as { name?: string } | null)?.name;
      return { status: 'error', error: name === 'TimeoutError' ? 'unavailable' : 'network' };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Non-JSON error page.
    }
    if (!response.ok) return { status: 'error', error: classifyHttpError(response.status, body) };
    return { status: 'ok', body };
  }

  private load(): Promise<AiSettings> {
    this.settings ??= readFile(this.settingsFile, 'utf8')
      .then((raw) => {
        const { model, account } = JSON.parse(raw) as Partial<AiSettings>;
        return {
          model: typeof model === 'string' && MODEL_PATTERN.test(model) ? model : DEFAULT_MODEL,
          ...(typeof account === 'string' && account.length <= 254 ? { account } : {}),
        };
      })
      .catch(() => ({ model: DEFAULT_MODEL }));
    return this.settings;
  }

  /** Serializes writes and replaces the file atomically. */
  private persist(settings: AiSettings): Promise<void> {
    const snapshot = JSON.stringify(settings, null, 2);
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(path.dirname(this.settingsFile), { recursive: true });
        const tempPath = `${this.settingsFile}.tmp`;
        await writeFile(tempPath, snapshot, { encoding: 'utf8', mode: 0o600 });
        await rename(tempPath, this.settingsFile);
      });
    return this.writeQueue;
  }
}
