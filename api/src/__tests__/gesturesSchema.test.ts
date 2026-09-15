import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MENSAGENS, validarDocumento, type CodigoDeErro } from '../gestures/schema';

/**
 * O validador é espelhado em web/src/lib/gestures/schema.ts, e o teste de lá lê
 * ESTA mesma pasta de fixtures. Provar comportamento igual sobre o mesmo corpo de
 * casos é o que segura o espelho — não a comparação de texto dos dois arquivos.
 */
const FIXTURES = resolve(__dirname, '..', 'gestures', '__fixtures__');
const ler = (nome: string) => JSON.parse(readFileSync(resolve(FIXTURES, nome), 'utf8'));

/** Item de gesto válido que as fixtures inválidas abreviam como "BASE". */
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

describe('validarDocumento — fixtures compartilhadas', () => {
  it('aceita o exemplo da spec', () => {
    const r = validarDocumento(ler('valido-exemplo.json'));
    expect(r.ok).toBe(true);
  });

  it('aceita o documento mínimo', () => {
    expect(validarDocumento(ler('valido-minimo.json')).ok).toBe(true);
  });

  it('devolve o próprio documento tipado quando aceita', () => {
    const doc = ler('valido-minimo.json');
    const r = validarDocumento(doc);
    if (!r.ok) throw new Error('deveria aceitar');
    expect(r.doc).toBe(doc);
  });

  const invalidos = ler('invalidos.json') as CasoInvalido[];
  for (const caso of invalidos) {
    it(`recusa: ${caso.nome} → ${caso.codigo} em "${caso.caminho}"`, () => {
      const r = validarDocumento(expandir(caso.doc));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro.codigo).toBe(caso.codigo);
      expect(r.erro.caminho).toBe(caso.caminho);
    });
  }

  it('toda fixture inválida usa um código que tem frase', () => {
    for (const caso of invalidos) expect(MENSAGENS[caso.codigo]).toBeTruthy();
  });

  it('a tabela tem os 21 códigos da spec, todos com frase em português', () => {
    expect(Object.keys(MENSAGENS).sort()).toEqual([
      'bloco_vazio', 'documento_grande', 'final_duplicado', 'final_fora_da_raiz',
      'gesture_id_invalido', 'instrucao_desconhecida', 'instrucao_fora_da_raiz',
      'item_depois_do_final', 'itens_vazios', 'json_invalido', 'letras_fora_do_limite',
      'linha_invalida', 'link_com_filhos_invalidos', 'primeira_linha_vazia',
      'repeticao_invalida', 'schema_desconhecido', 'sem_gesto', 'texto_invalido',
      'tipo_desconhecido', 'titulo_invalido', 'versao_dicionario_invalida',
    ]);
    for (const frase of Object.values(MENSAGENS)) expect(frase.length).toBeGreaterThan(10);
  });
});
