/**
 * Motor de Triagem e Classificação de Contribuições usando IA de Decisão.
 * Modelo: @cf/cloudflare/clef-omni (Cloudflare Workers AI).
 *
 * Ao contrário de LLMs generativos, o Clef-omni processa entradas multimodais
 * (texto, imagens, áudios) e perguntas tipadas (choice/noul) retornando distribuições
 * de probabilidade calibradas em um único forward pass (~130-150ms).
 */
import type { Env } from '../env';
import { getContribution, listFiles, type ContributionFileRow, type ContributionRow } from '../contributions/repo';
import { getPraiseDetail } from './mcpTools';

export const CLEF_OMNI_MODEL = '@cf/cloudflare/clef-omni';

export type TriageIntent =
  | 'praise_or_compliment'
  | 'critique'
  | 'bug_report'
  | 'feature_suggestion'
  | 'catalog_correction'
  | 'spam_or_noise';

export type TriageSeverity = 'critical' | 'moderate' | 'minor' | 'none';

export type TriageUrgency = 'immediate' | 'normal' | 'backlog';

export type RecommendedAction =
  | 'run_planner'
  | 'notify_dev_urgent'
  | 'review_dev_bug'
  | 'feedback_backlog'
  | 'compliment_archive'
  | 'spam_filter';

export type TriageResult = {
  id: string;
  contributionId: string;
  modelName: string;
  intent: TriageIntent;
  severity: TriageSeverity;
  urgency: TriageUrgency;
  isActionable: boolean;
  requiresCuration: boolean;
  recommendedAction: RecommendedAction;
  confidence: number;
  scores: Record<string, unknown>;
  stateSummary: string;
  createdAt: string;
};

export const CONTRIBUTION_DECISION_QUESTIONS = {
  intent: {
    type: 'choice' as const,
    criteria: {
      praise_or_compliment: 'Elogio, agradecimento ou mensagem positiva pelo app ou acervo musical',
      critique: 'Reclamação ou crítica sobre experiência, lentidão ou ausência de algo',
      bug_report: 'Relato de falha técnica, travamento, tela branca, erro de sistema ou comportamento inesperado no app',
      feature_suggestion: 'Sugestão de nova funcionalidade, recurso, layout ou melhoria de usabilidade',
      catalog_correction: 'Correção ou adição de letra, tom musical, cifras, autor, numeração ou partitura de um louvor',
      spam_or_noise: 'Conteúdo desconexo, caracteres aleatórios, spam, ofensa, mensagem sem sentido ou teste vazio',
    },
  },
  severity: {
    type: 'choice' as const,
    criteria: {
      critical: 'Impede o uso do app durante o culto/ensaio, fecha sozinho, quebra tela ou bloqueia acesso total',
      moderate: 'Afeta uma função específica mas o usuário consegue continuar usando o app',
      minor: 'Pequeno detalhe estético, digitação ou erro cosmético que não impede o uso',
      none: 'Não representa problema técnico ou erro de acervo (ex: elogio, agradecimento ou sugestão geral)',
    },
  },
  urgency: {
    type: 'choice' as const,
    criteria: {
      immediate: 'Exige atenção imediata da equipe (culto/ensaio em andamento ou bug quebrando em produção)',
      normal: 'Pode ser avaliado no fluxo regular de curadoria ou sprint de desenvolvimento',
      backlog: 'Pode aguardar planejamento futuro sem pressa (ideias, sugestões de longo prazo)',
    },
  },
  requires_catalog_curation: {
    type: 'noul' as const,
    instructions: 'O relato requer edição, inclusão ou correção no banco de dados de hinos, partituras ou cifras musicais?',
  },
  is_actionable: {
    type: 'noul' as const,
    instructions: 'O relato fornece detalhes suficientes para a equipe entender, reproduzir o problema ou aplicar a melhoria sugerida?',
  },
};

/**
 * Constrói o texto de contexto (state) enriquecido para o modelo de decisão.
 */
