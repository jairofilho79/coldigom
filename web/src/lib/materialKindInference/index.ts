import { GENERATED_ALIASES } from './aliases.generated';
import { MANUAL_ALIASES } from './aliases.manual';
import {
  AMBIGUITY_DELTA,
  CONFIDENCE_THRESHOLD,
  UNKNOWN_MATERIAL_KIND_ID,
} from './constants';
import { fuzzyAcceptable, similarityRatio } from './levenshtein';
import {
  buildCandidates,
  findKindUuidsInText,
  normalizeForMatch,
  type TextCandidate,
} from './normalize';

export type InferenceMethod = 'uuid' | 'exact' | 'token' | 'zip-label' | 'fuzzy' | 'unknown';

export type InferenceResult = {
  materialKindId: string;
  confidence: number;
  method: InferenceMethod;
  matchedOn?: string;
};

export type InferMaterialKindInput = {
  fileName: string;
  relPath: string;
  catalogIds: Set<string>;
};

type ScoredCandidate = {
  kindId: string;
  score: number;
  method: InferenceMethod;
  matchedOn: string;
  aliasLen: number;
};

type AliasIndexEntry = {
  kindId: string;
  normalized: string;
  aliasLen: number;
};

let aliasIndexCache: AliasIndexEntry[] | null = null;

function buildAliasIndex(): AliasIndexEntry[] {
  if (aliasIndexCache) return aliasIndexCache;

  const byKind = new Map<string, Set<string>>();

  for (const [kindId, aliases] of Object.entries(GENERATED_ALIASES)) {
    let set = byKind.get(kindId);
    if (!set) {
      set = new Set();
      byKind.set(kindId, set);
    }
    for (const a of aliases) set.add(a);
  }

  for (const [kindId, aliases] of Object.entries(MANUAL_ALIASES)) {
    let set = byKind.get(kindId);
    if (!set) {
      set = new Set();
      byKind.set(kindId, set);
    }
    for (const a of aliases) set.add(a);
  }

  const entries: AliasIndexEntry[] = [];
  for (const [kindId, aliases] of byKind) {
    for (const alias of aliases) {
      const normalized = normalizeForMatch(alias);
      if (normalized) {
        entries.push({ kindId, normalized, aliasLen: normalized.length });
      }
    }
  }

  entries.sort((a, b) => b.aliasLen - a.aliasLen);
  aliasIndexCache = entries;
  return entries;
}

/** Reset cache (tests only). */
export function resetAliasIndexCache(): void {
  aliasIndexCache = null;
}

function sourceBonus(source: TextCandidate['source']): number {
  switch (source) {
    case 'zip-label':
      return 0.02;
    case 'basename':
      return 0.05;
    case 'folder':
      return 0;
    case 'full-path':
      return -0.02;
  }
}

function scoreExact(text: string, alias: string): boolean {
  return text === alias;
}

function scoreToken(text: string, alias: string): boolean {
  if (text === alias) return true;
  if (alias.length < 3) return text === alias;
  const re = new RegExp(`(?:^|\\s)${escapeRegExp(alias)}(?:\\s|$)`);
  return re.test(text);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchAliases(
  candidate: TextCandidate,
  catalogIds: Set<string>,
  index: AliasIndexEntry[]
): ScoredCandidate[] {
  const text = candidate.text;
  const results: ScoredCandidate[] = [];

  for (const entry of index) {
    if (!catalogIds.has(entry.kindId)) continue;

    if (scoreExact(text, entry.normalized)) {
      const base =
        candidate.source === 'zip-label'
          ? 0.92
          : 0.95 + sourceBonus(candidate.source);
      results.push({
        kindId: entry.kindId,
        score: Math.min(base, 1),
        method: candidate.source === 'zip-label' ? 'zip-label' : 'exact',
        matchedOn: text,
        aliasLen: entry.aliasLen,
      });
      continue;
    }

    if (scoreToken(text, entry.normalized)) {
      const base = 0.75 + Math.min(entry.aliasLen / 40, 0.15) + sourceBonus(candidate.source);
      results.push({
        kindId: entry.kindId,
        score: Math.min(base, 0.9),
        method: 'token',
        matchedOn: text,
        aliasLen: entry.aliasLen,
      });
    }
  }

  return results;
}

function matchFuzzy(
  candidate: TextCandidate,
  catalogIds: Set<string>,
  index: AliasIndexEntry[]
): ScoredCandidate[] {
  const text = candidate.text;
  const results: ScoredCandidate[] = [];

  for (const entry of index) {
    if (!catalogIds.has(entry.kindId)) continue;
    if (!fuzzyAcceptable(text, entry.normalized)) continue;

    const ratio = similarityRatio(text, entry.normalized);
    const score = ratio * 0.85 + sourceBonus(candidate.source);
    if (score < 0.6) continue;

    results.push({
      kindId: entry.kindId,
      score: Math.min(score, 0.84),
      method: 'fuzzy',
      matchedOn: text,
      aliasLen: entry.aliasLen,
    });
  }

  return results;
}

function pickBest(scored: ScoredCandidate[]): ScoredCandidate | null {
  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.aliasLen !== a.aliasLen) return b.aliasLen - a.aliasLen;
    return a.kindId.localeCompare(b.kindId);
  });

  const best = scored[0];
  const second = scored[1];

  if (second && best.score - second.score <= AMBIGUITY_DELTA && best.kindId !== second.kindId) {
    return null;
  }

  return best;
}

function unknownResult(): InferenceResult {
  return {
    materialKindId: UNKNOWN_MATERIAL_KIND_ID,
    confidence: 0,
    method: 'unknown',
  };
}

export function inferMaterialKind(input: InferMaterialKindInput): InferenceResult {
  const { fileName, relPath, catalogIds } = input;
  const effectiveCatalog = new Set(catalogIds);
  effectiveCatalog.add(UNKNOWN_MATERIAL_KIND_ID);

  const combined = `${relPath} ${fileName}`;
  const uuidKind = findKindUuidsInText(combined, effectiveCatalog);
  if (uuidKind && uuidKind !== UNKNOWN_MATERIAL_KIND_ID) {
    return {
      materialKindId: uuidKind,
      confidence: 1,
      method: 'uuid',
      matchedOn: uuidKind,
    };
  }

  const index = buildAliasIndex();
  const candidates = buildCandidates(fileName, relPath);
  const allScored: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    allScored.push(...matchAliases(candidate, effectiveCatalog, index));
  }

  let best = pickBest(allScored);

  if (!best) {
    for (const candidate of candidates) {
      if (candidate.source === 'full-path') continue;
      allScored.push(...matchFuzzy(candidate, effectiveCatalog, index));
    }
    best = pickBest(allScored);
  }

  if (!best || best.score < CONFIDENCE_THRESHOLD) {
    return unknownResult();
  }

  return {
    materialKindId: best.kindId,
    confidence: best.score,
    method: best.method,
    matchedOn: best.matchedOn,
  };
}

export function inferTypeFromExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'mp3') return 'mp3';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'chord') return 'chord';
  if (ext === 'mid' || ext === 'midi') return 'mid';
  return ext || 'bin';
}

export { UNKNOWN_MATERIAL_KIND_ID } from './constants';
