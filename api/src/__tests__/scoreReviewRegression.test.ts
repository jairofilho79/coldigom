import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { checkStructural } from '../contributions/structural';
import { headMatchesDeclared } from '../contributions/sniff';

const partwise = '<score-partwise><part-list><score-part id="P1"><part-name>Voz</part-name></score-part></part-list><part id="P1"><measure number="1"/></part></score-partwise>';
const timewise = '<score-timewise><part-list><score-part id="P1"><part-name>Voz</part-name></score-part></part-list><measure number="1"><part id="P1"/></measure></score-timewise>';
const style = '<museScore version="4.0"><Style/></museScore>';

function museScoreArchive(score = '<museScore><Score/></museScore>', styleXml = style, paths = ['score_style.mss', 'Big_Score.mscx', 'Thumbnails/thumbnail.png', 'audiosettings.json', 'viewsettings.json']) {
  return zipSync({
    'META-INF/container.xml': strToU8(`<container><rootfiles>${paths.map((path) => `<rootfile full-path="${path}"/>`).join('')}</rootfiles></container>`),
    'score_style.mss': strToU8(styleXml),
    'Big_Score.mscx': strToU8(score),
    'Thumbnails/thumbnail.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    'audiosettings.json': strToU8('{}'),
    'viewsettings.json': strToU8('{}'),
  }, { level: 0 });
}