export function buildDecisionState(
  contrib: ContributionRow,
  praiseInfo: Record<string, unknown> | null = null,
  files: ContributionFileRow[] = []
): string {
  const lines: string[] = [];

  lines.push('=== RELATO DO USUÁRIO ===');
  lines.push(`Título: ${contrib.title ?? 'Sem título'}`);
  lines.push(`Descrição/Corpo: ${contrib.body ?? 'Sem descrição'}`);

  if (contrib.links) {
    try {
      const parsedLinks = JSON.parse(contrib.links) as { url: string }[];
      if (Array.isArray(parsedLinks) && parsedLinks.length > 0) {
        lines.push(`Links anexados: ${parsedLinks.map((l) => l.url).join(', ')}`);
      }
    } catch { /* ignora */ }
  }

  if (contrib.fields) {
    try {
      const parsedFields = JSON.parse(contrib.fields);
      if (parsedFields && Object.keys(parsedFields).length > 0) {
        lines.push(`Campos específicos: ${JSON.stringify(parsedFields)}`);
      }
    } catch { /* ignora */ }
  }

  lines.push('');
  lines.push('=== CONTEXTO DA APLICAÇÃO ===');

  if (praiseInfo) {
    const p = praiseInfo as { name?: string; number?: string; tonality?: string; rhythm?: string; author?: string };
    lines.push(
      `Louvor em Exibição: "${p.name ?? 'Sem título'}" (Nº: ${p.number ?? 'S/N'}, Tom: ${p.tonality ?? '?'}, Ritmo: ${p.rhythm ?? '?'}, Autor: ${p.author ?? '?'})`
    );
  } else if (contrib.target_praise_id) {
    lines.push(`Louvor Alvo ID: ${contrib.target_praise_id}`);
  } else {
    lines.push('Louvor Alvo: Nenhum (relato geral do app)');
  }

  lines.push(`Rota do App: ${contrib.app_route ?? 'desconhecida'}`);
  lines.push(`Versão do App: ${contrib.app_version ?? 'desconhecida'}`);

  if (contrib.device) {
    lines.push(`Dispositivo: ${contrib.device}`);
  } else {
    lines.push('Dispositivo: não informado');
  }

  if (files.length > 0) {
    lines.push(`Arquivos Anexados (${files.length}):`);
    for (const f of files) {
      lines.push(`- ${f.original_name} (${f.declared_type}, ${f.size} bytes)`);
    }
  } else {
    lines.push('Arquivos Anexados: nenhum');
  }

  return lines.join('\n');
}

/**
 * Calcula a ação recomendada a partir da matriz de classificação.
 */
export function computeRecommendedAction(
  intent: TriageIntent,
  severity: TriageSeverity,
  urgency: TriageUrgency,
  requiresCuration: boolean,
  isActionable: boolean
): RecommendedAction {
  if (intent === 'spam_or_noise' || (!isActionable && intent === 'critique')) {
    return 'spam_filter';
  }
  if (intent === 'praise_or_compliment') {
    return 'compliment_archive';
  }
  if (requiresCuration || intent === 'catalog_correction') {
    return 'run_planner';
  }
  if (intent === 'bug_report') {
    if (severity === 'critical' || urgency === 'immediate') {
      return 'notify_dev_urgent';
    }
    return 'review_dev_bug';
  }
  return 'feedback_backlog';
}

function extractChoiceAndScores<T extends string>(
  answer: unknown,
  allowedValues: readonly T[],
  fallback: T
): { choice: T; confidence: number; scores: Record<string, number> } {
  if (!answer || typeof answer !== 'object') {
    return { choice: fallback, confidence: 1.0, scores: { [fallback]: 1.0 } };
  }

  const obj = answer as { choice?: string; scores?: Record<string, number> };
  const scores: Record<string, number> = {};

  if (obj.scores && typeof obj.scores === 'object') {
    for (const [k, v] of Object.entries(obj.scores)) {
      if (typeof v === 'number') scores[k] = v;
    }
  }

  // Se o modelo já indicou explicitamente a escolha:
  if (obj.choice && allowedValues.includes(obj.choice as T)) {
    const choice = obj.choice as T;
    return { choice, confidence: scores[choice] ?? 1.0, scores };
  }

  // Senão, encontra o candidato com maior pontuação:
  let bestKey = fallback;
  let maxScore = -1;
  for (const val of allowedValues) {
    const s = scores[val] ?? 0;
    if (s > maxScore) {
      maxScore = s;
      bestKey = val;
    }
  }

  return { choice: bestKey, confidence: maxScore >= 0 ? maxScore : 1.0, scores };
}

