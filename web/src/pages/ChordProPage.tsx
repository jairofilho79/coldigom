import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChordProEditor } from '../components/chordpro/ChordProEditor';
import { ChordProView } from '../components/chordpro/ChordProView';
import { useMaterialContent } from '../hooks/useMaterialContent';
import { useViewerTheme } from '../hooks/useViewerTheme';
import { parse } from '../lib/chordpro/parse';
import { serialize } from '../lib/chordpro/serialize';
import { validateSong } from '../lib/chordpro/validate';
import type { Song } from '../lib/chordpro/types';
import { getAssetUrl, getPraise, putMaterialContent, updateMaterial } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Material, PraiseDetail } from '../types';

/** "1 acorde não reconhecido" / "2 acordes não reconhecidos". O revisor precisa
 *  saber quantos são antes de decidir se force ou conserte. */
function resumoDeIssues(n: number): string {
  return n === 1 ? '1 acorde não reconhecido' : `${n} acordes não reconhecidos`;
}

/** Motivo mostrado ao lado do Salvar quando gravar apagaria a cifra. */
const SEM_LETRA = 'A cifra ficaria sem nenhuma linha de letra.';

/** Resposta ao clique no "Salvar assim mesmo" com o rascunho sem conteúdo. */
const FORCAR_NAO_COBRE =
  '"Salvar assim mesmo" contorna o validador de acordes, não a perda de conteúdo.';

/**
 * O rascunho tem alguma linha de letra COM CONTEÚDO?
 *
 * Existir uma linha `kind: 'cells'` não basta, e a diferença não é teórica: dois
 * cliques na barra de ações — "+" e depois "−" na linha real — deixam o Song com uma
 * única linha de células vazia, que serializa para `""`. Na releitura, linha vazia é
 * separador de estrofe: o arquivo volta com `stanzas: []` e `hasLyrics: false`,
 * indistinguível da perda total. Sem versionamento no R2 e sem validação de corpo no
 * `PUT /api/materials/:id/content`, não há rede depois desta.
 *
 * Exigir uma célula com acorde ou com texto não recusa edição legítima: a linha vazia
 * recém-inserida continua permitida enquanto houver conteúdo em qualquer outro lugar
 * da cifra.
 *
 * `song.hasLyrics` NÃO serve aqui: é calculado uma vez no parse e as operações de
 * `edit.ts` o carregam adiante sem recalcular; quem pergunta pelo rascunho tem de
 * olhar as estrofes de agora.
 */
function temLinhaDeLetra(song: Song): boolean {
  return song.stanzas.some((s) =>
    s.lines.some(
      (l) => l.kind === 'cells' && l.cells.some((c) => c.chord !== null || c.text !== '')
    )
  );
}

/** Marca de revisão humana. Fica no cabeçalho porque é uma decisão sobre a
 *  cifra que se está lendo — não um detalhe de registro no rodapé.
 *  Sem sessão, vira só um selo: a informação interessa a quem lê, a ação não. */
function ReviewSwitch({
  material,
  onToggle,
}: {
  material: Material;
  onToggle: (next: boolean) => Promise<void>;
}) {
  const { isAuthenticated } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checked = Boolean(material.is_reviewed);

  if (!isAuthenticated) {
    return (
      <span className={`cp-review-badge${checked ? ' is-on' : ''}`}>
        {checked ? '✓ revisada' : 'não revisada'}
      </span>
    );
  }

  const quem = material.reviewed_by ? ` por ${material.reviewed_by}` : '';
  const quando = material.reviewed_at
    ? new Date(material.reviewed_at).toLocaleDateString('pt-BR')
    : '';

  return (
    <div className="cp-review">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Marcar cifra como revisada"
        className={`cp-review-switch${checked ? ' is-on' : ''}`}
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            await onToggle(!checked);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao salvar');
          } finally {
            setSaving(false);
          }
        }}
      >
        <span className="cp-review-track" aria-hidden="true">
          <span className="cp-review-thumb" />
        </span>
        <span className="cp-review-text">
          {checked ? 'Revisada' : 'Marcar como revisada'}
        </span>
      </button>
      {checked && (quem || quando) ? (
        <span className="cp-review-meta">
          {[quando, quem.trim()].filter(Boolean).join(' · ')}
        </span>
      ) : null}
      {error ? <span className="cp-review-error">{error}</span> : null}
    </div>
  );
}

/** Linha do painel. Valor ausente vira "—" em vez de sumir: numa ferramenta de
 *  gestão, saber que o campo está vazio é informação. */
function PanelRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="cp-panel-row">
      <dt>{label}</dt>
      <dd>{value?.trim() ? value : '—'}</dd>
    </div>
  );
}

