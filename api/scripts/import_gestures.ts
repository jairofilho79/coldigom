/**
 * Importação dos gestos CIAs a partir do export do pdf_extractor.
 *
 * Uso (de api/):
 *   npm run gestures:import:dry-run -- --from ../../pdf_extractor/export/gestures
 *   npm run gestures:import         -- --from …   # --sql-only: escreve import_gestures.sql
 *   npm run gestures:import:upload  -- --from …   # sql + figuras e documentos no R2
 *   npm run gestures:import:execute -- --from …   # sql + D1 remoto
 *   npm run gestures:import:full    -- --from …   # tudo
 *   flags: --force (sobrescreve is_reviewed = 1), --material-kind <id>
 *
 * Duas metades, nessa ordem: dicionário (upsert + UM bump de versão para a
 * importação inteira) e louvores (linha em praise_materials com o id do .txt,
 * objeto no R2, gesture_usage recomputado). Todo documento é validado ANTES de
 * qualquer escrita: export ruim falha alto e inteiro, nunca pela metade.
 *
 * Estado atual do D1 vem por `wrangler d1 execute --json` (global, nunca npx);
 * os documentos já gravados vêm do R2 pela API S3, como o ingest.ts faz.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

import { validarDocumento, type GestureDocument } from '../src/gestures/schema';
import { contarUsos } from '../src/gestures/usage';
import type { GestureDictionary, GestureEntry, LinhaDoDicionario } from '../src/gestures/dictionaryTypes';

const R2_CONFIG = {
  accountId: process.env.CF_ACCOUNT_ID || '',
  accessKeyId: process.env.CF_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.CF_SECRET_ACCESS_KEY || '',
  bucket: process.env.CF_R2_BUCKET || 'coldigom-assets',
};
const SQL_SAIDA = path.join(process.cwd(), 'import_gestures.sql');

export type Meta = { sourceMaterialId: string | null; validated: boolean; title: string };
export type DocExportado = { praiseId: string; txtId: string; doc: GestureDocument; meta: Meta; arquivo: string };
export type Exportacao = { dicionario: GestureDictionary; figuras: Map<string, string>; documentos: DocExportado[] };

export type MaterialAtual = { praise_id: string; type: string; r2_key: string | null; is_reviewed: number; material_kind: string };
export type EstadoAtual = {
  dicionario: Map<string, LinhaDoDicionario>;
  materiais: Map<string, MaterialAtual>;
  louvores: Set<string>;
  /** JSON já gravado no R2, por material_id. */
  documentos: Map<string, string>;
};

export type DocPlanejado = { materialId: string; praiseId: string; r2Key: string; doc: GestureDocument; sourceMaterialId: string | null };
export type Plano = {
  dicionario: { criar: GestureEntry[]; atualizar: GestureEntry[]; iguais: number };
  documentos: { criar: DocPlanejado[]; atualizar: DocPlanejado[]; pular: DocPlanejado[]; iguais: number; semLouvor: DocPlanejado[] };
  versaoSobe: boolean;
  materialKind: string | null;
};

// ---------- leitura ----------