function extractNoul(answer: unknown, threshold = 0.5): boolean {
  if (!answer || typeof answer !== 'object') return false;
  const obj = answer as { noul?: unknown; value?: unknown };
  if (typeof obj.noul === 'boolean') return obj.noul;
  if (typeof obj.noul === 'number') return obj.noul >= threshold;
  if (typeof obj.value === 'number') return obj.value >= threshold;
  return false;
}

const VALID_INTENTS: readonly TriageIntent[] = [
  'praise_or_compliment',
  'critique',
  'bug_report',
  'feature_suggestion',
  'catalog_correction',
  'spam_or_noise',
];

const VALID_SEVERITIES: readonly TriageSeverity[] = ['critical', 'moderate', 'minor', 'none'];

const VALID_URGENCIES: readonly TriageUrgency[] = ['immediate', 'normal', 'backlog'];

/**
 * Converte a resposta do Clef-Omni no formato canônico da triagem.
 */
export function parseClefOmniResponse(raw: unknown): {
  intent: TriageIntent;
  confidence: number;
  severity: TriageSeverity;
  urgency: TriageUrgency;
  requiresCuration: boolean;
  isActionable: boolean;
  scores: Record<string, unknown>;
} | null {
  if (!raw || typeof raw !== 'object') return null;

  let answers: Record<string, unknown> | null = null;
  const container = raw as { answers?: Record<string, unknown>; response?: string };

  if (container.answers && typeof container.answers === 'object') {
    answers = container.answers;
  } else if (typeof container.response === 'string') {
    try {
      const parsed = JSON.parse(container.response);
      answers = parsed.answers ?? parsed;
    } catch {
      return null;
    }
  } else {
    answers = raw as Record<string, unknown>;
  }

  if (!answers) return null;

  const { choice: intent, confidence: intentConf, scores: intentScores } = extractChoiceAndScores<TriageIntent>(
    answers.intent,
    VALID_INTENTS,
    'critique'
  );

  const { choice: severity, scores: sevScores } = extractChoiceAndScores<TriageSeverity>(
    answers.severity,
    VALID_SEVERITIES,
    'minor'
  );

  const { choice: urgency, scores: urgScores } = extractChoiceAndScores<TriageUrgency>(
    answers.urgency,
    VALID_URGENCIES,
    'normal'
  );

  const requiresCuration = extractNoul(answers.requires_catalog_curation);
  const isActionable = answers.is_actionable !== undefined ? extractNoul(answers.is_actionable) : true;

  return {
    intent,
    confidence: Number(intentConf.toFixed(4)),
    severity,
    urgency,
    requiresCuration,
    isActionable,
    scores: {
      intent: intentScores,
      severity: sevScores,
      urgency: urgScores,
      requires_catalog_curation: answers.requires_catalog_curation,
      is_actionable: answers.is_actionable,
    },
  };
}

/**
 * Fallback determinístico caso o Workers AI não esteja disponível ou falhe.
 */
