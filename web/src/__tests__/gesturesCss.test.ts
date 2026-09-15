import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * F1: o app é escuro (design-system.css declara `color-scheme: dark`), mas os
 * blocos `.ge-*`/`.gd-*` do editor de gestos nasceram com fundo branco fixo —
 * botão, cartão e seletor ficavam branco sobre branco. Este teste lê o CSS puro
 * (sem jsdom, que não calcula cor herdada) e garante que a cor fixa não volta.
 */
describe('global.css — o editor de gestos usa os tokens escuros da casa', () => {
  const css = readFileSync(resolve(__dirname, '..', 'styles', 'global.css'), 'utf8');
  // Vai até o fim do arquivo, não só até `.gd-page`: o bloco `.gd-*` (tabela,
  // figuras, usos) continua depois dele, e um corte cedo demais deixava essas
  // regras fora da varredura — a re-revisão pegou isso.
  const blocoGe = css.slice(css.indexOf('.ge-editor'));

  it('não tem fundo branco fixo (#fff/#ffffff) no bloco .ge-*/.gd-*', () => {
    expect(blocoGe).not.toMatch(/background(-color)?:\s*#fff(fff)?\b/i);
  });

  it('.ge-btn e .ge-cartao declaram `color`, não só `background`', () => {
    const regraBtn = /\.ge-btn\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    const regraCartao = /\.ge-cartao\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(regraBtn).toMatch(/color:/);
    expect(regraCartao).toMatch(/color:/);
  });
});
