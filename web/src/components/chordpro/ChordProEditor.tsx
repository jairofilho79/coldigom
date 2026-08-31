import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Normaliza só os acordes da linha, deixando letra e espaçamento intactos.
 *
 * Opera sobre as CÉLULAS que o parser já produziu, nunca sobre o texto cru. Quem sabe
 * onde começa e termina um colchete é o `parseCells` — ele conhece `\[` escapado, `[]`
 * vazio e colchete sem fechamento. Um regex de colchete aqui seria um segundo
 * tokenizador com regras próprias: `/\[([^\]]*)\]/` casaria `[dois\]` e capturaria
 * `Cm7b5\`, corrompendo texto literal. Célula com `chord === null` é texto e não é tocada.
 */
function normalizeCells(line: Line): Line {
  if (line.kind !== 'cells') return line;
  return {
    kind: 'cells',
    cells: line.cells.map((c) =>
      c.chord === null ? c : { ...c, chord: normalizeChord(c.chord) }
    ),
  };
}

/** Aplica `normalizeCells` só na linha endereçada, devolvendo Song novo. */
function normalizarLinha(song: Song, at: LineRef): Song {
  const line = song.stanzas[at.stanza]?.lines[at.line];
  if (!line) return song;
  const nova = normalizeCells(line);
  if (nova === line) return song;
  return {
    ...song,
    stanzas: song.stanzas.map((s, si) =>
      si !== at.stanza
        ? s
        : { lines: s.lines.map((l, li) => (li !== at.line ? l : nova)) }
    ),
  };
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

/** Linha de células vazia — a mesma forma que o `insertLineAfter` cria. */
function linhaVazia(): Line {
  return { kind: 'cells', cells: [{ chord: null, attached: false, text: '' }] };
}

/**
 * Acrescenta uma linha no fim da cifra.
 *
 * Com estrofes é o `insertLineAfter` depois da última linha. SEM nenhuma estrofe não
 * há endereço para passar a ele — e é exatamente esse o estado de um arquivo só com
 * cabeçalho (`{title: X}\n\n`, o que o pipeline grava quando não consegue extrair) e
 * o que sobra de um "+" seguido de "−". Nesse estado o editor abria sem nenhum botão,
 * porque o "+" só existe DENTRO de uma linha: não dava para criar a primeira, e como
 * gravar exige uma linha de letra, nem o título dava para corrigir.
 */
function songComLinhaNoFim(song: Song): Song {
  const ultima = song.stanzas.length - 1;
  if (ultima < 0) return { ...song, stanzas: [{ lines: [linhaVazia()] }] };
  return insertLineAfter(song, { stanza: ultima, line: song.stanzas[ultima].lines.length - 1 });
}

/**
 * Endereço de cada linha na ordem da tela.
 *
 * A posição PLANA é a única que sobrevive a uma mutação estrutural: separar estrofe
 * troca o `stanza` e o `line` da mesma linha, e remover a última linha de uma estrofe
 * apaga a estrofe (`mapStanzas` filtra estrofe vazia) e reindexa as de baixo. É por
 * ela que o foco reencontra a linha depois da mutação, e é ela que numera as linhas.
 */
function ordemPlana(song: Song): LineRef[] {
  const refs: LineRef[] = [];
  song.stanzas.forEach((stanza, si) =>
    stanza.lines.forEach((_, li) => refs.push({ stanza: si, line: li }))
  );
  return refs;
}

/**
 * Como a linha se chama para quem não a vê.
 *
 * O `aria-label` do alvo SUPRIME o conteúdo do `div`, então ele tem de carregar esse
 * conteúdo: com um rótulo fixo, uma cifra de 40 linhas se anuncia quarenta vezes com
 * a mesma frase e não há como saber qual se vai abrir sem abrir. O número é o da
 * cifra inteira, não o da estrofe — senão "linha 1" volta a aparecer várias vezes.
 */
function nomeDaLinha(song: Song, at: LineRef, numero: number): string {
  const texto = lineToText(song, at).trim();
  return texto === '' ? `linha ${numero}, vazia` : `linha ${numero}: ${texto}`;
}

/** Qual botão da linha recebe o foco depois de uma mutação. */
type PapelDeFoco = 'editar' | 'remover' | 'separar';

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
  // Motivo de uma confirmação recusada. Fica ao lado do campo, no mesmo lugar do
  // erro de acorde, e some assim que a pessoa volta a digitar.
  const [erroDeLinha, setErroDeLinha] = useState<string | null>(null);
  // Guardado para que o ChordHints saiba onde enfiar o "ø" — na posição do cursor.
  const campoRef = useRef<HTMLInputElement | null>(null);
  // Os botões de cada linha, indexados por `estrofe:linha:papel`, e o de adicionar no
  // fim. É por aqui que o foco reencontra o caminho depois de uma mutação.
  const alvosDeFoco = useRef(new Map<string, HTMLElement>());
  const botaoAdicionar = useRef<HTMLButtonElement | null>(null);
  // Para onde o foco vai depois da próxima mutação. Ref, e não estado: limpá-lo
  // dentro do efeito seria `set-state-in-effect`, e este valor não pinta nada —
  // só sobrevive de um render para o efeito seguinte.
  const focoPendente = useRef<{ plana: number; papel: PapelDeFoco } | null>(null);

  const ordem = useMemo(() => ordemPlana(song), [song]);

  /**
   * Devolve o foco depois de uma mutação estrutural.
   *
   * `useLayoutEffect` e não `useEffect`: o foco tem de estar no lugar antes da
   * pintura, senão a tela pisca com o foco no `<body>`. Sem isto, separar estrofe
   * ou remover linha desmontava o botão focado e obrigava a tabular desde o topo
   * do documento para voltar ao ponto.
   */
  useLayoutEffect(() => {
    const pendente = focoPendente.current;
    if (!pendente) return;
    focoPendente.current = null;

    // A mutação reindexou tudo; a posição plana é o único endereço que sobrevive.
    // Remover a última linha encolhe a lista: cai na que passou a ocupar o fim.
    const ref = ordem[Math.min(pendente.plana, ordem.length - 1)];
    const alvo = ref ? alvosDeFoco.current.get(`${chaveDe(ref)}:${pendente.papel}`) : null;
    (alvo ?? botaoAdicionar.current)?.focus();
  });
  const planaDe = useMemo(() => {
    const mapa = new Map<string, number>();
    ordem.forEach((ref, i) => mapa.set(chaveDe(ref), i));
    return mapa;
  }, [ordem]);

  /** Callback de `ref` que mantém o índice de alvos em dia — apaga ao desmontar. */
  function registrarAlvo(chave: string) {
    return (elemento: HTMLElement | null) => {
      if (elemento) alvosDeFoco.current.set(chave, elemento);
      else alvosDeFoco.current.delete(chave);
    };
  }

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
    setErroDeLinha(null);
  }

  /**
   * Confirma a edição da linha — ou recusa, dizendo por quê.
   *
   * O que não vira linha de cifra não pode virar linha em branco em silêncio: `"   "`
   * (só espaços), `"{title: Novo}"` e `"; nota"` são engolidos pelo parser de linha
   * única (viram header, nota ou nada), e confirmar assim apagaria o que a pessoa
   * escreveu — inclusive o caso provável de esvaziar o valor de um `{comment: ...}`.
   * Nesses casos o campo continua aberto com o texto intacto: nada é perdido, e
   * "Cancelar" continua ali para quem quiser desistir.
   */
  function confirmar() {
    if (!editing) return;
    // Uma linha só: só há `stanzas[0].lines[0]` quando o texto formou células ou comentário.
    const linhaNova = parse(draft).stanzas[0]?.lines[0];
    if (!linhaNova) {
      setErroDeLinha('Esse texto não forma uma linha de cifra.');
      return;
    }
    onChange(normalizarLinha(replaceLine(song, editing, draft), editing));
    setEditing(null);
    setDraft('');
    setErroDeLinha(null);
  }

  function cancelar() {
    setEditing(null);
    setDraft('');
    setErroDeLinha(null);
  }

  /**
   * Toda mutação estrutural reindexa as linhas: inserir, remover ou separar estrofe
   * faz o `editing` que valia antes apontar para OUTRA linha. Se a edição continuasse
   * aberta, o campo reapareceria sobre a linha vizinha com o rascunho antigo e
   * "Confirmar" gravaria no lugar errado. Fechar a edição junto com a mutação é o que
   * impede isso — o endereço só é confiável enquanto o Song não muda de forma.
   *
   * `foco` diz para onde o foco vai depois — em posição plana, porque a mutação
   * reindexa tudo. Fechar a edição já tirava o foco do lugar; deixá-lo cair no
   * `<body>` é o que não pode acontecer.
   */
  function mutarEstrutura(novo: Song, foco: { plana: number; papel: PapelDeFoco }) {
    setEditing(null);
    setDraft('');
    setErroDeLinha(null);
    focoPendente.current = foco;
    onChange(novo);
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

      <ChordHints onInsert={inserirSimbolo} podeInserir={editing !== null} />

      <div className="cp-editor-body">
        {song.stanzas.map((stanza, si) => (
          <div className="cp-editor-stanza" key={si}>
            {stanza.lines.map((line, li) => {
              const at: LineRef = { stanza: si, line: li };
              const plana = planaDe.get(chaveDe(at)) ?? 0;
              const nome = nomeDaLinha(song, at, plana + 1);
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
                        onChange={(e) => {
                          setDraft(e.target.value);
                          // Digitar é a resposta ao aviso: ele sai de cena junto.
                          setErroDeLinha(null);
                        }}
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
                      ref={registrarAlvo(`${chaveDe(at)}:editar`)}
                      aria-label={`Editar ${nome}`}
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

                  {/* Um lugar só para o aviso da linha: a recusa da confirmação fala
                      da tecla que a pessoa acabou de apertar e tem precedência sobre
                      o acorde não reconhecido, que continua lá depois.

                      Com a linha aberta o lugar vira região viva e fica no DOM mesmo
                      vazio: a recusa chega sem que nada mais mude — o foco continua no
                      campo e o valor continua o mesmo —, então quem usa leitor de tela
                      concluiria que o Enter não fez nada. Um `aria-live` só funciona se
                      o container já existia quando o texto apareceu. */}
                  {emEdicao ? (
                    <span className="cp-line-issue" role="status" aria-live="polite">
                      {erroDeLinha ?? issue?.reason ?? ''}
                    </span>
                  ) : issue ? (
                    <span className="cp-line-issue">{issue.reason}</span>
                  ) : null}

                  {/* Os três nomes eram iguais em todas as linhas: "Remover linha"
                      repetido N vezes não diz qual linha se vai remover. */}
                  <div className="cp-line-actions">
                    <button
                      type="button"
                      aria-label={`Inserir linha abaixo da ${nome}`}
                      onClick={() =>
                        mutarEstrutura(insertLineAfter(song, at), {
                          plana: plana + 1,
                          papel: 'editar',
                        })
                      }
                    >
                      +
                    </button>
                    <button
                      type="button"
                      ref={registrarAlvo(`${chaveDe(at)}:remover`)}
                      aria-label={`Remover ${nome}`}
                      onClick={() =>
                        // A linha some: o foco vai para o mesmo botão da linha que
                        // ocupar esta posição, ou da última, se era a última.
                        mutarEstrutura(removeLine(song, at), { plana, papel: 'remover' })
                      }
                    >
                      −
                    </button>
                    <button
                      type="button"
                      ref={registrarAlvo(`${chaveDe(at)}:separar`)}
                      aria-label={`Separar estrofe aqui, antes da ${nome}`}
                      onClick={() =>
                        // A linha continua existindo na mesma posição plana, só que
                        // numa estrofe nova — o foco a acompanha.
                        mutarEstrutura(splitStanzaAt(song, at), { plana, papel: 'separar' })
                      }
                    >
                      ¶
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Fora de qualquer linha de propósito. O "+" da barra de ações só existe
            DENTRO de uma linha, então uma cifra sem nenhuma — arquivo só com
            cabeçalho, ou o que sobra de "+" seguido de "−" — não tinha como ganhar a
            primeira, e o editor virava beco sem saída: "Salvar" travado por falta de
            letra, "Salvar assim mesmo" recusando, e nem o título dava para corrigir.
            Serve também para acrescentar linha no fim, que antes só se conseguia
            inserindo depois da última linha existente. */}
        <button
          type="button"
          className="cp-editor-add cp-theme-btn"
          ref={botaoAdicionar}
          onClick={() =>
            mutarEstrutura(songComLinhaNoFim(song), { plana: ordem.length, papel: 'editar' })
          }
        >
          + Adicionar linha no fim
        </button>
      </div>
    </div>
  );
}
