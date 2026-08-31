import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_ITEMS,
  fatiarLote,
  problemaDoArquivo,
} from '../lib/uploadLimits';

describe('limites de upload no cliente', () => {
  it('acusa arquivo acima do teto por arquivo', () => {
    expect(problemaDoArquivo({ type: 'pdf', sizeBytes: MAX_UPLOAD_BYTES + 1 })).toBe('grande');
    expect(problemaDoArquivo({ type: 'pdf', sizeBytes: MAX_UPLOAD_BYTES })).toBeNull();
  });

  it('acusa o tipo que a API recusaria, e que hoje derruba o lote inteiro', () => {
    // Arquivo sem extensão: `inferTypeFromExtension` devolve o nome inteiro.
    expect(problemaDoArquivo({ type: 'louvor 42' })).toBe('tipo');
    expect(problemaDoArquivo({ type: 'ds_store' })).toBe('tipo');
    expect(problemaDoArquivo({ type: 'mid' })).toBeNull();
  });

  it('deixa passar arquivo cujo tamanho é desconhecido', () => {
    // Itens do Drive nem sempre trazem size_bytes; quem decide é o servidor.
    expect(problemaDoArquivo({ type: 'pdf' })).toBeNull();
  });

  it('fatia o lote no tamanho que a API aceita', () => {
    const itens = Array.from({ length: MAX_UPLOAD_ITEMS * 2 + 3 }, (_, i) => i);
    const fatias = fatiarLote(itens);
    expect(fatias).toHaveLength(3);
    expect(fatias[0]).toHaveLength(MAX_UPLOAD_ITEMS);
    expect(fatias[2]).toHaveLength(3);
    expect(fatias.flat()).toEqual(itens);
  });

  it('não fatia o que já cabe numa requisição', () => {
    expect(fatiarLote([1, 2, 3])).toEqual([[1, 2, 3]]);
    expect(fatiarLote([])).toEqual([]);
  });
});
