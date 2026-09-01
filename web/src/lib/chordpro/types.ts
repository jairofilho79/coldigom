export type Cell = {
  /** Nome do acorde sem colchetes, ou null na célula de texto que precede o primeiro acorde. */
  chord: string | null;
  /** true quando o acorde encosta em texto — é o que desenha a barra vermelha. */
  attached: boolean;
  /** Texto até o próximo acorde. Espaços preservados byte a byte. Nunca sofre trim. */
  text: string;
};

export type Line =
  | { kind: 'cells'; cells: Cell[] }
  | { kind: 'comment'; text: string };

export type Stanza = { lines: Line[] };

export type SongHeader = {
  title?: string;
  subtitle?: string;
  key?: string;
  rhythm?: string;
  artist?: string;
};

/**
 * Uma linha do bloco de diretivas do topo, na ordem literal do arquivo.
 *
 * `field` é uma das cinco diretivas de cabeçalho: guarda o valor lido e a linha crua,
 * para que `serialize` devolva o byte original enquanto o campo não for editado
 * (`{artist:X}` sem espaço, `{Title: X}` maiúsculo — o acervo tem de tudo).
 * `value: undefined` é a diretiva presente com valor ausente (`{key: }`, `{subtitle: ?}`):
 * ela não entra no `header`, mas a linha continua no arquivo.
 *
 * `raw` é qualquer outra linha do topo: `{meta: column left}`, diretiva desconhecida,
 * nota ";" e linha em branco.
 */
export type HeaderEntry =
  | { kind: 'field'; key: keyof SongHeader; value: string | undefined; text: string }
  | { kind: 'raw'; text: string };

/**
 * Linha do corpo que o modelo estrutural não representa — nota ";", diretiva
 * desconhecida ou linha em branco a mais — guardada com a coordenada da linha
 * estrutural que ela precedia.
 *
 * `stanza === song.stanzas.length` quer dizer "depois da última estrofe";
 * `line === stanza.lines.length`, "no fim da estrofe".
 */
export type RawLine = { stanza: number; line: number; text: string };

export type Song = {
  header: SongHeader;
  stanzas: Stanza[];
  /** Linhas ";" — recado de pipeline. Fora do corpo da cifra, exibidas no painel do material. */
  notes: string[];
  /** false quando o parse não produziu nenhuma linha de letra (regra 8). */
  hasLyrics: boolean;
  /**
   * O bloco do topo, literal. `undefined` = este Song não veio do parser (foi montado
   * à mão, no editor ou num teste): aí `serialize` cai na ordem canônica de sempre.
   * Um Song que veio do parser tem sempre um array, ainda que vazio.
   */
  headerLines?: HeaderEntry[];
  /** As linhas cruas do corpo. `undefined` junto com `headerLines`, pelo mesmo motivo. */
  rawLines?: RawLine[];
};

/** Endereço de uma linha dentro do Song. Validação e edição falam as mesmas
 *  coordenadas; mora aqui para que edit.ts não precise depender de validate.ts. */
export type LineRef = { stanza: number; line: number };
