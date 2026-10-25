const POSTGRES_MESSAGES: Record<string, string> = {
  '23514': 'Dados inválidos. Verifique datas, links e valores informados.',
  '23503': 'Um item relacionado não existe mais ou não pertence a você.',
  '23505': 'Já existe um item com esse nome.',
  '42501': 'Você não tem permissão para esta operação.',
  '22023': 'Valor inválido.',
  PGRST116: 'Item não encontrado.',
};

/** User-facing (pt-BR) message for a Supabase/PostgREST or network error. */
export function describeError(
  error: unknown,
  fallback = 'Não foi possível concluir a operação.',
): string {
  if (typeof error === 'object' && error !== null) {
    const { code, message, hint } = error as { code?: unknown; message?: unknown; hint?: unknown };
    if (hint === 'attachment_quota') {
      return 'Os anexos desta tarefa ultrapassariam o limite de 50 MB.';
    }
    if (typeof code === 'string' && POSTGRES_MESSAGES[code]) {
      return POSTGRES_MESSAGES[code];
    }
    if (typeof message === 'string' && /fetch|network/i.test(message)) {
      return 'Não foi possível conectar ao servidor. Verifique sua conexão.';
    }
  }
  return fallback;
}
