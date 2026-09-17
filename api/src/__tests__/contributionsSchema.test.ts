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

  it('recusa kind, subkind e tamanhos fora do contrato', () => {
    expect(parsePayload({ ...base, kind: 'praise' })).toMatchObject({ ok: false, error: 'invalid_kind' });
    expect(parsePayload({ ...base, subkind: 'ui' })).toMatchObject({ ok: false, error: 'invalid_subkind' });
    expect(parsePayload({ ...base, title: 'x'.repeat(121) })).toMatchObject({ ok: false, error: 'title_too_long' });
    expect(parsePayload({ ...base, body: 'x'.repeat(4001) })).toMatchObject({ ok: false, error: 'body_too_long' });
    expect(parsePayload({ ...base, title: '  ' })).toMatchObject({ ok: false, error: 'title_required' });
  });

  it('bug exige device.same_device booleano', () => {
    const bug = { ...base, kind: 'bug', subkind: 'reader' };
    expect(parsePayload(bug)).toMatchObject({ ok: false, error: 'device_required' });
    expect(parsePayload({ ...bug, device: { platform: 'web' } })).toMatchObject({ ok: false, error: 'device_required' });
    expect(parsePayload({ ...bug, device: { platform: 'web', same_device: false, other_device_note: 'iPad da igreja' } }).ok).toBe(true);
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

  it('target precisa de source válida', () => {
    expect(parsePayload({ ...base, target: { source: 'x', praiseId: 'p' } })).toMatchObject({ ok: false, error: 'invalid_target' });
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
