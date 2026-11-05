import { describe, expect, it } from 'vitest';

import { normalizeLink, parsePayload } from '../contributions/schema';

const base = { kind: 'improvement', subkind: 'feature', title: 'Modo escuro', body: 'Seria bom.' };

describe('parsePayload', () => {
  it('aceita o mínimo e preenche defaults', () => {
    const r = parsePayload(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toMatchObject({ kind: 'improvement', subkind: 'feature', links: [], fields: {}, target: null, device: null });
  });

  it('recusa tamanhos fora do contrato e body vazio', () => {
    expect(parsePayload({ ...base, kind: 'praise' })).toMatchObject({ ok: false, error: 'invalid_kind' });
    expect(parsePayload({ ...base, subkind: 'ui' })).toMatchObject({ ok: false, error: 'invalid_subkind' });
    expect(parsePayload({ ...base, title: 'x'.repeat(121) })).toMatchObject({ ok: false, error: 'title_too_long' });
    expect(parsePayload({ ...base, body: 'x'.repeat(4001) })).toMatchObject({ ok: false, error: 'body_too_long' });
    expect(parsePayload({ ...base, body: '   ' })).toMatchObject({ ok: false, error: 'body_required' });
    expect(parsePayload({ ...base, body: '' })).toMatchObject({ ok: false, error: 'body_required' });
  });

  it('gera title automaticamente a partir do body se omitido ou vazio', () => {
    const semTitulo = parsePayload({ body: 'Primeira linha do relato\nSegunda linha' });
    expect(semTitulo.ok).toBe(true);
    if (semTitulo.ok) {
      expect(semTitulo.payload.title).toBe('Primeira linha do relato');
      expect(semTitulo.payload.kind).toBe('other');
      expect(semTitulo.payload.subkind).toBeNull();
      expect(semTitulo.payload.device).toBeNull();
    }

    const espacosTitulo = parsePayload({ title: '   ', body: 'Texto do relato' });
    expect(espacosTitulo.ok).toBe(true);
    if (espacosTitulo.ok) {
      expect(espacosTitulo.payload.title).toBe('Texto do relato');
    }

    const linhaLonga = parsePayload({ body: 'A'.repeat(100) });
    expect(linhaLonga.ok).toBe(true);
    if (linhaLonga.ok) {
      expect(linhaLonga.payload.title.length).toBeLessThanOrEqual(80);
      expect(linhaLonga.payload.title).toMatch(/\.\.\.$/);
    }

    const corpoCurto = parsePayload({ body: 'Oi' });
    expect(corpoCurto.ok).toBe(true);
    if (corpoCurto.ok) {
      expect(corpoCurto.payload.title).toBe('Contribuição');
    }
  });

  it('device é opcional para todos os tipos (inclusive bug) e não exige same_device', () => {
    const bugSemDevice = parsePayload({ ...base, kind: 'bug', subkind: 'reader' });
    expect(bugSemDevice.ok).toBe(true);
    if (bugSemDevice.ok) expect(bugSemDevice.payload.device).toBeNull();

    const bugComDeviceSimples = parsePayload({ ...base, kind: 'bug', subkind: 'reader', device: { platform: 'web' } });
    expect(bugComDeviceSimples.ok).toBe(true);
    if (bugComDeviceSimples.ok) expect(bugComDeviceSimples.payload.device).toEqual({ platform: 'web' });

    const otherComDevice = parsePayload({ body: 'Relato', device: { os: 'iOS 18', model: 'iPhone 15' } });
    expect(otherComDevice.ok).toBe(true);
    if (otherComDevice.ok) expect(otherComDevice.payload.device).toEqual({ os: 'iOS 18', model: 'iPhone 15' });
  });

  it('device maior que 16 KiB → device_too_large', () => {
    const bug = { ...base, kind: 'bug', subkind: 'reader', device: { note: 'x'.repeat(17 * 1024) } };
    expect(parsePayload(bug)).toMatchObject({ ok: false, error: 'device_too_large' });
  });

  it('fields maior que 16 KiB → fields_too_large', () => {
    const r = parsePayload({ ...base, fields: { blob: 'x'.repeat(17 * 1024) } });
    expect(r).toMatchObject({ ok: false, error: 'fields_too_large' });
  });

  it('wrong_info/metadata exige field da lista e proposed', () => {
    const wi = { ...base, kind: 'wrong_info', subkind: 'metadata', target: { source: 'coldigom', praiseId: 'p1' } };
    expect(parsePayload({ ...wi, fields: { field: 'cor', current: 'a', proposed: 'b' } })).toMatchObject({ ok: false, error: 'invalid_fields' });
    expect(parsePayload({ ...wi, fields: { field: 'tonality', current: 'Dm', proposed: 'Em' } }).ok).toBe(true);
  });

  it('duplicate exige otherPraiseId e otherSource', () => {
    const d = { ...base, kind: 'wrong_info', subkind: 'duplicate' };
    expect(parsePayload({ ...d, fields: { otherPraiseId: 'p2' } })).toMatchObject({ ok: false, error: 'invalid_fields' });
    expect(parsePayload({ ...d, fields: { otherPraiseId: 'p2', otherSource: 'plpcg' } }).ok).toBe(true);
  });

  it('links: até 5, só hosts permitidos, normalizados', () => {
    const ok = parsePayload({ ...base, links: ['https://youtu.be/abc?si=xyz', 'https://drive.google.com/file/d/1/view?usp=sharing'] });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.payload.links).toEqual(['https://youtu.be/abc', 'https://drive.google.com/file/d/1/view?usp=sharing']);
    expect(parsePayload({ ...base, links: ['https://evil.example/x'] })).toMatchObject({ ok: false, error: 'link_host_not_allowed' });
    expect(parsePayload({ ...base, links: ['http://youtu.be/abc'] })).toMatchObject({ ok: false, error: 'link_host_not_allowed' });
    expect(parsePayload({ ...base, links: Array(6).fill('https://youtu.be/a') })).toMatchObject({ ok: false, error: 'too_many_links' });
  });

  it('subkind é opcional para todos os tipos', () => {
    const bug = parsePayload({ kind: 'bug', body: 'Travou na tela' });
    expect(bug.ok).toBe(true);
    if (bug.ok) expect(bug.payload.subkind).toBeNull();

    const improvement = parsePayload({ kind: 'improvement', body: 'Adicionar cifra em Dó' });
    expect(improvement.ok).toBe(true);
    if (improvement.ok) expect(improvement.payload.subkind).toBeNull();
  });

  it('device inválido (não-objeto) retorna invalid_device', () => {
    expect(parsePayload({ body: 'Texto', device: 'celular' })).toMatchObject({ ok: false, error: 'invalid_device' });
    expect(parsePayload({ body: 'Texto', device: 123 })).toMatchObject({ ok: false, error: 'invalid_device' });
  });

  it('target precisa de source válida e é persistido com kind other', () => {
    expect(parsePayload({ ...base, target: { source: 'x', praiseId: 'p' } })).toMatchObject({ ok: false, error: 'invalid_target' });

    const ok = parsePayload({
      body: 'Erro na letra do louvor',
      target: { source: 'plpcg', praiseId: 'p123', materialId: 'm456' },
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.payload.kind).toBe('other');
      expect(ok.payload.subkind).toBeNull();
      expect(ok.payload.target).toEqual({ source: 'plpcg', praiseId: 'p123', materialId: 'm456' });
    }
  });
});

describe('normalizeLink', () => {
  it('remove utm_* e si, mantém o resto', () => {
    expect(normalizeLink('https://www.youtube.com/watch?v=abc&utm_source=x&t=10')).toBe('https://www.youtube.com/watch?v=abc&t=10');
  });
  it('rejeita esquema e host fora da lista', () => {
    expect(normalizeLink('ftp://youtu.be/a')).toBeNull();
    expect(normalizeLink('https://youtube.com.evil.example/a')).toBeNull();
  });
});
