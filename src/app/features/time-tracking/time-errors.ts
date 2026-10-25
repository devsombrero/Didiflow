import { describeError } from '../../shared/utils/errors';

/** Messages for time tracking, including the single-running-timer rule. */
export function describeTimeError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const { code, hint } = error as { code?: unknown; hint?: unknown };
    if (hint === 'timer_running' || code === '23505') {
      return 'Já existe um cronômetro em andamento. Finalize-o antes de iniciar outro.';
    }
    if (code === '23514') {
      return 'Período inválido: o fim deve ser posterior ao início e o registro não pode passar de 24 horas.';
    }
  }
  return describeError(error, 'Não foi possível registrar o tempo.');
}
