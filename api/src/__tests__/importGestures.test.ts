import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ehObjetoAusente, gerarSql, lerExport, main, planejar, resumo, type EstadoAtual } from '../../scripts/import_gestures';

const EXPORT = resolve(__dirname, '..', '..', 'scripts', '__fixtures__', 'gestures-export');

function estadoVazio(): EstadoAtual {
  return { dicionario: new Map(), materiais: new Map(), louvores: new Set(['p1', 'p2']), documentos: new Map() };
}

/** Estado onde tudo o que o export traz já está gravado, byte a byte. */
function estadoEmDia(): EstadoAtual {
  const exp = lerExport(EXPORT);
  const estado = estadoVazio();
  for (const g of exp.dicionario.gestures) {
    estado.dicionario.set(g.id, {
      id: g.id, name: g.name, description: g.description, example_triggers: JSON.stringify(g.exampleTriggers),
      image_key: `assets/cia/gestures/${g.id}.png`, gif_key: null, status: g.status, replaced_by: g.replacedBy,
      created_at: 't', updated_at: 't',
    });
  }
  for (const d of exp.documentos) {
    estado.materiais.set(d.txtId, { praise_id: d.praiseId, type: 'gestures', r2_key: `assets/praises/${d.praiseId}/${d.txtId}.gestures`, is_reviewed: 0, material_kind: 'k-gestos' });
    estado.documentos.set(d.txtId, JSON.stringify(d.doc));
  }
  return estado;
}

describe('lerExport', () => {
  it('lê dicionário, figuras e documentos com meta', () => {
    const exp = lerExport(EXPORT);
    expect(exp.dicionario.gestures.map((g) => g.id)).toEqual(['c687580e7682', 'a1b2c3d4e5f6']);
    expect([...exp.figuras.keys()].sort()).toEqual(['a1b2c3d4e5f6', 'c687580e7682']);
    expect(exp.documentos.map((d) => [d.praiseId, d.txtId, d.meta.sourceMaterialId])).toEqual([
      ['p1', 'txt-1', 'pdf-1'],
      ['p2', 'txt-2', null],
    ]);
  });

  it('falha alto e inteiro se um documento for inválido, dizendo o caminho', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gestos-'));
    cpSync(EXPORT, dir, { recursive: true });
    writeFileSync(
      join(dir, 'praises', 'p2', 'txt-2.gestures.json'),
      JSON.stringify({ schema: 'coldigom.gestures/1', title: 'x', dictionaryVersion: 1, items: [{ type: 'gesture', gestureId: 'zz', lyrics: [] }] })
    );
    expect(() => lerExport(dir)).toThrow(/txt-2\.gestures\.json: gesture_id_invalido em items\[0\]\.gestureId/);
    rmSync(dir, { recursive: true });
  });
});

describe('planejar', () => {
  it('estado vazio: cria tudo, e a versão sobe', () => {
    const plano = planejar(lerExport(EXPORT), estadoVazio(), { force: false, materialKind: 'k-gestos' });
    expect(plano.dicionario.criar.map((g) => g.id)).toEqual(['c687580e7682', 'a1b2c3d4e5f6']);
    expect(plano.documentos.criar.map((d) => d.materialId)).toEqual(['txt-1', 'txt-2']);
    expect(plano.documentos.criar[0].r2Key).toBe('assets/praises/p1/txt-1.gestures');
    expect(plano.documentos.criar[0].sourceMaterialId).toBe('pdf-1');
    expect(plano.versaoSobe).toBe(true);
  });

  it('segunda passada é no-op', () => {
    const plano = planejar(lerExport(EXPORT), estadoEmDia(), { force: false });
    expect(plano.dicionario.criar).toEqual([]);
    expect(plano.dicionario.atualizar).toEqual([]);
    expect(plano.dicionario.iguais).toBe(2);
    expect(plano.documentos.criar).toEqual([]);
    expect(plano.documentos.atualizar).toEqual([]);
    expect(plano.documentos.iguais).toBe(2);
    expect(plano.versaoSobe).toBe(false);
    expect(gerarSql(plano).trim()).toBe('');
  });

  it('documento revisado e diferente: pula sem --force, atualiza com --force', () => {
    const estado = estadoEmDia();
    estado.materiais.get('txt-1')!.is_reviewed = 1;
    estado.documentos.set('txt-1', '{"schema":"coldigom.gestures/1","title":"antigo","dictionaryVersion":0,"items":[]}');
    const sem = planejar(lerExport(EXPORT), estado, { force: false });
    expect(sem.documentos.pular.map((d) => d.materialId)).toEqual(['txt-1']);
    expect(sem.documentos.atualizar).toEqual([]);
    const com = planejar(lerExport(EXPORT), estado, { force: true });
    expect(com.documentos.atualizar.map((d) => d.materialId)).toEqual(['txt-1']);
    expect(com.documentos.pular).toEqual([]);
  });

  it('louvor que não existe no D1 vai para semLouvor, não para criar', () => {
    const estado = estadoVazio();
    estado.louvores.delete('p2');
    const plano = planejar(lerExport(EXPORT), estado, { force: false, materialKind: 'k' });
    expect(plano.documentos.semLouvor.map((d) => d.materialId)).toEqual(['txt-2']);
    expect(plano.documentos.criar.map((d) => d.materialId)).toEqual(['txt-1']);
  });

  it('material_kind vem da linha de gestos mais comum quando não é informado', () => {
    const estado = estadoEmDia();
    estado.materiais.delete('txt-2');
    const plano = planejar(lerExport(EXPORT), estado, { force: false });
    expect(plano.materialKind).toBe('k-gestos');
    expect(plano.documentos.criar[0].materialId).toBe('txt-2');
  });

  it('sem material_kind possível e com linha a criar, lança', () => {
    expect(() => planejar(lerExport(EXPORT), estadoVazio(), { force: false })).toThrow(/material-kind/);
  });

  it('entrada do dicionário que mudou vai para atualizar', () => {
    const estado = estadoEmDia();
    estado.dicionario.get('c687580e7682')!.name = 'Nome velho';
    const plano = planejar(lerExport(EXPORT), estado, { force: false });
    expect(plano.dicionario.atualizar.map((g) => g.id)).toEqual(['c687580e7682']);
    expect(plano.versaoSobe).toBe(true);
  });

  it('documento gravado com chaves em outra ordem conta como igual', () => {
    const estado = estadoEmDia();
    const doc = lerExport(EXPORT).documentos[0].doc;
    const comOutraOrdem = JSON.stringify({
      items: doc.items.map((i) => ({ lyrics: (i as any).lyrics, gestureId: (i as any).gestureId, type: i.type })),
      dictionaryVersion: doc.dictionaryVersion,
      title: doc.title,
      schema: doc.schema,
    });
    estado.documentos.set('txt-1', comOutraOrdem);
    const plano = planejar(lerExport(EXPORT), estado, { force: false });
    expect(plano.documentos.iguais).toBe(2);
    expect(plano.documentos.atualizar).toEqual([]);
  });
});