export function lerExport(dir: string): Exportacao {
  const dicionario = JSON.parse(fs.readFileSync(path.join(dir, 'dictionary.json'), 'utf8')) as GestureDictionary;
  if (dicionario.schema !== 'coldigom.gesture-dictionary/1' || !Array.isArray(dicionario.gestures)) {
    throw new Error('dictionary.json não é um coldigom.gesture-dictionary/1');
  }
  const figuras = new Map<string, string>();
  const pastaFiguras = path.join(dir, 'figures');
  if (fs.existsSync(pastaFiguras)) {
    for (const nome of fs.readdirSync(pastaFiguras)) {
      if (nome.endsWith('.png')) figuras.set(nome.slice(0, -4), path.join(pastaFiguras, nome));
    }
  }

  const documentos: DocExportado[] = [];
  const erros: string[] = [];
  const pastaLouvores = path.join(dir, 'praises');
  const louvores = fs.existsSync(pastaLouvores) ? fs.readdirSync(pastaLouvores).sort() : [];
  for (const praiseId of louvores) {
    const pasta = path.join(pastaLouvores, praiseId);
    if (!fs.statSync(pasta).isDirectory()) continue;
    for (const nome of fs.readdirSync(pasta).sort()) {
      if (!nome.endsWith('.gestures.json')) continue;
      const txtId = nome.slice(0, -'.gestures.json'.length);
      const arquivo = path.join(pasta, nome);
      const lido = JSON.parse(fs.readFileSync(arquivo, 'utf8')) as unknown;
      const r = validarDocumento(lido);
      if (!r.ok) {
        erros.push(`${path.join(praiseId, nome)}: ${r.erro.codigo} em ${r.erro.caminho}`);
        continue;
      }
      const metaArquivo = path.join(pasta, `${txtId}.meta.json`);
      const meta: Meta = fs.existsSync(metaArquivo)
        ? (JSON.parse(fs.readFileSync(metaArquivo, 'utf8')) as Meta)
        : { sourceMaterialId: null, validated: false, title: r.doc.title };
      documentos.push({ praiseId, txtId, doc: r.doc, meta, arquivo });
    }
  }
  if (erros.length > 0) {
    throw new Error(`Export inválido — nada foi escrito:\n  ${erros.join('\n  ')}`);
  }
  return { dicionario, figuras, documentos };
}

// ---------- planejamento ----------

function entradaIgualALinha(g: GestureEntry, l: LinhaDoDicionario): boolean {
  return (
    g.name === l.name &&
    (g.description ?? '') === (l.description ?? '') &&
    JSON.stringify(g.exampleTriggers ?? []) === JSON.stringify(JSON.parse(l.example_triggers || '[]')) &&
    g.status === l.status &&
    (g.replacedBy ?? null) === (l.replaced_by ?? null)
  );
}

/** Igualdade de documento é por JSON canônico (chaves na ordem do contrato, sem espaço). */
function canonico(doc: unknown): string {
  return JSON.stringify(doc);
}

function materialKindMaisComum(materiais: Map<string, MaterialAtual>): string | null {
  const contagem = new Map<string, number>();
  for (const m of materiais.values()) {
    if (m.type !== 'gestures') continue;
    contagem.set(m.material_kind, (contagem.get(m.material_kind) ?? 0) + 1);
  }
  let melhor: string | null = null;
  let n = 0;
  for (const [k, v] of contagem) if (v > n) { melhor = k; n = v; }
  return melhor;
}

export function planejar(exp: Exportacao, estado: EstadoAtual, opcoes: { force: boolean; materialKind?: string }): Plano {
  const dicionario: Plano['dicionario'] = { criar: [], atualizar: [], iguais: 0 };
  for (const g of exp.dicionario.gestures) {
    const atual = estado.dicionario.get(g.id);
    if (!atual) dicionario.criar.push(g);
    else if (entradaIgualALinha(g, atual)) dicionario.iguais += 1;
    else dicionario.atualizar.push(g);
  }

  const documentos: Plano['documentos'] = { criar: [], atualizar: [], pular: [], iguais: 0, semLouvor: [] };
  for (const d of exp.documentos) {
    const planejado: DocPlanejado = {
      materialId: d.txtId,
      praiseId: d.praiseId,
      r2Key: `assets/praises/${d.praiseId}/${d.txtId}.gestures`,
      doc: d.doc,
      sourceMaterialId: d.meta.sourceMaterialId ?? null,
    };
    const material = estado.materiais.get(d.txtId);
    if (!material) {
      if (!estado.louvores.has(d.praiseId)) documentos.semLouvor.push(planejado);
      else documentos.criar.push(planejado);
      continue;
    }
    // Linha existente: a chave do R2 é a que já está no banco, não a padrão.
    if (material.r2_key) planejado.r2Key = material.r2_key;
    const gravado = estado.documentos.get(d.txtId);
    if (gravado !== undefined && canonico(JSON.parse(gravado)) === canonico(d.doc)) {
      documentos.iguais += 1;
    } else if (material.is_reviewed === 1 && !opcoes.force) {
      documentos.pular.push(planejado);
    } else {
      documentos.atualizar.push(planejado);
    }
  }

  const materialKind = opcoes.materialKind ?? materialKindMaisComum(estado.materiais);
  if (documentos.criar.length > 0 && !materialKind) {
    throw new Error('Há linhas a criar e nenhum material_kind conhecido: informe --material-kind <id>.');
  }

  return {
    dicionario,
    documentos,
    versaoSobe: dicionario.criar.length + dicionario.atualizar.length > 0,
    materialKind,
  };
}