export function generateFallbackTriage(
  contrib: ContributionRow,
  praiseInfo: Record<string, unknown> | null = null
): Omit<TriageResult, 'id' | 'contributionId' | 'modelName' | 'stateSummary' | 'createdAt'> {
  const body = (contrib.body ?? '').toLowerCase();
  const title = (contrib.title ?? '').toLowerCase();
  const text = `${title} ${body}`.trim();

  let intent: TriageIntent = 'critique';
  let severity: TriageSeverity = 'minor';
  let urgency: TriageUrgency = 'normal';
  let requiresCuration = false;

  // 1. Verificação de Catálogo de Hinos
  const catalogKeywords = /(cifra|tom |tom:|letra|estrofe|coro|partitura|harmonia|acorde|hino|autor|bpm|ritmo)/i;
  if (
    contrib.kind === 'wrong_info' ||
    contrib.kind === 'content' ||
    Boolean(contrib.target_praise_id && (catalogKeywords.test(text) || praiseInfo))
  ) {
    intent = 'catalog_correction';
    requiresCuration = true;
    severity = 'minor';
    urgency = 'normal';
  }
  // 2. Elogio ou agradecimento
  else if (/(obrigad|parab[eé]ns|aben[cç]|maravilh|excelente|muito bom|gratid[aã]o|amo o app|gostei muito)/i.test(text)) {
    intent = 'praise_or_compliment';
    severity = 'none';
    urgency = 'backlog';
  }
  // 3. Relato de Bug / Falha Técnica
  else if (
    contrib.kind === 'bug' ||
    /(travou|n[aã]o abre|fecha sozinho|crash|tela preta|tela branca|parou de funcionar|bug|erro|falha)/i.test(text)
  ) {
    intent = 'bug_report';
    if (/(n[aã]o abre|fecha sozinho|crash|parou de funcionar|bloqueia)/i.test(text)) {
      severity = 'critical';
      urgency = 'immediate';
    } else {
      severity = 'moderate';
      urgency = 'normal';
    }
  }
  // 4. Sugestão de melhoria ou recurso novo
  else if (
    contrib.kind === 'improvement' ||
    /(sugiro|sugest[aã]o|seria bom|poderia ter|adicionar|gostaria de|recurso novo)/i.test(text)
  ) {
    intent = 'feature_suggestion';
    severity = 'none';
    urgency = 'backlog';
  }
  // 5. Spam / teste vazio
  else if (text.trim().length < 5 || /^(teste|asdf|1234|abc|ola|oi)$/i.test(text.trim())) {
    intent = 'spam_or_noise';
    severity = 'none';
    urgency = 'backlog';
  }

  const isActionable = text.trim().length >= 8 && intent !== 'spam_or_noise';
  const recommendedAction = computeRecommendedAction(intent, severity, urgency, requiresCuration, isActionable);

  return {
    intent,
    severity,
    urgency,
    isActionable,
    requiresCuration,
    recommendedAction,
    confidence: 1.0,
    scores: { fallback: true },
  };
}

export async function saveTriage(db: D1Database, t: TriageResult): Promise<void> {
  await db
    .prepare(
      `INSERT INTO contribution_triages (
        id, contribution_id, model_name, intent, severity, urgency,
        is_actionable, requires_curation, recommended_action, confidence,
        scores_json, state_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(contribution_id) DO UPDATE SET
        model_name = excluded.model_name,
        intent = excluded.intent,
        severity = excluded.severity,
        urgency = excluded.urgency,
        is_actionable = excluded.is_actionable,
        requires_curation = excluded.requires_curation,
        recommended_action = excluded.recommended_action,
        confidence = excluded.confidence,
        scores_json = excluded.scores_json,
        state_summary = excluded.state_summary,
        created_at = excluded.created_at`
    )
    .bind(
      t.id,
      t.contributionId,
      t.modelName,
      t.intent,
      t.severity,
      t.urgency,
      t.isActionable ? 1 : 0,
      t.requiresCuration ? 1 : 0,
      t.recommendedAction,
      t.confidence,
      JSON.stringify(t.scores),
      t.stateSummary,
      t.createdAt
    )
    .run();
}

type TriageRow = {
  id: string;
  contribution_id: string;
  model_name: string;
  intent: string;
  severity: string;
  urgency: string;
  is_actionable: number;
  requires_curation: number;
  recommended_action: string;
  confidence: number;
  scores_json: string;
  state_summary: string;
  created_at: string;
};

function rowToResult(r: TriageRow): TriageResult {
  let scores: Record<string, unknown> = {};
  try {
    scores = JSON.parse(r.scores_json);
  } catch { /* vazio */ }

  return {
    id: r.id,
    contributionId: r.contribution_id,
    modelName: r.model_name,
    intent: r.intent as TriageIntent,
    severity: r.severity as TriageSeverity,
    urgency: r.urgency as TriageUrgency,
    isActionable: r.is_actionable === 1,
    requiresCuration: r.requires_curation === 1,
    recommendedAction: r.recommended_action as RecommendedAction,
    confidence: r.confidence,
    scores,
    stateSummary: r.state_summary,
    createdAt: r.created_at,
  };
}

export async function getTriage(db: D1Database, contributionId: string): Promise<TriageResult | null> {
  const row = await db
    .prepare(`SELECT * FROM contribution_triages WHERE contribution_id = ?`)
    .bind(contributionId)
    .first<TriageRow>();

  return row ? rowToResult(row) : null;
}

