import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * schema.sql é o bootstrap de um D1 novo e migrations/ é a história; nada os
 * compara. A 015 e a 016 foram sincronizadas à mão. Este teste faz a 017 (e as
 * próximas que forem listadas aqui) não depender de memória.
 */
const RAIZ = resolve(__dirname, '..', '..');
const normal = (s: string) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();

describe('schema.sql acompanha as migrações', () => {
  it('017: a tabela validation_findings e os três índices estão nos dois', () => {
    const schema = normal(readFileSync(resolve(RAIZ, 'schema.sql'), 'utf8'));
    const mig = normal(readFileSync(resolve(RAIZ, 'migrations', '017_validation_findings.sql'), 'utf8'));
    for (const trecho of [
      'CREATE TABLE IF NOT EXISTS validation_findings (',
      'CREATE INDEX IF NOT EXISTS idx_vf_status_conf ON validation_findings(status, confidence)',
      'CREATE INDEX IF NOT EXISTS idx_vf_detector ON validation_findings(detector)',
      'CREATE INDEX IF NOT EXISTS idx_vf_praise ON validation_findings(praise_id)',
    ]) {
      expect(mig, `migração sem: ${trecho}`).toContain(trecho);
      expect(schema, `schema.sql sem: ${trecho}`).toContain(trecho);
    }
    const colunas = ['id TEXT PRIMARY KEY', 'run_id TEXT NOT NULL', 'detector TEXT NOT NULL',
      'target_type TEXT NOT NULL', 'target_id TEXT NOT NULL', 'praise_id TEXT', 'action TEXT NOT NULL',
      'field TEXT', 'current_value TEXT', 'proposed_value TEXT', 'confidence TEXT NOT NULL',
      'evidence TEXT NOT NULL', "status TEXT NOT NULL DEFAULT 'pendente'", 'decided_at TEXT',
      'decided_by TEXT', 'decision_note TEXT', "created_at TEXT DEFAULT (datetime('now'))"];
    for (const c of colunas) {
      expect(mig).toContain(c);
      expect(schema).toContain(c);
    }
  });

  it('018: as três tabelas de gestos e o índice de uso estão nos dois', () => {
    const schema = normal(readFileSync(resolve(RAIZ, 'schema.sql'), 'utf8'));
    const mig = normal(readFileSync(resolve(RAIZ, 'migrations', '018_gestures.sql'), 'utf8'));
    for (const trecho of [
      'CREATE TABLE IF NOT EXISTS gesture_dictionary (',
      'CREATE TABLE IF NOT EXISTS gesture_dictionary_meta (',
      'CREATE TABLE IF NOT EXISTS gesture_usage (',
      'CREATE INDEX IF NOT EXISTS idx_gesture_usage_gesture ON gesture_usage(gesture_id)',
      'INSERT OR IGNORE INTO gesture_dictionary_meta (id, version) VALUES (1, 0)',
    ]) {
      expect(mig, `migração sem: ${trecho}`).toContain(trecho);
      expect(schema, `schema.sql sem: ${trecho}`).toContain(trecho);
    }
    const colunas = [
      'id TEXT PRIMARY KEY', 'name TEXT NOT NULL', 'description TEXT NOT NULL DEFAULT \'\'',
      "example_triggers TEXT NOT NULL DEFAULT '[]'", 'image_key TEXT', 'gif_key TEXT',
      "status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated'))",
      'replaced_by TEXT', 'version INTEGER NOT NULL', 'material_id TEXT NOT NULL',
      'gesture_id TEXT NOT NULL', 'count INTEGER NOT NULL', 'PRIMARY KEY (material_id, gesture_id)',
      'FOREIGN KEY (material_id) REFERENCES praise_materials(id) ON DELETE CASCADE',
    ];
    for (const c of colunas) {
      expect(mig).toContain(c);
      expect(schema).toContain(c);
    }
  });
});
