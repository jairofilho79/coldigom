import { describe, expect, it } from 'vitest';
import { Zip, ZipDeflate, zipSync, type Zippable } from 'fflate';

import { checkStructural } from '../contributions/structural';

const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const PDF_LIMPO = enc('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n%%EOF\n');

describe('checkStructural — pdf', () => {
  it('pdf simples é limpo', () => {
    expect(checkStructural(PDF_LIMPO, 'pdf')).toEqual({ status: 'limpa', detectedType: 'pdf', tokens: [] });
  });
  it('tokens perigosos viram suspeita com a lista', () => {
    const v = checkStructural(enc('%PDF-1.4\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>'), 'pdf');
    expect(v.status).toBe('suspeita');
    expect(v.tokens).toEqual(['/JavaScript', '/JS', '/OpenAction']);
  });
  it('/Encrypt é suspeita (não dá para inspecionar)', () => {
    expect(checkStructural(enc('%PDF-1.4\n/Encrypt 5 0 R'), 'pdf').tokens).toEqual(['/Encrypt']);
  });
  it('"pdf" que é HTML: assinatura errada', () => {
    const v = checkStructural(enc('<html><script>'), 'pdf');
    expect(v).toMatchObject({ status: 'suspeita', detectedType: null, reason: 'signature_mismatch' });
  });
});

describe('checkStructural — mp3', () => {
  it('ID3 e frame sync são limpos', () => {
    expect(checkStructural(cat(enc('ID3\x03\x00\x00\x00\x00\x00\x0a'), new Uint8Array(10)), 'mp3').status).toBe('limpa');
    expect(checkStructural(new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0, 0]), 'mp3').status).toBe('limpa');
  });
  it('APIC acima de 2 MB é suspeita', () => {
    // Frame ID3v2.3: 'APIC' + tamanho (4 bytes big-endian) + flags(2)
    const size = 3 * 1024 * 1024;
    const header = enc('ID3\x03\x00\x00\x00\x00\x00\x0a');
    const apic = cat(
      enc('APIC'),
      new Uint8Array([(size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff]),
      new Uint8Array(2),
    );
    expect(checkStructural(cat(header, apic), 'mp3')).toMatchObject({ status: 'suspeita', reason: 'apic_too_large' });
  });
  it('v2.4 usa tamanho syncsafe: 1 MiB syncsafe não é 4 MiB em leitura de 32 bits simples', () => {
    // Frame ID3v2.4: mesmo layout, mas o tamanho é 7 bits úteis por byte (syncsafe).
    // Estes 4 bytes decodificados como syncsafe dão 1 MiB; lidos como inteiro de 32
    // bits simples dariam 4 MiB (> 2 MB) — só a leitura por versão acerta.
    const header = enc('ID3\x04\x00\x00\x00\x00\x00\x0a');
    const apic = cat(enc('APIC'), new Uint8Array([0x00, 0x40, 0x00, 0x00]), new Uint8Array(2));
    expect(checkStructural(cat(header, apic), 'mp3').status).toBe('limpa');
  });
});

describe('checkStructural — imagens', () => {
  it('png com IEND é limpo; truncado é suspeita', () => {
    const png = cat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), enc('....IHDR....IEND'), new Uint8Array(4));
    expect(checkStructural(png, 'png').status).toBe('limpa');
    expect(checkStructural(png.slice(0, 12), 'png')).toMatchObject({ status: 'suspeita', reason: 'truncated' });
  });
  it('jpg precisa de FF D9 no fim', () => {
    expect(checkStructural(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]), 'jpg').status).toBe('limpa');
    expect(checkStructural(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]), 'jpg')).toMatchObject({ status: 'suspeita', reason: 'truncated' });
  });
});

describe('checkStructural — texto', () => {
  it('utf-8 válido é limpo; byte nulo e > 256 KB são suspeita', () => {
    expect(checkStructural(enc('{t: Louvor}\n[C]Ainda'), 'chordpro').status).toBe('limpa');
    // byte nulo no meio do conteúdo: nunca é texto válido
    expect(checkStructural(enc('a\x00b'), 'txt')).toMatchObject({ status: 'suspeita', reason: 'binary_in_text' });
    expect(checkStructural(new Uint8Array(256 * 1024 + 1).fill(0x61), 'txt')).toMatchObject({ status: 'suspeita', reason: 'text_too_large' });
  });
});

