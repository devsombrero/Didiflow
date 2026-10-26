import type { AiConnectResult, AiError } from '../../../../electron/ipc/contract';

export const AI_STUDIO_KEYS_URL = 'https://aistudio.google.com/apikey';
export const DEFAULT_AI_MODEL = 'gemini-2.5-flash';

/** Shown until the key lists the models it can use. */
export const FALLBACK_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite' },
];

export const QUICK_PROMPTS: readonly { label: string; icon: string; prompt: string }[] = [
  {
    label: 'Resumo do meu dia',
    icon: 'wb_sunny',
    prompt: 'Faça um resumo do meu dia: o que está atrasado, o que vence hoje e as horas de hoje.',
  },
  {
    label: 'O que priorizar agora?',
    icon: 'priority_high',
    prompt: 'Quais 3 tarefas devo priorizar agora e por quê?',
  },
  {
    label: 'Planejar a semana',
    icon: 'date_range',
    prompt: 'Monte um plano para os próximos 5 dias úteis com as minhas tarefas abertas.',
  },
  {
    label: 'Tarefas em risco',
    icon: 'warning',
    prompt: 'Quais tarefas estão em risco de atrasar e o que posso fazer para evitar?',
  },
];

export const PRIVACY_NOTICE =
  'O DidiBot usa a API Gemini no plano gratuito do Google, que pode usar o conteúdo enviado para melhorar seus produtos. Não envie dados sensíveis.';

type ConnectError = Extract<AiConnectResult, { status: 'error' }>['error'];

/** Shown while the Google sign-in and key creation run. */
export const CONNECTING_MESSAGE =
  'Conclua o login com a sua conta Google no navegador. Em seguida o DidiFlow cria a chave do Gemini automaticamente.';

export function connectErrorMessage(error: ConnectError): string {
  switch (error) {
    case 'not-configured':
      return 'Este aplicativo não tem o login com Google configurado. Use uma chave própria.';
    case 'cancelled':
      return 'Login com Google cancelado.';
    case 'denied':
      return 'Sem a permissão do Google Cloud não é possível criar a chave. Tente de novo e aceite todas as permissões.';
    case 'timeout':
      return 'O login no navegador não foi concluído a tempo. Tente de novo.';
    case 'tos':
      return 'Aceite uma vez os Termos de Serviço do Google Cloud em console.cloud.google.com e tente de novo.';
    case 'permission':
      return 'Esta conta Google não pode criar projetos (contas de empresa costumam bloquear). Use uma chave própria.';
    case 'network':
      return 'Sem conexão com o Google. Verifique a internet.';
    default:
      return 'Não foi possível criar a chave automaticamente. Tente de novo ou use uma chave própria.';
  }
}

export function aiErrorMessage(error: AiError): string {
  switch (error) {
    case 'not-configured':
      return 'Conecte sua conta Google em Configurações → DidiBot para usar o assistente.';
    case 'auth':
      return 'A chave da API Gemini foi recusada. Gere uma nova no Google AI Studio.';
    case 'quota':
      return 'Limite gratuito da API Gemini atingido. Aguarde um pouco e tente de novo.';
    case 'model':
      return 'O modelo escolhido não está disponível para esta chave. Escolha outro em Configurações → DidiBot.';
    case 'blocked':
      return 'O Gemini não respondeu por causa dos filtros de segurança. Reformule a pergunta.';
    case 'network':
      return 'Sem conexão com o Google. Verifique a internet.';
    case 'unavailable':
      return 'O serviço do Gemini está instável no momento. Tente de novo em instantes.';
    default:
      return 'O DidiBot não conseguiu responder. Tente de novo.';
  }
}
