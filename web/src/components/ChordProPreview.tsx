import { useMemo } from 'react';

const DIRECTIVE_RE = /^\{([^:}]+):\s*(.*)\}$/;
const CHORD_RE = /(\[[^\]]+\])/g;

function parseLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return { type: 'blank' as const };

  const dm = DIRECTIVE_RE.exec(trimmed);
  if (dm) return { type: 'directive' as const, key: dm[1].trim(), value: dm[2].trim() };

  const parts: Array<{ kind: 'chord' | 'text'; value: string }> = [];
  let last = 0;
  for (const match of trimmed.matchAll(CHORD_RE)) {
    const idx = match.index ?? 0;
    if (idx > last) parts.push({ kind: 'text', value: trimmed.slice(last, idx) });
    parts.push({ kind: 'chord', value: match[1].slice(1, -1) });
    last = idx + match[0].length;
  }
  if (last < trimmed.length) parts.push({ kind: 'text', value: trimmed.slice(last) });
  if (parts.length === 0) parts.push({ kind: 'text', value: trimmed });
  return { type: 'text' as const, parts };
}

export function ChordProPreview({ source }: { source: string }) {
  const parsed = useMemo(() => source.split('\n').map(parseLine), [source]);

  let title = '';
  const meta: Array<{ key: string; value: string }> = [];
  for (const line of parsed) {
    if (line.type === 'directive') {
      if (line.key.toLowerCase() === 'title') title = line.value;
      else if (!line.key.toLowerCase().startsWith('meta')) meta.push({ key: line.key, value: line.value });
    }
  }

  return (
    <div className="chordpro-preview">
      {title ? <h2 className="chordpro-preview-title">{title}</h2> : null}
      {meta.length > 0 ? (
        <dl className="chordpro-preview-meta">
          {meta.map((m) => (
            <div key={m.key} className="chordpro-preview-meta-row">
              <dt>{m.key}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="chordpro-preview-body">
        {parsed.map((line, i) => {
          if (line.type === 'blank') return <div key={i} className="chordpro-preview-blank" />;
          if (line.type === 'directive') {
            if (line.key.toLowerCase() === 'title') return null;
            if (line.key.toLowerCase() === 'comment') {
              return <p key={i} className="chordpro-preview-comment">{line.value}</p>;
            }
            return null;
          }
          return (
            <p key={i} className="chordpro-preview-line">
              {line.parts.map((part, j) =>
                part.kind === 'chord' ? (
                  <span key={j} className="chordpro-chord">{part.value}</span>
                ) : (
                  <span key={j}>{part.value}</span>
                )
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}