export async function listTriagesForContributions(
  db: D1Database,
  contributionIds: string[]
): Promise<Map<string, TriageResult>> {
  const map = new Map<string, TriageResult>();
  if (contributionIds.length === 0) return map;

  const CHUNK = 100;
  for (let i = 0; i < contributionIds.length; i += CHUNK) {
    const chunk = contributionIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    const { results } = await db
      .prepare(`SELECT * FROM contribution_triages WHERE contribution_id IN (${placeholders})`)
      .bind(...chunk)
      .all<TriageRow>();

    for (const r of results ?? []) {
      map.set(r.contribution_id, rowToResult(r));
    }
  }
  return map;
}

/**
 * Executa a triagem com Clef-Omni sobre uma contribuição e persiste em D1.
 */
export async function triageContribution(
  env: Env,
  contributionId: string,
  options: { force?: boolean } = {}
): Promise<TriageResult | null> {
  const db = env.DB;
  const contrib = await getContribution(db, contributionId);
  if (!contrib) return null;

  if (!options.force) {
    const existing = await getTriage(db, contributionId);
    if (existing) return existing;
  }

  // Coleta contexto de louvor se existir
  let praiseInfo: Record<string, unknown> | null = null;
  if (contrib.target_praise_id) {
    praiseInfo = await getPraiseDetail(db, contrib.target_praise_id);
  }

  const files = await listFiles(db, contributionId);
  const stateSummary = buildDecisionState(contrib, praiseInfo, files);

  // Coleta imagens ou áudios anexados (até 2 MB) para suporte multimodal nativo
  const images: string[] = [];
  const audio: string[] = [];

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

  if (env.ASSETS) {
    for (const file of files) {
      if (file.size <= 2 * 1024 * 1024) {
        try {
          if (file.declared_type === 'jpg' || file.declared_type === 'png') {
            const obj = await env.ASSETS.get(file.r2_key);
            if (obj) {
              const buf = await obj.arrayBuffer();
              const base64 = bufferToBase64(buf);
              const mime = file.declared_type === 'png' ? 'image/png' : 'image/jpeg';
              images.push(`data:${mime};base64,${base64}`);
            }
          } else if (file.declared_type === 'mp3') {
            const obj = await env.ASSETS.get(file.r2_key);
            if (obj) {
              const buf = await obj.arrayBuffer();
              const base64 = bufferToBase64(buf);
              audio.push(`data:audio/mpeg;base64,${base64}`);
            }
          }
        } catch {
          // Falha ao ler anexo não impede a triagem por texto
        }
      }
    }
  }

  let parsedDecision: ReturnType<typeof parseClefOmniResponse> = null;

  if (env.AI && typeof env.AI.run === 'function') {
    try {
      const payload: Record<string, unknown> = {
        model: 'clef-omni',
        state: stateSummary,
        questions: CONTRIBUTION_DECISION_QUESTIONS,
      };
      if (images.length > 0) payload.images = images;
      if (audio.length > 0) payload.audio = audio;

      const aiResponse = await env.AI.run(CLEF_OMNI_MODEL, payload);
      parsedDecision = parseClefOmniResponse(aiResponse);
    } catch (err) {
      console.error('Erro ao chamar Workers AI Clef-Omni:', err);
    }
  }

  const triageId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  let finalResult: TriageResult;

  if (parsedDecision) {
    const recommendedAction = computeRecommendedAction(
      parsedDecision.intent,
      parsedDecision.severity,
      parsedDecision.urgency,
      parsedDecision.requiresCuration,
      parsedDecision.isActionable
    );

    finalResult = {
      id: triageId,
      contributionId,
      modelName: CLEF_OMNI_MODEL,
      intent: parsedDecision.intent,
      severity: parsedDecision.severity,
      urgency: parsedDecision.urgency,
      isActionable: parsedDecision.isActionable,
      requiresCuration: parsedDecision.requiresCuration,
      recommendedAction,
      confidence: parsedDecision.confidence,
      scores: parsedDecision.scores,
      stateSummary,
      createdAt,
    };
  } else {
    const fallback = generateFallbackTriage(contrib, praiseInfo);
    finalResult = {
      id: triageId,
      contributionId,
      modelName: `${CLEF_OMNI_MODEL}:fallback`,
      ...fallback,
      stateSummary,
      createdAt,
    };
  }

  await saveTriage(db, finalResult);
  return finalResult;
}
