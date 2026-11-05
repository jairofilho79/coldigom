import { useId, useMemo, useRef } from 'react';
import { ChordHints } from './ChordHints';
import { ChordProView } from './ChordProView';
import { parse } from '../../lib/chordpro/parse';
import type { ValidationIssue } from '../../lib/chordpro/validate';

export type ChordProRawEditorProps = {
  value: string;
  onChange: (value: string) => void;
  issues: ValidationIssue[];
};

/**
 * Editor de cifra em texto puro (ChordPro raw).
 * Permite digitação e colagem livre de todo o documento sem intermediação por linha.
 */
export function ChordProRawEditor({ value, onChange, issues }: ChordProRawEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const textareaId = useId();

  function inserirSimbolo(simbolo: string) {
    const ta = textareaRef.current;
    const sel = selectionRef.current;
    const pos = sel ? sel.start : value.length;
    const end = sel ? sel.end : pos;
    const novo = value.slice(0, pos) + simbolo + value.slice(end);
    const novoPos = pos + simbolo.length;
    selectionRef.current = { start: novoPos, end: novoPos };
    onChange(novo);
    queueMicrotask(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(novoPos, novoPos);
    });
  }

  const previewSong = useMemo(() => parse(value), [value]);

  return (
    <div className="cp-raw-editor">
      <ChordHints onInsert={inserirSimbolo} podeInserir={true} />

      <textarea
        id={textareaId}
        ref={textareaRef}
        className="cp-raw-textarea"
        aria-label="Cifra ChordPro (texto raw)"
        value={value}
        onChange={(e) => {
          selectionRef.current = {
            start: e.target.selectionStart,
            end: e.target.selectionEnd,
          };
          onChange(e.target.value);
        }}
        onSelect={(e) => {
          selectionRef.current = {
            start: e.currentTarget.selectionStart,
            end: e.currentTarget.selectionEnd,
          };
        }}
        rows={22}
        spellCheck={false}
        placeholder={'{title: Título}\n{key: Tom}\n\n[C]Letra do louvor...'}
      />

      {issues.length > 0 ? (
        <div className="cp-raw-issues" role="alert">
          <div className="cp-raw-issues-title">Acordes não reconhecidos:</div>
          <ul className="cp-raw-issues-list">
            {issues.map((iss, i) => (
              <li key={i}>
                <code>[{iss.raw}]</code>: {iss.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="cp-raw-preview">
        <summary className="cp-raw-preview-summary">Pré-visualização</summary>
        <div className="cp-raw-preview-body">
          <ChordProView song={previewSong} />
        </div>
      </details>
    </div>
  );
}