// ---------- SQL ----------

function sql(valor: unknown): string {
  if (valor === null || valor === undefined) return 'NULL';
  if (typeof valor === 'number') return String(valor);
  return `'${String(valor).replace(/'/g, "''")}'`;
}

function sqlDoUso(d: DocPlanejado): string[] {
  const linhas = [`DELETE FROM gesture_usage WHERE material_id = ${sql(d.materialId)};`];
  for (const [g, n] of contarUsos(d.doc)) {
    linhas.push(`INSERT INTO gesture_usage (material_id, gesture_id, count) VALUES (${sql(d.materialId)}, ${sql(g)}, ${n});`);
  }
  return linhas;
}

export function gerarSql(plano: Plano): string {
  const linhas: string[] = [];
  for (const g of [...plano.dicionario.criar, ...plano.dicionario.atualizar]) {
    linhas.push(
      `INSERT INTO gesture_dictionary (id, name, description, example_triggers, image_key, gif_key, status, replaced_by) VALUES (` +
        `${sql(g.id)}, ${sql(g.name)}, ${sql(g.description ?? '')}, ${sql(JSON.stringify(g.exampleTriggers ?? []))}, ` +
        `${sql(`assets/cia/gestures/${g.id}.png`)}, ${sql(g.gif)}, ${sql(g.status)}, ${sql(g.replacedBy)}) ` +
        `ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, ` +
        `example_triggers = excluded.example_triggers, status = excluded.status, replaced_by = excluded.replaced_by, ` +
        `updated_at = datetime('now');`
    );
  }
  if (plano.versaoSobe) linhas.push(`UPDATE gesture_dictionary_meta SET version = version + 1 WHERE id = 1;`);

  for (const d of plano.documentos.criar) {
    linhas.push(
      `INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, merged_from_praise_id, url) VALUES (` +
        `${sql(d.materialId)}, ${sql(d.praiseId)}, ${sql(plano.materialKind)}, 'gestures', ${sql(d.r2Key)}, '', ${sql(d.sourceMaterialId)}, NULL, NULL);`
    );
    linhas.push(...sqlDoUso(d));
  }
  for (const d of plano.documentos.atualizar) {
    // Conteúdo novo nunca teve olho humano: mesma regra do PUT /content.
    linhas.push(`UPDATE praise_materials SET is_reviewed = 0, reviewed_at = NULL, reviewed_by = NULL WHERE id = ${sql(d.materialId)};`);
    linhas.push(...sqlDoUso(d));
  }
  return linhas.join('\n') + (linhas.length ? '\n' : '');
}

