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
  const textareaId = useId();

  function inserirSimbolo(simbolo: string) {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(value + simbolo);
      return;
    }
    const isFocused = document.activeElement === ta;
    const pos = isFocused && ta.selectionStart !== null ? ta.selectionStart : value.length;
    const end = isFocused && ta.selectionEnd !== null ? ta.selectionEnd : pos;
    const novo = value.slice(0, pos) + simbolo + value.slice(end);
    onChange(novo);
    queueMicrotask(() => {
      ta.focus();
      ta.setSelectionRange(pos + simbolo.length, pos + simbolo.length);
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
        onChange={(e) => onChange(e.target.value)}
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
