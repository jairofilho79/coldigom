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