export function resumo(plano: Plano): string {
  const d = plano.dicionario;
  const o = plano.documentos;
  const lista = (xs: DocPlanejado[]) => (xs.length ? '\n    ' + xs.map((x) => `${x.praiseId}/${x.materialId}`).join('\n    ') : '');
  return [
    `Dicionário — criar: ${d.criar.length}, atualizar: ${d.atualizar.length}, iguais: ${d.iguais}${plano.versaoSobe ? ' (versão sobe)' : ''}`,
    `Documentos — criar: ${o.criar.length}, atualizar: ${o.atualizar.length}, pular (revisados): ${o.pular.length}, iguais: ${o.iguais}, sem louvor: ${o.semLouvor.length}`,
    o.pular.length ? `  pulados sem --force:${lista(o.pular)}` : '',
    o.semLouvor.length ? `  louvor inexistente no D1:${lista(o.semLouvor)}` : '',
    plano.materialKind ? `material_kind das linhas novas: ${plano.materialKind}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------- estado atual (D1 + R2) ----------

function consultarD1<T>(comando: string): T[] {
  const saida = execFileSync('wrangler', ['d1', 'execute', 'coldigom', '--remote', '--json', '--command', comando], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const json = JSON.parse(saida) as { results: T[] }[];
  return json[0]?.results ?? [];
}

async function clienteS3() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_CONFIG.accessKeyId, secretAccessKey: R2_CONFIG.secretAccessKey },
  });
}

async function lerEstadoAtual(): Promise<EstadoAtual> {
  const dicionario = new Map<string, LinhaDoDicionario>();
  for (const l of consultarD1<LinhaDoDicionario>('SELECT id, name, description, example_triggers, image_key, gif_key, status, replaced_by, created_at, updated_at FROM gesture_dictionary')) {
    dicionario.set(l.id, l);
  }
  const materiais = new Map<string, MaterialAtual>();
  for (const m of consultarD1<MaterialAtual & { id: string }>("SELECT id, praise_id, type, r2_key, is_reviewed, material_kind FROM praise_materials WHERE type = 'gestures'")) {
    materiais.set(m.id, m);
  }
  const louvores = new Set(consultarD1<{ id: string }>('SELECT id FROM praises').map((p) => p.id));

  const documentos = new Map<string, string>();
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = await clienteS3();
  for (const [id, m] of materiais) {
    if (!m.r2_key) continue;
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: R2_CONFIG.bucket, Key: `storage/${m.r2_key.replace(/^\/+/, '')}` }));
      documentos.set(id, await obj.Body!.transformToString());
    } catch {
      // sem objeto: a linha existe mas o documento nunca foi gravado — vira "atualizar"
    }
  }
  return { dicionario, materiais, louvores, documentos };
}

// ---------- execução ----------

async function subirParaR2(plano: Plano, exp: Exportacao): Promise<void> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = await clienteS3();
  for (const g of [...plano.dicionario.criar, ...plano.dicionario.atualizar]) {
    const figura = exp.figuras.get(g.id);
    if (!figura) { console.warn(`  sem figura para ${g.id}`); continue; }
    await s3.send(new PutObjectCommand({ Bucket: R2_CONFIG.bucket, Key: `storage/assets/cia/gestures/${g.id}.png`, Body: fs.readFileSync(figura), ContentType: 'image/png' }));
  }
  for (const d of [...plano.documentos.criar, ...plano.documentos.atualizar]) {
    await s3.send(new PutObjectCommand({ Bucket: R2_CONFIG.bucket, Key: `storage/${d.r2Key}`, Body: JSON.stringify(d.doc), ContentType: 'application/json; charset=utf-8' }));
  }
}

function lerFlag(argv: string[], nome: string): string | undefined {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const from = lerFlag(argv, '--from');
  if (!from) throw new Error('Informe --from <pasta do export/gestures>');
  const full = argv.includes('--full');
  const dryRun = argv.includes('--dry-run') || !(full || argv.includes('--sql-only') || argv.includes('--upload-r2') || argv.includes('--execute-d1'));

  const exp = lerExport(path.resolve(from));
  console.log(`Export lido: ${exp.dicionario.gestures.length} gestos, ${exp.figuras.size} figuras, ${exp.documentos.length} documentos`);
  const estado = await lerEstadoAtual();
  const plano = planejar(exp, estado, { force: argv.includes('--force'), materialKind: lerFlag(argv, '--material-kind') });
  console.log(resumo(plano));
  if (dryRun) return;

  const sqlTexto = gerarSql(plano);
  fs.writeFileSync(SQL_SAIDA, sqlTexto);
  console.log(`SQL escrito em ${SQL_SAIDA} (${sqlTexto.split('\n').length - 1} statements)`);

  if (full || argv.includes('--upload-r2')) {
    await subirParaR2(plano, exp);
    console.log('R2 atualizado');
  }
  if (full || argv.includes('--execute-d1')) {
    if (!sqlTexto.trim()) { console.log('Nada a executar no D1'); return; }
    execFileSync('wrangler', ['d1', 'execute', 'coldigom', '--remote', `--file=${SQL_SAIDA}`], { stdio: 'inherit' });
    console.log('D1 atualizado');
  }
}

// Só roda quando é o script invocado. Sem a guarda, o import do teste unitário
// dispararia a importação — o mesmo bug que o ingest.ts já teve.
const isRunAsScript = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRunAsScript) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
