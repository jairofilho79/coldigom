import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MENSAGENS, validarDocumento, type CodigoDeErro } from '../schema';

/**
 * Este arquivo é o espelho de api/src/gestures/schema.ts. O teste lê a MESMA
 * pasta de fixtures da API — por fs, não por import, para não arrastar arquivos
 * de fora de src/ pelo Vite. Comportamento igual sobre o mesmo corpo de casos é
 * o que segura o espelho.
 */
const FIXTURES = resolve(__dirname, '..', '..', '..', '..', '..', 'api', 'src', 'gestures', '__fixtures__');
const ler = (nome: string) => JSON.parse(readFileSync(resolve(FIXTURES, nome), 'utf8'));

const BASE = { type: 'gesture', gestureId: '000000000001', lyrics: [{ trigger: 'a', text: 'b' }] };
function expandir(valor: unknown): unknown {
  if (valor === 'BASE') return BASE;
  if (Array.isArray(valor)) return valor.map(expandir);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, expandir(v)]));
  }
  return valor;
}

type CasoInvalido = { nome: string; doc: unknown; codigo: CodigoDeErro; caminho: string };

describe('validarDocumento (espelho do web) — fixtures da API', () => {
  it('aceita os documentos válidos', () => {
    expect(validarDocumento(ler('valido-exemplo.json')).ok).toBe(true);
    expect(validarDocumento(ler('valido-minimo.json')).ok).toBe(true);
  });

  for (const caso of ler('invalidos.json') as CasoInvalido[]) {
    it(`recusa: ${caso.nome} → ${caso.codigo} em "${caso.caminho}"`, () => {
      const r = validarDocumento(expandir(caso.doc));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro.codigo).toBe(caso.codigo);
      expect(r.erro.caminho).toBe(caso.caminho);
      expect(MENSAGENS[r.erro.codigo]).toBeTruthy();
    });
  }
});

describe('o espelho é cópia da API', () => {
  it('o corpo dos dois arquivos é idêntico fora do comentário de cabeçalho', () => {
    const semCabecalho = (s: string) => s.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '');
    const api = readFileSync(resolve(FIXTURES, '..', 'schema.ts'), 'utf8');
    const web = readFileSync(resolve(__dirname, '..', 'schema.ts'), 'utf8');
    expect(semCabecalho(web)).toBe(semCabecalho(api));
  });
});