describe('checkStructural — partituras editáveis', () => {
  const partList = '<part-list><score-part id="P1"><part-name>Voz</part-name></score-part></part-list>';
  const partwiseBody = `${partList}<part id="P1"><measure number="1"/></part>`;
  const timewiseBody = `${partList}<measure number="1"><part id="P1"/></measure>`;
  const musicxml = `<score-partwise version="4.0">${partwiseBody}</score-partwise>`;
  const mscx = '<museScore version="4.0"><Score><Staff id="1"><Measure/></Staff></Score></museScore>';
  const container = (target: string, media?: string) =>
    `<container><rootfiles><rootfile full-path="${target}"${media ? ` media-type="${media}"` : ''}/></rootfiles></container>`;
  const scoreZip = (type: 'mscz' | 'mxl', extra: Zippable = {}, xml?: string) => {
    const target = type === 'mscz' ? 'scores/main.mscx' : 'scores/main.musicxml';
    return zipSync({
      'META-INF/container.xml': enc(container(target, type === 'mxl' ? 'application/vnd.recordare.musicxml+xml' : undefined)),
      [target]: enc(xml ?? (type === 'mscz' ? mscx : musicxml)),
      ...extra,
    });
  };
  const rejected = (bytes: Uint8Array, type: 'mscz' | 'mxl' | 'musicxml', reason?: string) => {
    expect(checkStructural(bytes, type)).toMatchObject({
      status: 'suspeita',
      ...(reason ? { reason } : {}),
    });
  };

  it('valida MusicXML partwise/timewise e containers MSCZ/MXL reais (stored e deflate)', () => {
    expect(checkStructural(enc(`\ufeff<?xml version="1.0"?>${musicxml}`), 'musicxml'))
      .toEqual({ status: 'limpa', detectedType: 'musicxml', tokens: [] });
    expect(checkStructural(enc(`<score-timewise version="4.0">${timewiseBody}</score-timewise>`), 'musicxml').status).toBe('limpa');
    for (const type of ['mscz', 'mxl'] as const) {
      expect(checkStructural(scoreZip(type), type)).toEqual({ status: 'limpa', detectedType: type, tokens: [] });
    }
    const stored = zipSync({
      'META-INF/container.xml': enc(container('main.xml', 'application/vnd.recordare.musicxml+xml')),
      'main.xml': enc(musicxml),
    }, { level: 0 });
    expect(checkStructural(stored, 'mxl').status).toBe('limpa');
    const namespaced = zipSync({
      'META-INF/container.xml': enc(`<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="main.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`),
      'main.xml': enc(musicxml),
    });
    expect(checkStructural(namespaced, 'mxl').status).toBe('limpa');
  });

  it('aceita descritores de dados streaming, diretórios e comentário ZIP', () => {
    const parts: Uint8Array[] = [];
    const zip = new Zip((error, chunk) => {
      if (error) throw error;
      parts.push(chunk);
    });
    for (const [name, content] of [
      ['META-INF/container.xml', container('main.mscx')],
      ['main.mscx', mscx],
    ]) {
      const file = new ZipDeflate(name);
      zip.add(file);
      file.push(enc(content), true);
    }
    zip.end();
    expect(checkStructural(cat(...parts), 'mscz').status).toBe('limpa');
    const bytes = zipSync({
      'META-INF/': new Uint8Array(),
      'META-INF/container.xml': enc(container('main.mscx')),
      'main.mscx': enc(mscx),
    }, { comment: 'Exportado pelo editor' });
    expect(checkStructural(bytes, 'mscz').status).toBe('limpa');
  });

  it('rejeita tipos trocados, ZIP genérico e cabeçalho PK sem arquivo', () => {
    rejected(scoreZip('mscz'), 'mxl');
    rejected(scoreZip('mxl'), 'mscz');
    rejected(zipSync({ 'readme.txt': enc('not a score') }), 'mscz');
    rejected(enc('PK\x03\x04'), 'mxl');
    rejected(enc(musicxml), 'mscz', 'signature_mismatch');
    rejected(scoreZip('mxl'), 'musicxml', 'signature_mismatch');
    rejected(enc('<museScore><Score/></museScore>'), 'musicxml');
    rejected(enc('<html><score-partwise/></html>'), 'musicxml');
  });

  it('rejeita ZIP truncado em dados, diretório e EOCD, sem lançar exceção', () => {
    const bytes = scoreZip('mscz');
    for (const at of [16, Math.floor(bytes.length / 2), bytes.length - 22, bytes.length - 1]) {
      rejected(bytes.subarray(0, at), 'mscz');
    }
  });

  it('rejeita diretório/local/EOCD incoerentes, criptografia e CRC adulterado', () => {
    const base = scoreZip('mscz');
    const end = base.length - 22;
    const central = new DataView(base.buffer).getUint32(end + 16, true);
    const mutations = [
      (v: DataView) => v.setUint32(central, 0, true),
      (v: DataView) => v.setUint16(end + 20, 10, true),
      (v: DataView) => v.setUint32(end + 12, 1, true),
      (v: DataView) => v.setUint32(central + 42, 0xfffffff0, true),
      (v: DataView) => v.setUint16(central + 8, 1, true),
      (v: DataView) => v.setUint16(6, 1, true),
      (v: DataView) => v.setUint16(end + 4, 1, true),
      (v: DataView) => {
        const wrongCrc = v.getUint32(central + 16, true) ^ 1;
        v.setUint32(central + 16, wrongCrc, true);
        v.setUint32(14, wrongCrc, true);
      },
    ];
    for (const mutate of mutations) {
      const bytes = base.slice();
      mutate(new DataView(bytes.buffer));
      rejected(bytes, 'mscz', 'score_invalid_archive');
    }
  });

  it('exige container íntegro e um único rootfile com alvo presente e extensão coerente', () => {
    const cases: Zippable[] = [
      { 'META-INF/container.xml': enc(container('missing.mscx')), 'main.mscx': enc(mscx) },
      { 'main.mscx': enc(mscx) },
      { 'META-INF/container.xml': enc('<container><rootfiles>'), 'main.mscx': enc(mscx) },
      { 'META-INF/container.xml': enc('<fake><rootfiles><rootfile full-path="main.mscx"/></rootfiles></fake>'), 'main.mscx': enc(mscx) },
      { 'META-INF/container.xml': enc('<container><rootfile full-path="main.mscx"/></container>'), 'main.mscx': enc(mscx) },
      { 'META-INF/container.xml': enc('<container><rootfiles/></container>'), 'main.mscx': enc(mscx) },
      { 'META-INF/container.xml': enc(`<container><rootfiles><rootfile full-path="main.mscx"/><rootfile full-path="other.mscx"/></rootfiles></container>`), 'main.mscx': enc(mscx), 'other.mscx': enc(mscx) },
      { 'META-INF/container.xml': enc(container('main.xml')), 'main.xml': enc(mscx) },
      { 'META-INF/container.xml': enc(container('main.mscx')), 'main.mscx': enc(musicxml) },
    ];
    for (const entries of cases) rejected(zipSync(entries), 'mscz');
    rejected(scoreZip('mxl', { 'META-INF/container.xml': enc(container('scores/main.musicxml', 'text/html')) }), 'mxl');
    rejected(scoreZip('mxl', {}, '<museScore><Score/></museScore>'), 'mxl');
    rejected(scoreZip('mscz', {}, '<museScore/>'), 'mscz');
    rejected(scoreZip('mscz', {}, '<museScore><wrapper><Score/></wrapper></museScore>'), 'mscz');
  });

  it('bloqueia traversal, caminhos absolutos/URL/backslash e entradas perigosas mesmo não referenciadas', () => {
    for (const target of ['../main.mscx', '/main.mscx', 'C:/main.mscx', 'scores/../main.mscx', 'scores\\main.mscx', 'https://host/main.mscx', 'scores//main.mscx', './main.mscx', '%2e%2e/main.mscx']) {
      rejected(zipSync({
        'META-INF/container.xml': enc(container(target)),
        [target]: enc(mscx),
      }), 'mscz');
    }
    rejected(scoreZip('mscz', { '../unused.txt': enc('bad') }), 'mscz', 'score_unsafe_path');
    rejected(scoreZip('mscz', {
      'META-INF/container.xml': enc(container('../main.mscx')),
    }), 'mscz', 'score_unsafe_path');
    for (const control of [0x00, 0x01, 0x1f, 0x7f]) {
      rejected(scoreZip('mscz', { [`unused${String.fromCharCode(control)}.txt`]: enc('bad') }), 'mscz', 'score_unsafe_path');
    }
    expect(checkStructural(scoreZip('mscz', { 'unused file.txt': enc('safe') }), 'mscz').status).toBe('limpa');
  });

  it('rejeita nomes ZIP duplicados e symlinks sem depender do alvo de rootfile', () => {
    // Duas entradas extras do mesmo comprimento, alteradas em ambos os headers.
    const twins = zipSync({
      'META-INF/container.xml': enc(container('main.mscx')),
      'main.mscx': enc(mscx),
      'copy.mscx': enc(mscx),
    });
    for (let i = 0; i + 9 <= twins.length; i++) {
      if (new TextDecoder().decode(twins.subarray(i, i + 9)) === 'copy.mscx') twins.set(enc('main.mscx'), i);
    }
    rejected(twins, 'mscz', 'score_invalid_archive');
    const symlink = scoreZip('mscz', { link: [enc('main.mscx'), { attrs: 0xa1ff << 16, os: 3 }] });
    rejected(symlink, 'mscz', 'score_invalid_archive');
  });

  it('rejeita XML malformado, entidades não declaradas, UTF-8 incompleto e caracteres XML inválidos', () => {
    for (const xml of [
      '<score-partwise><part-list></score-partwise>',
      '<score-partwise/><score-timewise/>',
      '<score-partwise><!-- unfinished</score-partwise>',
      '<score-partwise> &undefined; </score-partwise>',
      '<score-partwise title="&undefined;"/>',
      '<score-partwise>&#0;</score-partwise>',
      '<score-partwise>\x01</score-partwise>',
      '<score-partwise title="one" title="two"/>',
      '<score-partwise>unfinished',
    ]) {
      rejected(enc(xml), 'musicxml', 'score_invalid_xml');
      rejected(scoreZip('mxl', {}, xml), 'mxl', 'score_invalid_xml');
    }
    rejected(cat(enc(musicxml), new Uint8Array([0xc3])), 'musicxml', 'score_invalid_xml');
    rejected(scoreZip('mscz', {}, '<museScore><Score></museScore>'), 'mscz', 'score_invalid_xml');
  });

  const publicDoctype = (root: string, version: string, kind: string, url: string) =>
    `<!DOCTYPE ${root} PUBLIC\n "-//Recordare//DTD MusicXML ${version} ${kind}//EN"\n "${url}">`;
  const publicScores = ['1.0', '1.1', '2.0', '3.0', '3.1', '4.0'].flatMap((version) =>
    ['Partwise', 'Timewise'].map((kind) => ({ version, kind })),
  );

  it.each(publicScores)('aceita PUBLIC oficial MusicXML $version $kind cru e em MXL', ({ version, kind }) => {
    const root = `score-${kind.toLowerCase()}`;
    const dtd = publicDoctype(root, version, kind, `http://www.musicxml.org/dtds/${kind.toLowerCase()}.dtd`);
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${dtd}\n<${root}${version === '1.0' ? '' : ` version="${version}"`}>${kind === 'Partwise' ? partwiseBody : timewiseBody}</${root}>`;
    expect(checkStructural(enc(xml), 'musicxml')).toEqual({ status: 'limpa', detectedType: 'musicxml', tokens: [] });
    expect(checkStructural(scoreZip('mxl', {}, xml), 'mxl')).toEqual({ status: 'limpa', detectedType: 'mxl', tokens: [] });
  });

  it('aceita aspas simples, URL HTTPS exata e entidades XML predefinidas, sem carregar a DTD', () => {
    const dtd = `<!DOCTYPE score-partwise PUBLIC '-//Recordare//DTD MusicXML 4.0 Partwise//EN' 'https://www.musicxml.org/dtds/partwise.dtd'>`;
    const xml = dtd + `<score-partwise version="4.0"><work><work-title>A &amp; B</work-title></work>${partwiseBody}</score-partwise>`;
    expect(checkStructural(enc(xml), 'musicxml').status).toBe('limpa');
    expect(checkStructural(scoreZip('mxl', {}, xml), 'mxl').status).toBe('limpa');
  });

  it.each(['2.0', '3.0', '3.1', '4.0'])('aceita PUBLIC oficial Container %s em META-INF/container.xml', (version) => {
    const dtd = publicDoctype('container', version, 'Container', 'http://www.musicxml.org/dtds/container.dtd');
    const xml = publicDoctype('score-partwise', version, 'Partwise', 'http://www.musicxml.org/dtds/partwise.dtd')
      + musicxml.replace('4.0', version);
    expect(checkStructural(scoreZip('mxl', {
      'META-INF/container.xml': enc(dtd + container('scores/main.musicxml', 'application/vnd.recordare.musicxml+xml')),
    }, xml), 'mxl').status).toBe('limpa');
  });

  it('recusa PUBLIC desconhecido, URL arbitrária, subconjunto interno e SYSTEM mesmo oficial', () => {
    const official = publicDoctype('score-partwise', '4.0', 'Partwise', 'http://www.musicxml.org/dtds/partwise.dtd');
    for (const dtd of [
      official.replace('Partwise//EN', 'Generic//EN'),
      official.replace('4.0 Partwise', '4.1 Partwise'),
      official.replace('4.0 Partwise', '99.0 Partwise'),
      official.replace('http://www.musicxml.org/dtds/partwise.dtd', 'https://example.invalid/partwise.dtd'),
      official.replace('http://www.musicxml.org/dtds/partwise.dtd', 'http://www.musicxml.org.evil.invalid/dtds/partwise.dtd'),
      official.replace('partwise.dtd', 'timewise.dtd'),
      official.replace('partwise.dtd', 'partwise.dtd?redirect=https://example.invalid'),
      official.replace('http://www.musicxml.org/dtds/partwise.dtd', 'file:///etc/passwd'),
      official.slice(0, -1) + ' []>',
      official.slice(0, -1) + ' [<!ENTITY x "expanded">]>',
      official.slice(0, -1) + ' [<!ENTITY x SYSTEM "file:///etc/passwd">]>',
      official.slice(0, -1) + ' [<!ENTITY % x SYSTEM "https://example.invalid/evil.dtd">%x;]>',
      '<!DOCTYPE score-partwise SYSTEM "http://www.musicxml.org/dtds/partwise.dtd">',
      publicDoctype('container', '1.1', 'Container', 'http://www.musicxml.org/dtds/container.dtd'),
    ]) {
      rejected(enc(dtd + musicxml), 'musicxml', 'score_dtd_forbidden');
      rejected(scoreZip('mxl', {}, dtd + musicxml), 'mxl', 'score_dtd_forbidden');
    }
    rejected(scoreZip('mxl', {
      'META-INF/container.xml': enc(publicDoctype('container', '4.0', 'Container', 'https://example.invalid/container.dtd')
        + container('scores/main.musicxml', 'application/vnd.recordare.musicxml+xml')),
    }), 'mxl', 'score_dtd_forbidden');
  });

  it('exige coerência entre PUBLIC, raiz e versão; não resolve entidades da DTD oficial', () => {
    const official = publicDoctype('score-partwise', '4.0', 'Partwise', 'http://www.musicxml.org/dtds/partwise.dtd');
    for (const xml of [
      official + '<score-timewise version="4.0"><part-list/></score-timewise>',
      official + musicxml.replace('4.0', '3.1'),
      official.replace('Partwise//EN', 'Timewise//EN') + musicxml,
      official + '<museScore><Score/></museScore>',
    ]) {
      rejected(enc(xml), 'musicxml');
      rejected(scoreZip('mxl', {}, xml), 'mxl');
    }
    const unresolved = official + '<score-partwise version="4.0"><work><work-title>&external;</work-title></work></score-partwise>';
    rejected(enc(unresolved), 'musicxml', 'score_invalid_xml');
    rejected(scoreZip('mxl', {}, unresolved), 'mxl', 'score_invalid_xml');
  });

  it('recusa demais DTDs externas/internas e de container, sem resolver entidades', () => {
    for (const dtd of [
      '<!DOCTYPE score-partwise SYSTEM "https://example.invalid/score.dtd">',
      '<!DOCTYPE score-partwise [<!ENTITY x SYSTEM "file:///etc/passwd">]>',
      '<!DOCTYPE score-partwise [<!ENTITY x "expanded">]>',
    ]) {
      rejected(enc(dtd + musicxml), 'musicxml', 'score_dtd_forbidden');
      rejected(scoreZip('mxl', {}, dtd + musicxml), 'mxl', 'score_dtd_forbidden');
    }
    rejected(scoreZip('mscz', {
      'META-INF/container.xml': enc('<!DOCTYPE container SYSTEM "https://example.invalid/container.dtd">' + container('scores/main.mscx')),
    }), 'mscz', 'score_dtd_forbidden');
    rejected(scoreZip('mscz', {}, '<!DOCTYPE museScore><museScore><Score/></museScore>'), 'mscz', 'score_dtd_forbidden');
    rejected(scoreZip('mscz', {
      'unused.xml': enc('<!DOCTYPE fake><fake/>'),
    }), 'mscz', 'score_dtd_forbidden');
    expect(checkStructural(enc(`<!-- <!DOCTYPE fake> --><score-partwise>A &amp; B${partwiseBody}</score-partwise>`), 'musicxml').status).toBe('limpa');
  });

  it('limita XML a 4 MiB, container a 64 KiB, arquivo a 16 MiB e profundidade a 64', () => {
    rejected(new Uint8Array(4 * 1024 * 1024 + 1).fill(0x20), 'musicxml', 'score_xml_too_large');
    rejected(new Uint8Array(16 * 1024 * 1024 + 1), 'mscz', 'score_archive_too_large');
    rejected(scoreZip('mscz', {
      'META-INF/container.xml': enc(' '.repeat(64 * 1024 + 1)),
    }), 'mscz', 'score_container_too_large');
    rejected(enc(`<score-partwise>${'<a>'.repeat(64)}${'</a>'.repeat(64)}</score-partwise>`), 'musicxml', 'score_xml_too_deep');
    const atLimit = enc(`<score-partwise>${'<a>'.repeat(63)}${'</a>'.repeat(63)}${partwiseBody}</score-partwise>`);
    expect(checkStructural(atLimit, 'musicxml').status).toBe('limpa');
    const open = '<score-partwise>';
    const close = '</score-partwise>';
    expect(checkStructural(enc(open + partwiseBody + ' '.repeat(4 * 1024 * 1024 - open.length - partwiseBody.length - close.length) + close), 'musicxml').status).toBe('limpa');
    const xml = container('scores/main.mscx');
    expect(checkStructural(scoreZip('mscz', {
      'META-INF/container.xml': [enc(' '.repeat(64 * 1024 - xml.length) + xml), { level: 0 }],
    }), 'mscz').status).toBe('limpa');
  });

  it('limita ZIP a 128 entradas, 8 MiB por entrada, 16 MiB totais e razão de expansão 200', () => {
    const many = Object.fromEntries(Array.from({ length: 127 }, (_, i) => [`extra-${i}`, enc('x')]));
    rejected(scoreZip('mscz', many), 'mscz', 'score_too_many_entries');
    rejected(scoreZip('mscz', { 'large.bin': new Uint8Array(8 * 1024 * 1024 + 1) }), 'mscz', 'score_entry_too_large');
    rejected(scoreZip('mscz', {
      'a.bin': [new Uint8Array(8 * 1024 * 1024), { level: 0 }],
      'b.bin': [new Uint8Array(8 * 1024 * 1024), { level: 0 }],
    }), 'mscz');
    rejected(scoreZip('mscz', { 'bomb.bin': new Uint8Array(1024 * 1024) }), 'mscz', 'score_expansion_limit');
    expect(checkStructural(scoreZip('mscz', Object.fromEntries(
      Array.from({ length: 126 }, (_, i) => [`extra-${i}`, enc('x')]),
    )), 'mscz').status).toBe('limpa');
  });

  it('confere o limite total expandido, independentemente do tamanho de entrada', () => {
    const data = new Uint8Array(8 * 1024 * 1024);
    let seed = 0x12345678;
    for (let i = 0; i < 128 * 1024; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      data[i] = seed & 0xff;
    }
    const bytes = scoreZip('mscz', { 'a.bin': data, 'b.bin': data });
    expect(bytes.length).toBeLessThan(16 * 1024 * 1024);
    rejected(bytes, 'mscz', 'score_expanded_too_large');
  });

  it('confere expansão real mesmo quando metadados ZIP mentem sobre o tamanho', () => {
    const bytes = scoreZip('mscz', { 'bomb.bin': new Uint8Array(1024 * 1024) });
    const view = new DataView(bytes.buffer);
    // Corrupção controlada da fixture: tamanho descomprimido falso nos headers local e central.
    for (let i = 0; i + 46 < bytes.length; i++) {
      const signature = view.getUint32(i, true);
      if (signature === 0x04034b50 && new TextDecoder().decode(bytes.subarray(i + 30, i + 38)) === 'bomb.bin') {
        view.setUint32(i + 22, 100, true);
      }
      if (signature === 0x02014b50 && new TextDecoder().decode(bytes.subarray(i + 46, i + 54)) === 'bomb.bin') {
        view.setUint32(i + 24, 100, true);
      }
    }
    rejected(bytes, 'mscz');
  });
});
