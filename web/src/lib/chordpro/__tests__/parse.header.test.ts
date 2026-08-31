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

  /**
   * Este teste dizia "ignora em silêncio diretiva desconhecida, inclusive meta" e
   * cristalizava o descarte como comportamento desejado. Só que `{meta: column ...}`
   * está em 5589 dos 5590 arquivos do acervo: é o registro de qual coluna do PDF o
   * louvor ocupava, o dado que sustenta a regra "louvor que atravessa coluna vira um
   * arquivo só". Descartar era perder origem que não dá para reconstruir, e o R2 não
   * versiona. Agora a diretiva desconhecida fica guardada onde estava, literal.
   */
  it('guarda diretiva desconhecida, inclusive meta, fora do header', () => {
    const song = parse('{meta: column full}\n{qualquer: coisa}\n{title: X}\n');
    expect(song.header).toEqual({ title: 'X' });
    expect(song.stanzas).toEqual([]);
    expect(song.headerLines).toEqual([
      { kind: 'raw', text: '{meta: column full}' },
      { kind: 'raw', text: '{qualquer: coisa}' },
      { kind: 'field', key: 'title', value: 'X', text: '{title: X}' },
    ]);
  });

  it('diretiva de valor ausente vira entrada de campo sem valor, não some', () => {
    const song = parse('{key: }\n{subtitle: ?}\n');
    expect(song.header).toEqual({});
    expect(song.headerLines).toEqual([
      { kind: 'field', key: 'key', value: undefined, text: '{key: }' },
      { kind: 'field', key: 'subtitle', value: undefined, text: '{subtitle: ?}' },
    ]);
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
