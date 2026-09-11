import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { GestureDocument } from '../../../lib/gestures/schema';
import { indexar } from '../../../lib/gestures/dictionary';
import { GestureDocumentView } from '../GestureDocumentView';
import { separadorDaLinha } from '../../../lib/gestures/render';

const FIXTURES = resolve(__dirname, '..', '..', '..', '..', '..', 'api', 'src', 'gestures', '__fixtures__');
const exemplo = JSON.parse(readFileSync(resolve(FIXTURES, 'valido-exemplo.json'), 'utf8')) as GestureDocument;

const indice = indexar({
  schema: 'coldigom.gesture-dictionary/1',
  version: 1,
  generatedAt: 't',
  gestures: [
    { id: 'c687580e7682', name: 'Quero', description: '', exampleTriggers: [], image: 'assets/cia/gestures/c687580e7682.png', gif: null, status: 'active', replacedBy: null, updatedAt: 't' },
    { id: 'deadbeef0005', name: 'Amém velho', description: '', exampleTriggers: [], image: 'assets/cia/gestures/deadbeef0005.png', gif: null, status: 'deprecated', replacedBy: 'c687580e7682', updatedAt: 't' },
  ],
});

describe('GestureDocumentView — o exemplo da spec', () => {
  it('desenha o CORO com chave tracejada sobre os 5 primeiros cartões', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    const coro = container.querySelector('.gv-coro')!;
    expect(coro.querySelector('.gv-rotulo')?.textContent).toBe('CORO');
    expect(coro.querySelectorAll(':scope > .gv-filhos > .gv-gesto')).toHaveLength(5);
    expect(coro.querySelector('.gv-chave--tracejada')).not.toBeNull();
  });

  it('gatilho em negrito vermelho por classe, leitura ao lado, sem espaço antes de vírgula', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    const linhas = container.querySelectorAll('.gv-coro .gv-gesto')[1].querySelectorAll('.gv-linha');
    expect(linhas[0].querySelector('.gv-gatilho')?.textContent).toBe('viver');
    expect(linhas[0].textContent).toBe('viver, viver com Ele');
    const primeiro = container.querySelector('.gv-coro .gv-gesto .gv-linha')!;
    expect(primeiro.textContent).toBe('Quero viver pra sempre com Jesus');
  });

  it('linha de continuação (trigger vazio) sai só com a leitura', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    const terceiro = container.querySelectorAll('.gv-coro .gv-gesto')[2];
    const linhas = terceiro.querySelectorAll('.gv-linha');
    expect(linhas).toHaveLength(2);
    expect(linhas[1].querySelector('.gv-gatilho')).toBeNull();
    expect(linhas[1].textContent).toBe('e na terra também');
  });

  it('repetição com Nx, link com conector, FINAL com divisor, duas instruções e o texto livre', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    expect(container.querySelector('.gv-repeat .gv-vezes')?.textContent).toBe('2x');
    expect(container.querySelector('.gv-repeat .gv-link .gv-conector')).not.toBeNull();
    expect(container.querySelector('.gv-final .gv-divisor')?.textContent).toBe('FINAL');
    expect(screen.getByText('Voltar ao coro')).toHaveClass('gv-instrucao');
    expect(screen.getByText('Voltar ao coro e finalizar')).toHaveClass('gv-instrucao');
    expect(screen.getByText('(pausa para os instrumentos)')).toHaveClass('gv-texto');
  });

  it('contagem do repeat é lida por leitor de tela, e a chave visual continua aria-hidden', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    expect(container.querySelector('.gv-repeat .gv-sr')?.textContent).toBe('Repetir 2 vezes');
    expect(container.querySelector('.gv-repeat .gv-vezes')?.textContent).toBe('2x');
    expect(container.querySelector('.gv-repeat .gv-chave')).toHaveAttribute('aria-hidden', 'true');
  });

  it('título em caixa alta no topo', () => {
    render(<GestureDocumentView doc={exemplo} indice={indice} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('182 - QUERO VIVER PRA SEMPRE COM JESUS');
  });

  it('figura do dicionário quando existe; placeholder de gesto ausente quando não; alias usa a figura do substituto', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    const figuras = container.querySelectorAll('.gv-gesto');
    expect(figuras[0].querySelector('img')?.getAttribute('src')).toContain('assets/cia/gestures/c687580e7682.png');
    expect(figuras[1].querySelector('.gv-figura--ausente')).not.toBeNull();
    const amem = container.querySelector('.gv-final .gv-gesto')!;
    expect(amem.querySelector('img')?.getAttribute('src')).toContain('c687580e7682.png');
    expect(amem.querySelector('img')).toHaveClass('gv-figura--alias');
  });

  it('sem dicionário, todo gesto é placeholder — e o documento ainda renderiza', () => {
    const { container } = render(<GestureDocumentView doc={exemplo} indice={null} />);
    expect(container.querySelectorAll('.gv-figura--ausente')).toHaveLength(9);
  });

  it('tamanho da figura: 96 por padrão, 64 no editor', () => {
    const a = render(<GestureDocumentView doc={exemplo} indice={indice} />);
    expect(a.container.querySelector('.gv-gesto img')).toHaveAttribute('width', '96');
    a.unmount();
    const b = render(<GestureDocumentView doc={exemplo} indice={indice} tamanhoDaFigura={64} />);
    expect(b.container.querySelector('.gv-gesto img')).toHaveAttribute('width', '64');
  });

  it('cada cartão carrega data-caminho, o em foco ganha classe, e clicar avisa', () => {
    const cliques: string[] = [];
    const { container } = render(
      <GestureDocumentView doc={exemplo} indice={indice} emFoco="items[1].children[1].children[0]" onClicarCartao={(c) => cliques.push(c)} />
    );
    const alvo = container.querySelector('[data-caminho="items[1].children[1].children[0]"]')!;
    expect(alvo).toHaveClass('is-foco');
    (alvo as HTMLElement).click();
    expect(cliques).toEqual(['items[1].children[1].children[0]']);
  });

  it('tipo desconhecido renderiza como texto livre', () => {
    const doc = { ...exemplo, items: [...exemplo.items, { type: 'novo', text: 'do futuro' }] } as unknown as GestureDocument;
    render(<GestureDocumentView doc={doc} indice={indice} />);
    expect(screen.getByText('do futuro')).toHaveClass('gv-texto');
  });
});

