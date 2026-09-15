import type { InstructionKind } from './schema';

export const ROTULOS_DE_INSTRUCAO: Record<InstructionKind, string> = {
  instruments: 'Instrumentos',
  repeat_praise: 'Repetir o louvor',
  back_to_chorus: 'Voltar ao coro',
  back_to_chorus_and_finish: 'Voltar ao coro e finalizar',
};

/** Sem espaço quando a leitura começa com pontuação que gruda na palavra anterior. */
export function separadorDaLinha(text: string): '' | ' ' {
  if (!text) return '';
  return /^[,.;:!?)\]]/.test(text) ? '' : ' ';
}
