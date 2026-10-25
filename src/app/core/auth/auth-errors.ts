import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';

/** Auth failure with a user-facing (pt-BR) message. */
export class AuthFailure extends Error {
  override readonly name = 'AuthFailure';

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  email_exists: 'Já existe uma conta com este e-mail.',
  weak_password:
    'Senha fraca. Use ao menos 8 caracteres com letras maiúsculas, minúsculas e números.',
  same_password: 'A nova senha deve ser diferente da atual.',
  otp_expired: 'Código inválido ou expirado. Solicite um novo código.',
  email_address_invalid: 'Endereço de e-mail inválido.',
  over_email_send_rate_limit: 'Muitos e-mails enviados. Aguarde alguns minutos e tente novamente.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde alguns instantes e tente novamente.',
  signup_disabled: 'Novos cadastros estão desativados.',
  network: 'Não foi possível conectar ao servidor. Verifique sua conexão.',
};

const FALLBACK = 'Não foi possível concluir a operação. Tente novamente.';

export function toAuthFailure(error: unknown): AuthFailure {
  if (error instanceof AuthFailure) return error;

  if (isAuthRetryableFetchError(error)) {
    return new AuthFailure('network', MESSAGES['network']);
  }
  if (isAuthError(error)) {
    const code = error.code ?? 'unknown';
    return new AuthFailure(code, MESSAGES[code] ?? FALLBACK);
  }
  return new AuthFailure('unknown', FALLBACK);
}
