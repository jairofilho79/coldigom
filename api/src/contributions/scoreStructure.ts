import { Crc32 } from '@aws-crypto/crc32';
import { Unzip, UnzipInflate, unzipSync, type UnzipFileInfo } from 'fflate';
import { SaxesParser } from 'saxes';

export type ScoreType = 'mscz' | 'mxl' | 'musicxml';

// Limites independentes dos metadados ZIP; a expansão real também é contada.
const MAX_ARCHIVE = 16 * 1024 * 1024;
const MAX_ENTRIES = 128;
const MAX_ENTRY = 8 * 1024 * 1024;
const MAX_EXPANDED = 16 * 1024 * 1024;
const MAX_RATIO = 200;
const MAX_XML = 4 * 1024 * 1024;
const MAX_CONTAINER = 64 * 1024;
const MAX_DEPTH = 64;
const CONTAINER = 'META-INF/container.xml';
const CONTAINER_NS = 'urn:oasis:names:tc:opendocument:xmlns:container';
const MUSICXML_NS = 'http://www.musicxml.org/ns/musicxml';
const MUSICXML_MEDIA = 'application/vnd.recordare.musicxml+xml';
// PUBLICs legados constam no catálogo oficial: w3c/musicxml v4.0/schema/catalog.xml.
const PUBLIC_DTD_VERSIONS = ['1.0', '1.1', '2.0', '3.0', '3.1', '4.0'];

class InvalidScore extends Error {}

function fail(reason: string): never {
  throw new InvalidScore(reason);
}

