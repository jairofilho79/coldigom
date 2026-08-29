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

export type Song = {
  header: SongHeader;
  stanzas: Stanza[];
  /** Linhas ";" — recado de pipeline. Fora do corpo da cifra, exibidas no painel do material. */
  notes: string[];
  /** false quando o parse não produziu nenhuma linha de letra (regra 8). */
  hasLyrics: boolean;
};
