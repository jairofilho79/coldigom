import type { ValidationFinding } from '../../types';

export type Grupo = { chave: string; titulo: string; itens: ValidationFinding[] };

/**
 * Os candidatos concorrentes do mesmo louvor ficam juntos. É a resposta ao
 * teto estrutural da faixa média (RESIDUOS-P2.md): uma fonte com 7 candidatos
 * gera 7 achados, e só um pode estar certo — decidir um de cada vez, sem ver
 * os outros, é o que a tela não pode permitir.
 *
 * Mora fora da ValidationQueuePage porque um arquivo que exporta componente e
 * função junto quebra o fast refresh do Vite (react-refresh/only-export-components).
 */
export function agruparPorAlvo(findings: ValidationFinding[]): Grupo[] {
  const grupos = new Map<string, ValidationFinding[]>();
  for (const f of findings) {
    const chave = f.praise_id ?? f.target_id;
    const lista = grupos.get(chave);
    if (lista) lista.push(f);
    else grupos.set(chave, [f]);
  }
  return [...grupos.entries()].map(([chave, itens]) => ({
    chave,
    titulo: itens[0].target_name ?? itens[0].target_id,
    itens,
  }));
}