describe('gerarSql', () => {
  it('um único bump de versão para a importação inteira, e o uso recomputado por documento', () => {
    const sql = gerarSql(planejar(lerExport(EXPORT), estadoVazio(), { force: false, materialKind: 'k-gestos' }));
    expect(sql.match(/UPDATE gesture_dictionary_meta SET version = version \+ 1/g)).toHaveLength(1);
    expect(sql.match(/INSERT INTO gesture_dictionary/g)).toHaveLength(2);
    expect(sql.match(/INSERT INTO praise_materials/g)).toHaveLength(2);
    expect(sql).toContain("'assets/praises/p1/txt-1.gestures'");
    expect(sql.match(/DELETE FROM gesture_usage WHERE material_id = /g)).toHaveLength(2);
    expect(sql.match(/INSERT INTO gesture_usage/g)).toHaveLength(3);
  });

  it('atualização com --force zera a marca de revisão, como o PUT faz', () => {
    const estado = estadoEmDia();
    estado.materiais.get('txt-1')!.is_reviewed = 1;
    estado.documentos.set('txt-1', '{}');
    const sql = gerarSql(planejar(lerExport(EXPORT), estado, { force: true }));
    expect(sql).toMatch(/UPDATE praise_materials SET is_reviewed = 0, reviewed_at = NULL, reviewed_by = NULL, .* WHERE id = 'txt-1'/);
  });

  it('o resumo do dry-run lista criar/atualizar/pular por seção', () => {
    const texto = resumo(planejar(lerExport(EXPORT), estadoVazio(), { force: false, materialKind: 'k' }));
    expect(texto).toMatch(/dicionário.*criar: 2/i);
    expect(texto).toMatch(/documentos.*criar: 2/i);
  });

  it('atualização com --force preenche source_material_id e r2_key só quando estavam nulos (COALESCE)', () => {
    const estado = estadoEmDia();
    estado.materiais.get('txt-1')!.is_reviewed = 1;
    estado.documentos.set('txt-1', '{}');
    const sql = gerarSql(planejar(lerExport(EXPORT), estado, { force: true }));
    expect(sql).toContain("COALESCE(source_material_id, 'pdf-1')");
    expect(sql).toContain("COALESCE(r2_key, 'assets/praises/p1/txt-1.gestures')");
  });
});

describe('ehObjetoAusente', () => {
  it('NoSuchKey é ausência', () => {
    const err = Object.assign(new Error('not found'), { name: 'NoSuchKey' });
    expect(ehObjetoAusente(err)).toBe(true);
  });

  it('404 nos metadados é ausência', () => {
    expect(ehObjetoAusente({ $metadata: { httpStatusCode: 404 } })).toBe(true);
  });

  it('erro genérico não é ausência', () => {
    expect(ehObjetoAusente(new Error('AccessDenied'))).toBe(false);
  });

  it('403 nos metadados não é ausência', () => {
    expect(ehObjetoAusente({ $metadata: { httpStatusCode: 403 } })).toBe(false);
  });
});

describe('planejar — linha revisada sem objeto no R2', () => {
  it('vai para atualizar mesmo com is_reviewed = 1 e sem --force: não há o que sobrescrever', () => {
    const estado = estadoEmDia();
    estado.materiais.get('txt-1')!.is_reviewed = 1;
    estado.documentos.delete('txt-1');
    const plano = planejar(lerExport(EXPORT), estado, { force: false });
    expect(plano.documentos.atualizar.map((d) => d.materialId)).toEqual(['txt-1']);
    expect(plano.documentos.pular).toEqual([]);
  });
});

describe('main — credenciais do R2', () => {
  it('falha cedo, mesmo em dry-run, quando falta alguma credencial do R2', async () => {
    // Neste ambiente de teste as três env vars não estão definidas, então o
    // R2_CONFIG lido no carregamento do módulo já está vazio — a checagem
    // deve barrar ANTES de qualquer leitura de D1/R2 via wrangler/S3, que
    // travaria (ou explodiria) num teste unitário.
    await expect(main(['--from', EXPORT, '--dry-run'])).rejects.toThrow(
      /CF_ACCOUNT_ID|CF_ACCESS_KEY_ID|CF_SECRET_ACCESS_KEY|credencia/i
    );
  });
});
