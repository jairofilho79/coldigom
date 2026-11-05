import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/**
 * D1 de verdade para os testes que precisam do SQL rodando: gatilhos,
 * índices únicos, `UPDATE … FROM`, `json_each`. Os outros testes da casa
 * usam um D1 falso que despacha pelo texto da query — ótimo para o fluxo
 * da rota, cego para o que só o SQLite decide.
 *
 * Só o subconjunto da API do D1 que as rotas usam: `prepare`, `bind`,
 * `first`, `all`, `run` e `batch` (em transação, como o D1). Precisa de
 * Node ≥ 22 (`node:sqlite`); o CI da API roda em 22.
 */
export const RAIZ_API = resolve(__dirname, '..', '..');

export function lerSqlDaApi(relativo: string): string {
  return readFileSync(resolve(RAIZ_API, relativo), 'utf8');
}

/** SQLite em memória com o `schema.sql` de hoje — o bootstrap de um D1 novo. */
export function sqliteComSchema(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(lerSqlDaApi('schema.sql'));
  return sqlite;
}

type Linha = Record<string, unknown>;

/** O node:sqlite devolve linhas de protótipo nulo; a rota e o `toEqual` querem objeto comum. */
function plano(linha: unknown): Linha | null {
  return linha ? { ...(linha as Linha) } : null;
}

function statement(sqlite: DatabaseSync, sql: string, args: SQLInputValue[] = []) {
  const executar = () => {
    const r = sqlite.prepare(sql).run(...args);
    return {
      success: true,
      results: [],
      meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
    };
  };
  return {
    bind: (...novos: unknown[]) => statement(sqlite, sql, novos as SQLInputValue[]),
    all: async () => ({
      success: true,
      results: sqlite.prepare(sql).all(...args).map(plano),
      meta: {},
    }),
    first: async (coluna?: string) => {
      const linha = plano(sqlite.prepare(sql).get(...args));
      if (!linha) return null;
      return coluna ? (linha[coluna] ?? null) : linha;
    },
    run: async () => executar(),
    executar,
  };
}

/** Embrulha o SQLite na forma de `D1Database` que as rotas esperam. */
export function d1DeSqlite(sqlite: DatabaseSync): D1Database {
  return {
    prepare: (sql: string) => statement(sqlite, sql),
    batch: async (lote: Array<ReturnType<typeof statement>>) => {
      sqlite.exec('BEGIN');
      try {
        const resultados = lote.map((s) => s.executar());
        sqlite.exec('COMMIT');
        return resultados;
      } catch (erro) {
        sqlite.exec('ROLLBACK');
        throw erro;
      }
    },
  } as unknown as D1Database;
}
