import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../__tests__/fixtures/chordpro', name), 'utf8');

describe('parse — cabeçalho', () => {
  it('lê as cinco diretivas de cabeçalho', () => {
    const song = parse(
      '{title: Confio Em Deus}\n{subtitle: 344}\n{key: A}\n{rhythm: Básico}\n{artist: Let. W.C.M.}\n'
    );
    expect(song.header).toEqual({
      title: 'Confio Em Deus',
      subtitle: '344',
      key: 'A',
      rhythm: 'Básico',
      artist: 'Let. W.C.M.',
    });
  });

  it('trata valor vazio como ausente', () => {
    expect(parse('{key: }\n').header.key).toBeUndefined();
    expect(parse('{key:}\n').header.key).toBeUndefined();
  });

  it('trata "?" como ausente', () => {
    expect(parse('{subtitle: ?}\n').header.subtitle).toBeUndefined();
  });

  it('ignora em silêncio diretiva desconhecida, inclusive meta', () => {
    const song = parse('{meta: column full}\n{qualquer: coisa}\n{title: X}\n');
    expect(song.header).toEqual({ title: 'X' });
    expect(song.stanzas).toEqual([]);
  });

  it('a lápide real tem os dois formatos de ausente e nenhum campo de cabeçalho', () => {
    const song = parse(fixture('lapide.chord'));
    expect(song.header.title).toBe('Clama, ó igreja');
    expect(song.header.subtitle).toBeUndefined();
    expect(song.header.key).toBeUndefined();
    expect(song.header.rhythm).toBeUndefined();
    expect(song.header.artist).toBeUndefined();
  });

  it('lê o cabeçalho do arquivo denso real, sem subtitle', () => {
    const song = parse(fixture('denso.chord'));
    expect(song.header.title).toBe('Comigo Habita, Ó Deus');
    expect(song.header.key).toBe('Eb');
    expect(song.header.rhythm).toBe('Canção');
    expect(song.header.subtitle).toBeUndefined();
    expect(song.header.artist).toContain('Let. H/F.L');
  });
});
