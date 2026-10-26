import type { EmailKind, EmailSendResult } from '../../../../electron/ipc/contract';

/** Notification kinds that can be forwarded by e-mail, as shown in Settings. */
export const EMAIL_KIND_OPTIONS: readonly { value: EmailKind; label: string; hint: string }[] = [
  { value: 'reminder', label: 'Lembretes de tarefas', hint: 'No horário de cada lembrete' },
  { value: 'digest', label: 'Resumo de prazos', hint: 'Atrasadas e vencendo em breve' },
  { value: 'custom', label: 'Notificações personalizadas', hint: 'Seus avisos recorrentes' },
  { value: 'focus', label: 'Fim de sessão de foco', hint: 'Quando o cronômetro termina' },
];

export const GMAIL_APP_PASSWORDS_URL = 'https://myaccount.google.com/apppasswords';

/** User-facing explanation of an e-mail delivery result (null when sent). */
export function emailResultMessage(result: EmailSendResult): string | null {
  if (result.status === 'sent') return null;
  if (result.status === 'skipped') {
    switch (result.reason) {
      case 'not-configured':
        return 'Informe o endereço do Gmail e a senha de app antes de enviar.';
      case 'rate-limited':
        return 'Limite de e-mails por hora atingido. Tente novamente mais tarde.';
      default:
        return 'O envio por e-mail está desativado para este tipo de notificação.';
    }
  }
  switch (result.error) {
    case 'auth':
      return 'O Gmail recusou o login. Use uma senha de app (16 letras), não a senha da conta.';
    case 'network':
      return 'Não foi possível conectar ao Gmail (smtp.gmail.com). Verifique a internet.';
    default:
      return 'Não foi possível enviar o e-mail.';
  }
}