function safePath(name: string, directory = false): boolean {
  if (!name || name.length > 1024 || /[\\:%]/u.test(name)) return false;
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  const path = directory && name.endsWith('/') ? name.slice(0, -1) : name;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

type XmlInfo = {
  root: string;
  uri: string;
  scores: number;
  rootfiles: { path: string; media?: string }[];
};

function parseXml(bytes: Uint8Array, container = false): XmlInfo {
  if (bytes.length > (container ? MAX_CONTAINER : MAX_XML)) {
    fail(container ? 'score_container_too_large' : 'score_xml_too_large');
  }
  let xml: string;
  try {
    xml = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return fail('score_invalid_xml');
  }
  const info: XmlInfo = { root: '', uri: '', scores: 0, rootfiles: [] };
  const parser = new SaxesParser({ xmlns: true });
  const ancestors: string[] = [];
  let doctype: { root: string; version: string } | undefined;
  parser.on('error', () => fail('score_invalid_xml'));
  parser.on('doctype', (declaration) => {
    // Só reconhece a declaração inerte inteira: nada de subset, entidades ou
    // SYSTEM isolado. saxes não carrega nem resolve o recurso externo.
    const match = /^[ \t\r\n]*(score-partwise|score-timewise|container)[ \t\r\n]+PUBLIC[ \t\r\n]+(["'])([^"']+)\2[ \t\r\n]+(["'])([^"']+)\4[ \t\r\n]*$/.exec(declaration);
    if (!match) fail('score_dtd_forbidden');
    const [, root, , publicId, , systemId] = match;
    const kind = root === 'container' ? 'Container' : root === 'score-partwise' ? 'Partwise' : 'Timewise';
    const versions = root === 'container' ? PUBLIC_DTD_VERSIONS.slice(2) : PUBLIC_DTD_VERSIONS;
    const version = versions.find((v) => publicId === `-//Recordare//DTD MusicXML ${v} ${kind}//EN`);
    const path = `www.musicxml.org/dtds/${kind.toLowerCase()}.dtd`;
    if (!version || container !== (root === 'container') || ![`http://${path}`, `https://${path}`].includes(systemId)) {
      fail('score_dtd_forbidden');
    }
    doctype = { root, version };
  });
  parser.on('opentag', (tag) => {
    if (ancestors.length >= MAX_DEPTH) fail('score_xml_too_deep');
    if (!ancestors.length) {
      if (doctype && (tag.name !== doctype.root || (!container && tag.attributes.version !== undefined
        && tag.attributes.version.value !== doctype.version))) fail('score_root_mismatch');
      info.root = tag.local;
      info.uri = tag.uri;
    }
    if (tag.uri === info.uri) {
      if (ancestors.length === 1 && info.root === 'museScore' && tag.local === 'Score') info.scores++;
      if (container && ancestors.join('/') === 'container/rootfiles' && tag.local === 'rootfile') {
        const path = tag.attributes['full-path']?.value;
        const media = tag.attributes['media-type']?.value;
        if (!path || info.rootfiles.length) fail('score_invalid_container');
        info.rootfiles.push({ path, media });
      }
    }
    // Namespace diferente não pode forjar a hierarquia do container.
    ancestors.push(tag.uri === info.uri ? tag.local : '');
  });
  parser.on('closetag', () => { ancestors.pop(); });
  parser.write(xml).close();
  return info;
}

function isMusicXml(info: XmlInfo): boolean {
  return (info.root === 'score-partwise' || info.root === 'score-timewise')
    && (info.uri === '' || info.uri === MUSICXML_NS);
}

function xmlEntry(name: string): boolean {
  return /\.(?:xml|musicxml|mscx)$/i.test(name);
}

/**
 * fflate lê o diretório sem extrair; só então a API streaming descomprime em
 * blocos de 1 KiB. Não confiamos no tamanho declarado para alocar a saída.
 * Cabeçalhos locais e diretório precisam descrever as mesmas entradas.
 */
function readArchive(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557)
    && (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== bytes.length)) end--;
  if (end < Math.max(0, bytes.length - 65557)) fail('score_invalid_archive');
  const count = view.getUint16(end + 10, true);
  if (count > MAX_ENTRIES) fail('score_too_many_entries');
  const directory = view.getUint32(end + 16, true);
  if (!count || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)
    || view.getUint16(end + 8, true) !== count || directory + view.getUint32(end + 12, true) !== end) {
    fail('score_invalid_archive');
  }
  const entries = new Map<string, UnzipFileInfo & { checksum: number }>();
  const regions: [number, number][] = [];
  let at = directory;
  // fflate não valida assinatura/flags/CRC do envelope. Estes checks só limitam
  // e cruzam os headers; nomes, diretório e descompressão continuam na biblioteca.
  const checkEnvelope = (entry: UnzipFileInfo): number => {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) fail('score_invalid_archive');
    const flags = view.getUint16(at + 8, true);
    const nameSize = view.getUint16(at + 28, true);
    const next = at + 46 + nameSize + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const checksum = view.getUint32(at + 16, true);
    if (next > end || (flags & ~0x080e) || view.getUint16(at + 34, true)
      || (view.getUint32(at + 38, true) >>> 16 & 0xf000) === 0xa000
      || local + 30 > directory || view.getUint32(local, true) !== 0x04034b50
      || view.getUint16(local + 6, true) !== flags
      || view.getUint16(local + 8, true) !== entry.compression
      || view.getUint16(local + 26, true) !== nameSize) fail('score_invalid_archive');
    const data = local + 30 + nameSize + view.getUint16(local + 28, true);
    let dataEnd = data + entry.size;
    if (dataEnd > directory || !bytes.subarray(at + 46, at + 46 + nameSize)
      .every((b, i) => b === bytes[local + 30 + i])) fail('score_invalid_archive');
    if (flags & 8) {
      if (dataEnd + 12 > directory) fail('score_invalid_archive');
      const descriptor = dataEnd + (view.getUint32(dataEnd, true) === 0x08074b50 ? 4 : 0);
      dataEnd = descriptor + 12;
      if (dataEnd > directory || view.getUint32(descriptor, true) !== checksum
        || view.getUint32(descriptor + 4, true) !== entry.size
        || view.getUint32(descriptor + 8, true) !== entry.originalSize) fail('score_invalid_archive');
    } else if (view.getUint32(local + 14, true) !== checksum
      || view.getUint32(local + 18, true) !== entry.size
      || view.getUint32(local + 22, true) !== entry.originalSize) fail('score_invalid_archive');
    regions.push([local, dataEnd]);
    at = next;
    return checksum;
  };
  let declaredTotal = 0;
  unzipSync(bytes, {
    filter: (entry) => {
      if (entries.size >= MAX_ENTRIES) fail('score_too_many_entries');
      if (!safePath(entry.name, true)) fail('score_unsafe_path');
      if (entries.has(entry.name)) fail('score_invalid_archive');
      if (![entry.size, entry.originalSize].every((n) => Number.isSafeInteger(n) && n >= 0)
        || entry.size > bytes.length || (entry.compression !== 0 && entry.compression !== 8)) {
        fail('score_invalid_archive');
      }
      if (entry.originalSize > MAX_ENTRY) fail('score_entry_too_large');
      if (entry.name === CONTAINER && entry.originalSize > MAX_CONTAINER) fail('score_container_too_large');
      if (xmlEntry(entry.name) && entry.originalSize > MAX_XML) fail('score_xml_too_large');
      declaredTotal += entry.originalSize;
      if (declaredTotal > MAX_EXPANDED) fail('score_expanded_too_large');
      if (entry.originalSize > Math.max(1, entry.size) * MAX_RATIO) fail('score_expansion_limit');
      entries.set(entry.name, { ...entry, checksum: checkEnvelope(entry) });
      return false;
    },
  });
  if (entries.size !== count || at !== end) fail('score_invalid_archive');
  let boundary = 0;
  for (const [start, finish] of regions.sort((a, b) => a[0] - b[0])) {
    if (start !== boundary) fail('score_invalid_archive');
    boundary = finish;
  }
  if (boundary !== directory) fail('score_invalid_archive');

  const documents = new Map<string, Uint8Array>();
  const seen = new Set<string>();
  let completed = 0;
  let expanded = 0;
  const unzip = new Unzip((file) => {
    const entry = entries.get(file.name);
    if (!entry || seen.has(file.name) || entry.compression !== file.compression
      || (file.size !== undefined && file.size !== entry.size)
      || (file.originalSize !== undefined && file.originalSize !== entry.originalSize)) {
      fail('score_invalid_archive');
    }
    seen.add(file.name);
    const chunks: Uint8Array[] = [];
    const checksum = new Crc32();
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (error instanceof InvalidScore) throw error;
      if (error) fail('score_invalid_archive');
      size += chunk.length;
      expanded += chunk.length;
      if (size > MAX_ENTRY) fail('score_entry_too_large');
      if (expanded > MAX_EXPANDED) fail('score_expanded_too_large');
      if (size > Math.max(1, entry.size) * MAX_RATIO) fail('score_expansion_limit');
      if (size > entry.originalSize) fail('score_invalid_archive');
      checksum.update(chunk);
      if (xmlEntry(file.name)) chunks.push(chunk);
      if (final) {
        if (size !== entry.originalSize || checksum.digest() !== entry.checksum) fail('score_invalid_archive');
        completed++;
        if (xmlEntry(file.name)) {
          const output = new Uint8Array(size);
          let offset = 0;
          for (const part of chunks) {
            output.set(part, offset);
            offset += part.length;
          }
          documents.set(file.name, output);
        }
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += 1024) {
    unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
  }
  if (seen.size !== entries.size || completed !== entries.size) fail('score_invalid_archive');
  return documents;
}

/** Sem I/O, resolução de entidades, extração em disco ou confiança na extensão. */
export function scoreStructuralReason(bytes: Uint8Array, type: ScoreType): string | undefined {
  try {
    if (type === 'musicxml') {
      if (bytes.length > MAX_XML) fail('score_xml_too_large');
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) fail('signature_mismatch');
      if (!isMusicXml(parseXml(bytes))) fail('score_root_mismatch');
      return;
    }
    if (bytes.length > MAX_ARCHIVE) fail('score_archive_too_large');
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4)) {
      fail('signature_mismatch');
    }
    const documents = readArchive(bytes);
    const container = documents.get(CONTAINER);
    if (!container) fail('score_missing_container');
    const info = parseXml(container, true);
    if (info.root !== 'container' || (info.uri !== '' && info.uri !== CONTAINER_NS) || info.rootfiles.length !== 1) {
      fail('score_invalid_container');
    }
    const target = info.rootfiles[0];
    if (!safePath(target.path)) fail('score_unsafe_path');
    if (type === 'mscz') {
      if (!/\.mscx$/i.test(target.path)
        || (target.media !== undefined && !['application/x-musescore', 'application/vnd.musescore'].includes(target.media))) {
        fail('score_container_mismatch');
      }
    } else if (!/\.(?:xml|musicxml)$/i.test(target.path) || target.media !== MUSICXML_MEDIA) {
      fail('score_container_mismatch');
    }
    if (!documents.has(target.path)) fail('score_missing_target');
    for (const [name, content] of documents) {
      if (name === CONTAINER) continue;
      const doc = parseXml(content);
      if (name === target.path) {
        const matches = type === 'mscz'
          ? doc.root === 'museScore' && doc.uri === '' && doc.scores === 1
          : isMusicXml(doc);
        if (!matches) fail('score_root_mismatch');
      }
    }
    return;
  } catch (error) {
    return error instanceof InvalidScore ? error.message
      : type === 'musicxml' ? 'score_invalid_xml' : 'score_invalid_archive';
  }
}
