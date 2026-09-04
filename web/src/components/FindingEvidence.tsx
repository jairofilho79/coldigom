import { useEffect, useState } from 'react';
import { getPraise } from '../services/api';
import type { PraiseDetail, ValidationFinding } from '../types';

function Valor({ chave, valor }: { chave: string; valor: unknown }) {
  if (chave === 'url' && typeof valor === 'string') {
    return <a href={valor} target="_blank" rel="noopener noreferrer">{valor}</a>;
  }
  return <>{typeof valor === 'string' ? valor : JSON.stringify(valor)}</>;
}

/** A evidência é JSON livre, por detector: o renderizador genérico é o piso. */
function EvidenciaGenerica({ evidence }: { evidence: ValidationFinding['evidence'] }) {
  if (typeof evidence === 'string') return <pre className="vf-evidence-raw">{evidence}</pre>;
  return (
    <dl className="vf-ev">
      {Object.entries(evidence).map(([k, v]) => (
        <div key={k} className="vf-ev-par">
          <dt>{k}</dt>
          <dd><Valor chave={k} valor={v} /></dd>
        </div>
      ))}
    </dl>
  );
}

type Carregado = { ok: true; praise: PraiseDetail } | { ok: false } | null;

function ColunaLouvor({ id, papel }: { id: string; papel: string }) {
  const [estado, setEstado] = useState<Carregado>(null);
  useEffect(() => {
    let vivo = true;
    getPraise(id)
      .then((praise) => { if (vivo) setEstado({ ok: true, praise }); })
      .catch(() => { if (vivo) setEstado({ ok: false }); });
    return () => { vivo = false; };
  }, [id]);
  return (
    <div className="vf-compare-col">
      <div className="vf-compare-papel">{papel}</div>
      {estado === null && <div className="loading-state" role="status">carregando…</div>}
      {estado?.ok === false && <div className="vf-compare-erro">não foi possível carregar {id}</div>}
      {estado?.ok && (
        <>
          <div className="vf-compare-nome">{estado.praise.name}</div>
          <div className="vf-compare-meta">
            {estado.praise.number && <span>nº {estado.praise.number}</span>}
            {estado.praise.author && <span>{estado.praise.author}</span>}
            {estado.praise.tonality && <span>{estado.praise.tonality}</span>}
            {estado.praise.category && <span>{estado.praise.category}</span>}
            {estado.praise.tag_names && <span>{estado.praise.tag_names}</span>}
          </div>
          <pre className="vf-compare-letra">{estado.praise.lyrics || '(sem letra)'}</pre>
        </>
      )}
    </div>
  );
}

export function FindingEvidence({ finding }: { finding: ValidationFinding }) {
  const fusao = finding.action === 'merge_praise' && finding.proposed_value;
  return (
    <div className="vf-evidence">
      <EvidenciaGenerica evidence={finding.evidence} />
      {fusao && (
        <div className="vf-compare">
          <ColunaLouvor id={finding.target_id} papel="fonte — some" />
          <ColunaLouvor id={finding.proposed_value as string} papel="keeper — fica" />
        </div>
      )}
    </div>
  );
}
