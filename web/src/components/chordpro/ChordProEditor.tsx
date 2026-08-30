import { useMemo, useRef, useState } from 'react';
import { ChordHints } from './ChordHints';
import { ChordProView } from './ChordProView';
import { normalizeChord } from '../../lib/chordpro/chord';
import {
  insertLineAfter,
  lineToText,
  removeLine,
  replaceLine,
  setHeaderField,
  splitStanzaAt,
} from '../../lib/chordpro/edit';
import { parse } from '../../lib/chordpro/parse';
import type { Line, LineRef, Song, SongHeader } from '../../lib/chordpro/types';
import type { ValidationIssue } from '../../lib/chordpro/validate';

const CAMPOS: Array<[keyof SongHeader, string]> = [
  ['title', 'Título'],
  ['subtitle', 'Número'],
  ['key', 'Tom'],
  ['rhythm', 'Ritmo'],
  ['artist', 'Autoria'],
];

/** Normaliza só os acordes da linha, deixando letra e espaçamento intactos. */
function normalizeLine(texto: string): string {
  return texto.replace(/\[([^\]]*)\]/g, (_m, dentro) => `[${normalizeChord(dentro)}]`);
}

/** Chave estável de uma LineRef, para indexar as issues sem varrer a lista por linha. */
function chaveDe(at: LineRef): string {
  return `${at.stanza}:${at.line}`;
}

/**
 * Song de uma linha só. Cada linha da lista é desenhada pelo próprio ChordProView —
 * não existe uma segunda implementação de renderização de cifra neste arquivo, senão
 * o editor e o visualizador divergiriam justamente no que importa: o espaçamento.
 */
function songDeUmaLinha(line: Line): Song {
  return { header: {}, stanzas: [{ lines: [line] }], notes: [], hasLyrics: true };
}

export type ChordProEditorProps = {
  song: Song;
  onChange: (song: Song) => void;
  issues: ValidationIssue[];
};

/**
 * Editor de cifra com edição na própria linha.
 *
 * É **controlado**: o Song entra por prop e sai por `onChange`. O único estado local é
 * qual linha está aberta (`editing`) e o rascunho do texto dela (`draft`) — guardar o
 * Song aqui criaria uma segunda fonte de verdade e a página perderia o que gravar.
 *
 * O espaçamento da cifra é dado, não estilo: `[E]   A linda [A]flor` tem três espaços
 * que precisam sobreviver. Como não dá para enxergar espaço dentro de um `<input>`,
 * a linha em edição ganha um preview ao vivo logo abaixo do campo, desenhado pelo
 * ChordProView (que usa `white-space: pre`) — é ali que um espaço e três espaços
 * ficam visivelmente diferentes enquanto se digita.
 */
export function ChordProEditor({ song, onChange, issues }: ChordProEditorProps) {
  const [editing, setEditing] = useState<LineRef | null>(null);
  const [draft, setDraft] = useState('');
  // Guardado para que o ChordHints saiba onde enfiar o "ø" — na posição do cursor.
  const campoRef = useRef<HTMLInputElement | null>(null);

  const issuePorLinha = useMemo(() => {
    const mapa = new Map<string, ValidationIssue>();
    // A primeira issue da linha basta: é ela que o revisor vai consertar primeiro.
    for (const issue of issues) {
      const chave = chaveDe(issue);
      if (!mapa.has(chave)) mapa.set(chave, issue);
    }
    return mapa;
  }, [issues]);

  // O preview reparseia o rascunho a cada tecla — é barato (uma linha) e é o que faz
  // o espaçamento aparecer enquanto se digita.
  const previewSong = useMemo(() => parse(draft), [draft]);

  function abrir(at: LineRef) {
    setEditing(at);
    setDraft(lineToText(song, at));
  }

  function confirmar() {
    if (!editing) return;
    onChange(replaceLine(song, editing, normalizeLine(draft)));
    setEditing(null);
    setDraft('');
  }

  function cancelar() {
    setEditing(null);
    setDraft('');
  }

  /** Insere o símbolo na posição do cursor. Sem linha aberta, não há onde inserir. */
  function inserirSimbolo(simbolo: string) {
    if (!editing) return;
    const campo = campoRef.current;
    const pos = campo?.selectionStart ?? draft.length;
    const novo = draft.slice(0, pos) + simbolo + draft.slice(campo?.selectionEnd ?? pos);
    setDraft(novo);
    // O foco volta para o campo com o cursor depois do símbolo, senão a próxima
    // tecla digitada iria para o botão do ChordHints.
    queueMicrotask(() => {
      if (!campo) return;
      campo.focus();
      campo.setSelectionRange(pos + simbolo.length, pos + simbolo.length);
    });
  }

  return (
    <div className="cp-editor">
      <div className="cp-header-fields">
        {CAMPOS.map(([campo, rotulo]) => (
          <label className="cp-header-field" key={campo}>
            <span className="cp-header-field-label">{rotulo}</span>
            <input
              type="text"
              className="cp-header-field-input"
              value={song.header[campo] ?? ''}
              onChange={(e) => onChange(setHeaderField(song, campo, e.target.value))}
            />
          </label>
        ))}
      </div>

      <ChordHints onInsert={inserirSimbolo} />

      <div className="cp-editor-body">
        {song.stanzas.map((stanza, si) => (
          <div className="cp-editor-stanza" key={si}>
            {stanza.lines.map((line, li) => {
              const at: LineRef = { stanza: si, line: li };
              const issue = issuePorLinha.get(chaveDe(at));
              const emEdicao = editing?.stanza === si && editing?.line === li;
              const classes = ['cp-line-row'];
              if (issue) classes.push('cp-line-row--invalid');
              if (emEdicao) classes.push('cp-line-row--editing');

              return (
                <div className={classes.join(' ')} key={li}>
                  {emEdicao ? (
                    <div className="cp-line-edit">
                      <input
                        type="text"
                        className="cp-line-input"
                        aria-label="Texto da linha"
                        ref={campoRef}
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmar();
                          if (e.key === 'Escape') cancelar();
                        }}
                      />
                      {/* Preview ao vivo: as células reais do que foi digitado. */}
                      <div className="cp-editing-preview">
                        <ChordProView song={previewSong} />
                      </div>
                      <div className="cp-line-edit-actions">
                        <button type="button" className="cp-line-confirm" onClick={confirmar}>
                          Confirmar
                        </button>
                        <button type="button" className="cp-line-cancel" onClick={cancelar}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="cp-line-target"
                      role="button"
                      tabIndex={0}
                      aria-label="Editar esta linha"
                      onClick={() => abrir(at)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          abrir(at);
                        }
                      }}
                    >
                      <ChordProView song={songDeUmaLinha(line)} />
                    </div>
                  )}

                  {issue ? <span className="cp-line-issue">{issue.reason}</span> : null}

                  <div className="cp-line-actions">
                    <button
                      type="button"
                      aria-label="Inserir linha abaixo"
                      onClick={() => onChange(insertLineAfter(song, at))}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      aria-label="Remover linha"
                      onClick={() => onChange(removeLine(song, at))}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      aria-label="Separar estrofe aqui"
                      onClick={() => onChange(splitStanzaAt(song, at))}
                    >
                      ¶
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