describe('regressões da revisão de partituras', () => {
  it.each([undefined, 'application/vnd.recordare.musicxml+xml'])(
    'recusa DTD em rootfile MusicXML alternativo sem extensão e media-type %s',
    (media) => {
      const bad = '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x>&x;</x>';
      const bytes = zipSync({
        'META-INF/container.xml': strToU8(`<container><rootfiles><rootfile full-path="main.xml"/><rootfile full-path="alternativo"${media ? ` media-type="${media}"` : ''}/></rootfiles></container>`),
        'main.xml': strToU8(partwise),
        'alternativo': strToU8(bad),
      });
      expect(checkStructural(bytes, 'mxl')).toMatchObject({ status: 'suspeita', reason: 'score_dtd_forbidden' });
    },
  );

  it.each(['P1', '_nome', 'Ária', '名', '𝄞', 'a·b', 'a\u0301', 'a\u203fb'])(
    'aceita NCName XML válido %s e normaliza espaços XSD em ID/IDREF', (id) => {
      const xml = partwise.replace('id="P1"', `id="  ${id}  "`).replace('id="P1"', `id="&#x9;${id}&#xA;"`);
      expect(checkStructural(strToU8(xml), 'musicxml').status).toBe('limpa');
    },
  );

  it.each(['1id', '-id', '.id', 'a:b', 'a b', '\u0301a', 'a\u00a0b'])(
    'rejeita ID ou IDREF que não é NCName XML: %s', (id) => {
      const xml = partwise.replaceAll('id="P1"', `id="${id}"`);
      expect(checkStructural(strToU8(xml), 'musicxml').status).toBe('suspeita');
    },
  );

  it('recusa IDs duplicados após normalização XSD inclusive em outros elementos musicais', () => {
    const duplicatedPart = partwise.replace('</part-list>', '<score-part id=" P1 "><part-name>Outra</part-name></score-part></part-list>');
    const duplicatedNote = partwise.replace('<measure number="1"/>', '<measure number="1"><note id=" P1 "/></measure>');
    for (const xml of [duplicatedPart, duplicatedNote]) {
      expect(checkStructural(strToU8(xml), 'musicxml').status).toBe('suspeita');
    }
  });

  it('valida outros IDREF do MusicXML e seus alvos após normalização', () => {
    const withInstrument = partwise
      .replace('</score-part>', '<score-instrument id="I1"><instrument-name>Voz</instrument-name></score-instrument></score-part>')
      .replace('<measure number="1"/>', '<measure number="1"><note><instrument id=" I1 "/></note></measure>');
    expect(checkStructural(strToU8(withInstrument), 'musicxml').status).toBe('limpa');
    expect(checkStructural(strToU8(withInstrument.replace('id=" I1 "', 'id=" I2 "')), 'musicxml').status).toBe('suspeita');
    expect(checkStructural(strToU8(withInstrument.replace('id=" I1 "', 'id=" 2inválido "')), 'musicxml').status).toBe('suspeita');
  });

  it('exige ao menos um compasso em cada parte partwise', () => {
    const xml = partwise.replace('</part-list>', '<score-part id="P2"><part-name>Outra</part-name></score-part></part-list>')
      .replace('</score-partwise>', '<part id="P2"/></score-partwise>');
    expect(checkStructural(strToU8(xml), 'musicxml').status).toBe('suspeita');
    expect(checkStructural(strToU8(xml.replace('<part id="P2"/>', '<part id="P2"><measure/></part>')), 'musicxml').status).toBe('limpa');
  });

  it('aceita rootfile MusicXML alternativo válido sem extensão', () => {
    const bytes = zipSync({
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="main.xml"/><rootfile full-path="alternativo" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'),
      'main.xml': strToU8(partwise),
      'alternativo': strToU8(timewise),
    });
    expect(checkStructural(bytes, 'mxl').status).toBe('limpa');
  });

  it.each([
    ['score.musicxml', undefined],
    ['score.xml', 'application/vnd.recordare.musicxml+xml'],
    ['score', undefined],
  ])('aceita primeiro rootfile MusicXML %s com media-type opcional e PDF alternativo', (name, media) => {
    const root = `<rootfile full-path="${name}"${media ? ` media-type="${media}"` : ''}/>`;
    const bytes = zipSync({
      'META-INF/container.xml': strToU8(`<container><rootfiles>${root}<rootfile full-path="partitura.pdf" media-type="application/pdf"/></rootfiles></container>`),
      [name]: strToU8(partwise),
      'partitura.pdf': strToU8('%PDF-1.7\n%%EOF'),
    });
    expect(checkStructural(bytes, 'mxl').status).toBe('limpa');
  });

  it.each([
    '<rootfile full-path="main.xml"/><rootfile full-path="../bad.pdf"/>',
    '<rootfile full-path="main.xml"/><rootfile full-path="missing.pdf"/>',
    '<rootfile full-path="main.xml"/><rootfile full-path="main.xml"/>',
    '<rootfile full-path="part.pdf" media-type="application/pdf"/><rootfile full-path="main.xml"/>',
    '<rootfile full-path="META-INF/container.xml"/>',
  ])('mantém segurança e prioridade do primeiro rootfile MXL: %s', (rootfiles) => {
    const bytes = zipSync({
      'META-INF/container.xml': strToU8(`<container><rootfiles>${rootfiles}</rootfiles></container>`),
      'main.xml': strToU8(partwise),
      'part.pdf': strToU8('%PDF-1.7\n%%EOF'),
    });
    expect(checkStructural(bytes, 'mxl').status).toBe('suspeita');
  });

  it('analisa XML auxiliar e rootfile sem extensão para impedir DTD', () => {
    const bad = '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x>&x;</x>';
    for (const [main, auxiliary] of [[bad, '<x/>'], [partwise, bad]]) {
      const bytes = zipSync({
        'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="main"/><rootfile full-path="other.xml"/></rootfiles></container>'),
        'main': strToU8(main),
        'other.xml': strToU8(auxiliary),
      });
      expect(checkStructural(bytes, 'mxl')).toMatchObject({ status: 'suspeita', reason: 'score_dtd_forbidden' });
    }
  });

  it.each([
    '<score-partwise><part-list><score-part/></part-list><part id="P1"><measure/></part></score-partwise>',
    '<score-partwise><part-list><score-part id="P1"/></part-list><part id="P1"><measure/></part></score-partwise>',
    '<score-partwise><part-list><score-part id="P1"><part-name>Voz</part-name></score-part></part-list><part id="P2"><measure/></part></score-partwise>',
    '<score-timewise><part-list><score-part id="P1"><part-name>Voz</part-name></score-part></part-list><measure><part id="P2"/></measure></score-timewise>',
    '<score-timewise><part-list><score-part id="P1"><part-name>Voz</part-name></score-part></part-list><measure><part/></measure></score-timewise>',
    '<score-partwise><part-list><score-part id="P1"><part-name>A</part-name></score-part><score-part id="P1"><part-name>B</part-name></score-part></part-list><part id="P1"><measure/></part></score-partwise>',
    '<score-partwise xmlns:x="urn:foreign"><x:part-list><score-part id="P1"><part-name>A</part-name></score-part></x:part-list><part id="P1"><measure/></part></score-partwise>',
    '<score-partwise xmlns:x="urn:foreign"><part-list><score-part id="P1"><x:part-name>A</x:part-name></score-part></part-list><part id="P1"><measure/></part></score-partwise>',
  ])('recusa score-part ou referência de parte inválida', (xml) => {
    expect(checkStructural(strToU8(xml), 'musicxml').status).toBe('suspeita');
  });

  it('aceita part-name vazio, permitido pelo tipo string do MusicXML', () => {
    expect(checkStructural(strToU8(partwise.replace('<part-name>Voz</part-name>', '<part-name/>')), 'musicxml').status).toBe('limpa');
  });

  it('aceita container MuseScore 4 com cinco arquivos e MSCX acima de 4 MiB', () => {
    const score = `<museScore><Score><!--${'a'.repeat(5 * 1024 * 1024)}--></Score></museScore>`;
    expect(checkStructural(museScoreArchive(score), 'mscz').status).toBe('limpa');
  });

  it.each(['<score-partwise/>', '<score-partwise><script>garbage</script></score-partwise>'])(
    'recusa XML sem estrutura de partitura: %s', (xml) => {
      expect(checkStructural(strToU8(xml), 'musicxml').status).toBe('suspeita');
    },
  );

  it('recusa script mesmo quando existe estrutura musical', () => {
    expect(checkStructural(strToU8(partwise.replace('</score-partwise>', '<script>garbage</script></score-partwise>')), 'musicxml').status)
      .toBe('suspeita');
  });

  it('recusa instrução de processamento de folha de estilo externa', () => {
    const xml = `<?xml-stylesheet type="text/xsl" href="https://example.invalid/evil.xsl"?>${partwise}`;
    expect(checkStructural(strToU8(xml), 'musicxml').status).toBe('suspeita');
  });

  it.each([partwise, timewise])('aceita partitura com lista de partes e compassos', (xml) => {
    expect(checkStructural(strToU8(xml), 'musicxml').status).toBe('limpa');
  });

  it('recusa DTD e entidades também em arquivo de estilo MSS auxiliar', () => {
    const malicious = '<!DOCTYPE museScore [<!ENTITY x SYSTEM "file:///etc/passwd">]><museScore>&x;</museScore>';
    expect(checkStructural(museScoreArchive(undefined, malicious, ['Big_Score.mscx']), 'mscz'))
      .toMatchObject({ status: 'suspeita', reason: 'score_dtd_forbidden' });
  });

  it.each([
    ['Big_Score.mscx', 'Big_Score.mscx'],
    ['Big_Score.mscx', 'missing.json'],
    ['Big_Score.mscx', '../outside.json'],
    ['score_style.mss'],
  ])('rejeita referências ausentes, repetidas, inseguras ou sem MSCX: %j', (...paths) => {
    expect(checkStructural(museScoreArchive(undefined, style, paths), 'mscz').status).toBe('suspeita');
  });

  it('mantém o limite de 8 MiB por entrada MSCX', () => {
    const score = `<museScore><Score><!--${'a'.repeat(8 * 1024 * 1024)}--></Score></museScore>`;
    expect(checkStructural(museScoreArchive(score), 'mscz'))
      .toMatchObject({ status: 'suspeita', reason: 'score_entry_too_large' });
  });

  it.each([
    partwise.replaceAll('<score-', '<m:score-').replaceAll('</score-', '</m:score-')
      .replace('<m:score-partwise>', '<m:score-partwise xmlns:m="http://www.musicxml.org/ns/musicxml">')
      .replaceAll('<part', '<m:part').replaceAll('</part', '</m:part')
      .replaceAll('<measure', '<m:measure'),
    `<?editor version="1"?>${partwise}`,
  ])('aceita na triagem MusicXML válido com namespace ou instrução de processamento', (xml) => {
    const bytes = strToU8(xml);
    expect(checkStructural(bytes, 'musicxml').status).toBe('limpa');
    expect(headMatchesDeclared(bytes, 'musicxml')).toBe(true);
  });
});