describe('separadorDaLinha', () => {
  it('sem espaço antes de , . ; : ! ? ) ]', () => {
    for (const ch of [',', '.', ';', ':', '!', '?', ')', ']']) expect(separadorDaLinha(`${ch}x`)).toBe('');
    expect(separadorDaLinha('viver')).toBe(' ');
    expect(separadorDaLinha('')).toBe('');
  });
});

describe('regras.css — as cores da spec, verbatim', () => {
  it('cada cor está declarada como custom property com o tom exato', () => {
    const css = readFileSync(resolve(__dirname, '..', 'regras.css'), 'utf8');
    for (const [prop, cor] of [
      ['--gesto-papel', '#FFFFFF'], ['--gesto-gatilho', '#D32F2F'], ['--gesto-leitura', '#1A1A1A'],
      ['--gesto-bloco', '#1E63C8'], ['--gesto-conector-link', '#E08A1E'], ['--gesto-final', '#6A2F2F'],
      ['--gesto-instrucao-fundo', '#F3F4F6'], ['--gesto-instrucao-texto', '#374151'], ['--gesto-instrucao-borda', '#D1D5DB'],
      ['--gesto-ausente-fundo', '#FFF7E6'], ['--gesto-ausente-borda', '#E0B45C'], ['--gesto-texto-livre', '#6B7280'],
    ]) {
      expect(css, prop).toMatch(new RegExp(`${prop}:\\s*${cor};`, 'i'));
    }
    expect(css).toMatch(/max-width:\s*720px/);
    expect(css).toMatch(/\.gv-gatilho\s*{[^}]*white-space:\s*nowrap/);
  });

  it('o divisor do FINAL desenha o traço com um pseudo-elemento, não com border-image', () => {
    const css = readFileSync(resolve(__dirname, '..', 'regras.css'), 'utf8');
    expect(css).toMatch(/\.gv-final > \.gv-divisor::before\s*{[^}]*repeating-linear-gradient/);
    expect(css).not.toMatch(/border-image/);
  });
});