export function ChordProPage() {
  const { praiseId, materialId } = useParams<{ praiseId: string; materialId: string }>();
  const [praise, setPraise] = useState<PraiseDetail | null>(null);
  const [loadingPraise, setLoadingPraise] = useState(true);
  const [praiseError, setPraiseError] = useState<string | null>(null);
  const { theme, toggle } = useViewerTheme();
  const { isAuthenticated } = useAuth();

  // `null` é modo leitura. O Song editado mora aqui porque o ChordProEditor é
  // controlado — é esta página que sabe gravar.
  const [draft, setDraft] = useState<Song | null>(null);
  // O que gravamos com sucesso, carimbado com a chave a que pertence (mesmo truque
  // do useMaterialContent). Sem isso, sair do editor mostraria de novo o texto
  // antigo do GET; com isso, não é preciso refazer o GET só para ver o próprio
  // trabalho — e um cache do R2/CDN não devolve a versão velha.
  const [saved, setSaved] = useState<{ key: string; source: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!praiseId) return;
    let cancelled = false;
    setLoadingPraise(true);
    (async () => {
      try {
        const data = await getPraise(praiseId);
        if (!cancelled) setPraise(data);
      } catch (err) {
        if (!cancelled) setPraiseError(err instanceof Error ? err.message : 'Falha ao carregar');
      } finally {
        if (!cancelled) setLoadingPraise(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [praiseId]);

  const material = praise?.materials.find((m) => m.id === materialId) ?? null;

  // a resposta do PATCH já traz o louvor inteiro; usar isso evita um refetch e
  // mantém a tela coerente se outro campo mudou junto
  const toggleReviewed = async (next: boolean) => {
    if (!material) return;
    setPraise(await updateMaterial(material.id, { is_reviewed: next }));
  };
  const sourcePdf =
    praise?.materials.find((m) => m.id === material?.source_material_id) ?? null;

  const { content, retry } = useMaterialContent(material?.r2_key ?? null);

  // O texto exato que o servidor tem, até onde sabemos: o do GET, ou o da última
  // gravação nossa. É contra ele que a checagem de concorrência compara, e é dele
  // que sai o Song exibido — os dois não podem divergir.
  const serverSource =
    saved && saved.key === material?.r2_key
      ? saved.source
      : content.status === 'ready'
        ? content.source
        : null;

  const song = useMemo(
    () => (serverSource === null ? null : parse(serverSource)),
    [serverSource]
  );

  // Trocar de material fecha o editor: o rascunho pertencia ao arquivo anterior.
  useEffect(() => {
    setDraft(null);
    setSaveError(null);
  }, [material?.r2_key]);

  const issues = useMemo(() => (draft ? validateSong(draft) : []), [draft]);
  const rascunhoVazio = draft !== null && !temLinhaDeLetra(draft);

  async function salvar(forcar: boolean) {
    if (!draft || !material?.r2_key) return;
    // Vale inclusive com `forcar`: "salvar assim mesmo" existe porque a gramática pode
    // não prever o próximo acorde legítimo do acervo — gravar um arquivo sem nenhuma
    // linha de letra não é acorde raro, é apagar a cifra.
    if (!temLinhaDeLetra(draft)) {
      setSaveError(FORCAR_NAO_COBRE);
      return;
    }
    // Só o "salvar assim mesmo" ignora as issues; o "salvar" nunca grava acorde
    // inválido, mesmo que algo o habilite por engano.
    if (!forcar && issues.length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      // O PUT não tem ETag: quem grava por último ganha, em silêncio. A defesa é
      // reler o arquivo agora e comparar com o texto que abrimos — se mudou, alguém
      // gravou no meio do caminho e sobrescrever apagaria o trabalho dessa pessoa.
      // Vale inclusive com `forcar`: "salvar assim mesmo" contorna o validador de
      // acordes, nunca esta proteção.
      // `no-store` porque uma resposta de cache é exatamente o texto que já temos:
      // a checagem passaria sempre e a proteção viraria enfeite.
      const atual = await fetch(getAssetUrl(material.r2_key), { cache: 'no-store' });
      if (!atual.ok) {
        // Não é conflito: é não saber. Mandar recarregar aqui faria a pessoa jogar
        // fora o rascunho por causa de um soluço do R2 — a perda que esta checagem
        // existe para evitar.
        setSaveError('Não foi possível verificar o arquivo no servidor. Tente salvar de novo.');
        return;
      }
      if ((await atual.text()) !== serverSource) {
        setSaveError(
          'O arquivo mudou no servidor desde que você abriu. Recarregue antes de salvar.'
        );
        return;
      }

      const novo = serialize(draft);
      await putMaterialContent(material.id, novo);
      // O que está no servidor agora é o que acabamos de gravar.
      setSaved({ key: material.r2_key, source: novo });
      setDraft(null);
    } catch (err) {
      // Erro vira mensagem ao lado dos botões e o editor continua aberto: sair
      // daqui jogaria fora o trabalho da pessoa.
      setSaveError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (loadingPraise) {
    return (
      <div className="page-container cp-page">
        <div className="loading-state">
          <div className="loading-spinner" />
          <div className="loading-text">Carregando cifra...</div>
        </div>
      </div>
    );
  }

  if (praiseError || !praise) {
    return (
      <div className="page-container cp-page">
        <div className="error-state">
          <div className="error-state-icon">⚠</div>
          <div className="error-state-title">Erro ao carregar</div>
          <div className="error-state-desc">{praiseError || 'Louvor não encontrado'}</div>
        </div>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="page-container cp-page">
        <Link to={`/praise/${praise.id}`} className="cp-back">
          ← {praise.name}
        </Link>
        <div className="no-results">
          <div className="no-results-icon">📄</div>
          <div className="no-results-title">Material não encontrado neste louvor</div>
        </div>
      </div>
    );
  }

  // O cabeçalho é alimentado pelo ARQUIVO, não pelo banco — é o conteúdo exibido.
  // Campo ausente na cifra some do cabeçalho; o valor do banco aparece no painel.
  const chips = [
    song?.header.key ? `Tom ${song.header.key}` : null,
    song?.header.rhythm ?? null,
    material.material_kind_name ?? null,
  ].filter((c): c is string => Boolean(c));

  const semLetra = content.status === 'absent' || (song !== null && !song.hasLyrics);

  return (
    <div className="page-container cp-page">
      <Link to={`/praise/${praise.id}`} className="cp-back">
        ← {praise.name}
      </Link>

      <header className="cp-header">
        <div className="cp-header-main">
          <h1 className="cp-title">{song?.header.title ?? praise.name}</h1>
          {song?.header.subtitle ? <div className="cp-number">{song.header.subtitle}</div> : null}
          {song?.header.artist ? <div className="cp-artist">{song.header.artist}</div> : null}
          {chips.length > 0 ? (
            <div className="cp-chips">
              {chips.map((c) => (
                <span className="cp-chip" key={c}>
                  {c}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="cp-header-actions">
          <ReviewSwitch material={material} onToggle={toggleReviewed} />
          {/* Reusa o visual do botão de tema — é a mesma família de ação do cabeçalho. */}
          {/* Sem `hasLyrics` na guarda de propósito: uma cifra que ficou sem letra
              (arquivo só com cabeçalho, gravado por engano) precisa poder ser reaberta
              para edição — era o único caminho de volta, e ele não existia. O banner
              "ainda não foi publicada" continua aparecendo logo abaixo. */}
          {isAuthenticated && song && !draft ? (
            <button
              type="button"
              className="cp-theme-btn"
              onClick={() => {
                setSaveError(null);
                setDraft(song);
              }}
            >
              ✎ editar
            </button>
          ) : null}
          <button type="button" className="cp-theme-btn" onClick={toggle}>
            {theme === 'dark' ? '☀ claro' : '☾ escuro'}
          </button>
        </div>
      </header>

      {content.status === 'loading' ? (
        <div className="loading-state">
          <div className="loading-spinner" />
        </div>
      ) : null}

      {content.status === 'error' ? (
        <div className="cp-state cp-state--error">
          <div className="cp-state-title">Falha ao carregar a cifra.</div>
          <div className="cp-state-desc">{content.message}</div>
          <button type="button" className="cp-retry" onClick={retry}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      {semLetra ? (
        <div className="cp-state cp-state--absent">
          <div className="cp-state-title">Esta cifra ainda não foi publicada.</div>
          <div className="cp-state-desc">
            {content.status === 'absent'
              ? 'O registro existe no acervo, mas não há arquivo de cifra.'
              : 'O arquivo existe, mas não contém nenhuma linha de letra.'}
          </div>
          {sourcePdf?.r2_key ? (
            <a
              className="cp-source-link"
              href={getAssetUrl(sourcePdf.r2_key)}
              target="_blank"
              rel="noopener noreferrer"
            >
              PDF de origem
            </a>
          ) : null}
        </div>
      ) : null}

      {draft ? (
        <div className="cp-scope" data-cp-theme={theme}>
          <ChordProEditor
            song={draft}
            onChange={(newSong) => {
              setDraft(newSong);
              // Limpar erro obsoleto quando usuário retorna a editar após uma recusa.
              // Se `salvar()` rejeitou por conteúdo vazio ou validação, a mensagem fica
              // em tela até que o botão "Cancelar edição" a apague — a menos que desfaça
              // e volte a digitar, caso em que o `saveError` precisa sumir para não
              // desmentir o "Salvar" habilitado que aparece junto.
              setSaveError(null);
            }}
            issues={issues}
          />
          <div className="cp-edit-actions">
            <button
              type="button"
              className="cp-edit-save"
              disabled={issues.length > 0 || rascunhoVazio || saving}
              onClick={() => void salvar(false)}
            >
              Salvar
            </button>
            {/* O forçar aparece também com o rascunho vazio, e CLICÁVEL de propósito.
                Duas razões, na mesma direção:
                — quem clica recebe a recusa por escrito, em vez de um botão apagado
                  que não explica por que não serve;
                — o React não despacha clique em elemento de formulário desabilitado
                  (lê `props.disabled` da fibra, não o atributo do DOM), então um botão
                  desabilitado tornaria a guarda dentro de `salvar()` impossível de
                  cobrir por teste — e guarda não coberta é guarda que some num
                  refactor sem derrubar nada. O `disabled` do "Salvar" é o cinto; a
                  guarda de `salvar()`, que barra os dois caminhos, é o suspensório. */}
            {issues.length > 0 || rascunhoVazio ? (
              <button
                type="button"
                className="cp-edit-force"
                disabled={saving}
                onClick={() => void salvar(true)}
              >
                Salvar assim mesmo
              </button>
            ) : null}
            {/* "Cancelar edição" e não só "Cancelar": o editor já tem um Cancelar
                por linha, e dois botões com o mesmo nome na tela confundem. */}
            <button
              type="button"
              className="cp-edit-cancel"
              disabled={saving}
              onClick={() => {
                setDraft(null);
                setSaveError(null);
              }}
            >
              Cancelar edição
            </button>
            {/* O motivo de o Salvar estar travado, no mesmo lugar do resumo de acordes.
                A perda de conteúdo vem primeiro: é a que não tem desfazer. */}
            {rascunhoVazio ? (
              <span className="cp-edit-issues">{SEM_LETRA}</span>
            ) : issues.length > 0 ? (
              <span className="cp-edit-issues">{resumoDeIssues(issues.length)}</span>
            ) : null}
            {/* role="status" + aria-live="polite" comunicam ao leitor de tela que a
                mensagem é dinâmica e chegou sem interação (não é validação de envio). */}
            {saveError ? (
              <span className="cp-review-error" role="status" aria-live="polite">
                {saveError}
              </span>
            ) : null}
          </div>
        </div>
      ) : song && song.hasLyrics ? (
        <div className="cp-scope" data-cp-theme={theme}>
          <ChordProView song={song} />
        </div>
      ) : null}

      <section className="cp-panel">
        <h2 className="cp-panel-title">Material</h2>
        <div className="cp-panel-cols">
          <dl className="cp-panel-col">
            <div className="cp-panel-label">No arquivo</div>
            <PanelRow label="Título" value={song?.header.title} />
            <PanelRow label="Número" value={song?.header.subtitle} />
            <PanelRow label="Tom" value={song?.header.key} />
            <PanelRow label="Ritmo" value={song?.header.rhythm} />
            <PanelRow label="Autoria" value={song?.header.artist} />
          </dl>
          <dl className="cp-panel-col">
            <div className="cp-panel-label">No banco</div>
            <PanelRow label="Louvor" value={praise.name} />
            <PanelRow label="Número" value={praise.number} />
            <PanelRow label="Tom" value={praise.tonality} />
            <PanelRow label="Ritmo" value={praise.rhythm} />
            <PanelRow label="Autoria" value={praise.author} />
          </dl>
        </div>

        <dl className="cp-panel-col cp-panel-col--wide">
          <div className="cp-panel-label">Registro</div>
          <PanelRow label="Categoria" value={material.material_kind_name} />
          <PanelRow label="Chave R2" value={material.r2_key} />
          {material.merged_from_praise_name ? (
            <PanelRow label="Veio do merge de" value={material.merged_from_praise_name} />
          ) : null}
          <div className="cp-panel-row">
            <dt>PDF de origem</dt>
            <dd>
              {sourcePdf?.r2_key ? (
                <a href={getAssetUrl(sourcePdf.r2_key)} target="_blank" rel="noopener noreferrer">
                  PDF de origem
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>

        {song && song.notes.length > 0 ? (
          <div className="cp-notes">
            <div className="cp-panel-label">Notas do pipeline</div>
            {song.notes.map((note, i) => (
              <p className="cp-note" key={i}>
                {note}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
