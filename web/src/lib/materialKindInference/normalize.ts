const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const EXT_RE = /\.(pdf|mp3|mid|midi|chord|txt|wav|ogg|m4a|gestures|bin)$/i;

const NOISE_RE =
  /\(\s*\d+\s*\)|\bcopy\b|\bfinal\b|\brascunho\b|\bdraft\b|\bversao\b|\bversão\b/gi;

/** Strip accents and lowercase for matching. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Map trailing arabic numerals to roman (1→i, 2→ii) for voice/chord variants. */
function normalizeNumerals(text: string): string {
  return text
    .replace(/\b1\b/g, ' i')
    .replace(/\b2\b/g, ' ii')
    .replace(/\b3\b/g, ' iii')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripExtension(name: string): string {
  return name.replace(EXT_RE, '');
}

export function stripUuids(text: string): string {
  return text.replace(UUID_RE, ' ').replace(/\s+/g, ' ').trim();
}

export function cleanFileStem(stem: string): string {
  let s = stripUuids(stem);
  s = s.replace(NOISE_RE, ' ');
  s = normalizeNumerals(normalizeForMatch(s));
  return s.replace(/\s+/g, ' ').trim();
}

/** Extract label from ZIP export pattern: `{label}-{uuid}.ext` */
export function extractZipLabel(fileName: string): string | null {
  const stem = stripExtension(fileName);
  const uuidMatch = stem.match(
    /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );
  if (!uuidMatch || uuidMatch.index === undefined) return null;
  const label = stem.slice(0, uuidMatch.index);
  const cleaned = cleanFileStem(label);
  return cleaned || null;
}

export function pathSegments(relPath: string): string[] {
  const parts = relPath.split(/[/\\]/).filter(Boolean);
  if (parts.length <= 1) return [];
  return parts.slice(0, -1).reverse();
}

export function findKindUuidsInText(text: string, catalogIds: Set<string>): string | null {
  const matches = text.match(UUID_RE);
  if (!matches) return null;
  for (const id of matches) {
    const lower = id.toLowerCase();
    if (catalogIds.has(lower)) return lower;
  }
  return null;
}

export type TextCandidate = {
  text: string;
  source: 'zip-label' | 'basename' | 'folder' | 'full-path';
};

export function buildCandidates(fileName: string, relPath: string): TextCandidate[] {
  const candidates: TextCandidate[] = [];
  const zipLabel = extractZipLabel(fileName);
  if (zipLabel) candidates.push({ text: zipLabel, source: 'zip-label' });

  const basename = cleanFileStem(stripExtension(fileName));
  if (basename) candidates.push({ text: basename, source: 'basename' });

  for (const seg of pathSegments(relPath)) {
    const cleaned = cleanFileStem(stripExtension(seg));
    if (cleaned) candidates.push({ text: cleaned, source: 'folder' });
  }

  const full = cleanFileStem(stripExtension(relPath.replace(/[/\\]/g, ' ')));
  if (full) candidates.push({ text: full, source: 'full-path' });

  return candidates;
}
