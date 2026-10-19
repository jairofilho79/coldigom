import type { Caminho } from './flatten';

export type ItemRange = {
  caminho: Caminho;
  start: number;
  end: number;
  startLine: number;
  endLine: number;
};

/**
 * Localiza os limites (offset e linha) de cada item dentro do JSON de um documento de gestos.
 * Percorre "items" e "children" rastreando chaves e níveis de aninhamento.
 */
export function encontrarLimitesDosItens(jsonStr: string): ItemRange[] {
  const ranges: ItemRange[] = [];
  const len = jsonStr.length;
  let pos = 0;

  // Mapa de offsets de quebras de linha para calcular número de linha (1-indexed)
  const quebras: number[] = [0];
  for (let i = 0; i < len; i++) {
    if (jsonStr[i] === '\n') {
      quebras.push(i + 1);
    }
  }

  function offsetParaLinha(offset: number): number {
    let low = 0;
    let high = quebras.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (quebras[mid] <= offset) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return high + 1;
  }

  function skipWhitespace() {
    while (pos < len && /\s/.test(jsonStr[pos])) pos++;
  }

  const itemsIdx = jsonStr.indexOf('"items"');
  if (itemsIdx === -1) return ranges;
  pos = itemsIdx + 7;
  skipWhitespace();
  if (jsonStr[pos] !== ':') return ranges;
  pos++;
  skipWhitespace();
  if (jsonStr[pos] !== '[') return ranges;
  pos++; // dentro de items [...]

  function scanArray(caminhoBase: Caminho) {
    let childIndex = 0;
    while (pos < len) {
      skipWhitespace();
      if (jsonStr[pos] === ']') {
        pos++;
        break;
      }
      if (jsonStr[pos] === ',') {
        pos++;
        continue;
      }
      if (jsonStr[pos] === '{') {
        const itemStart = pos;
        const caminho: Caminho = [...caminhoBase, childIndex];
        childIndex++;

        let braceDepth = 1;
        pos++;
        while (pos < len && braceDepth > 0) {
          skipWhitespace();
          if (jsonStr[pos] === '"') {
            const strStart = pos;
            pos++;
            while (pos < len && (jsonStr[pos] !== '"' || jsonStr[pos - 1] === '\\')) pos++;
            const str = jsonStr.slice(strStart + 1, pos);
            pos++; // fecha aspas
            skipWhitespace();
            if (str === 'children' && jsonStr[pos] === ':') {
              pos++;
              skipWhitespace();
              if (jsonStr[pos] === '[') {
                pos++;
                scanArray(caminho);
              }
            }
          } else if (jsonStr[pos] === '{') {
            braceDepth++;
            pos++;
          } else if (jsonStr[pos] === '}') {
            braceDepth--;
            pos++;
            if (braceDepth === 0) {
              const itemEnd = pos;
              ranges.push({
                caminho,
                start: itemStart,
                end: itemEnd,
                startLine: offsetParaLinha(itemStart),
                endLine: offsetParaLinha(itemEnd),
              });
              break;
            }
          } else {
            pos++;
          }
        }
      } else {
        pos++;
      }
    }
  }

  scanArray([]);
  return ranges;
}

/**
 * Dado o offset do cursor no textarea, encontra o item mais específico sob o cursor.
 */
export function itemNoOffset(ranges: ItemRange[], offset: number): Caminho | null {
  let melhor: ItemRange | null = null;
  for (const r of ranges) {
    if (offset >= r.start && offset <= r.end) {
      if (!melhor || r.caminho.length > melhor.caminho.length) {
        melhor = r;
      }
    }
  }
  return melhor ? melhor.caminho : null;
}

/**
 * Dado um intervalo de seleção [start, end], devolve os itens de nível superior envolvidos.
 */
export function itensNoIntervalo(ranges: ItemRange[], start: number, end: number): Caminho[] {
  if (start === end) {
    const item = itemNoOffset(ranges, start);
    return item ? [item] : [];
  }
  const sobrepostos = ranges.filter((r) => Math.max(r.start, start) < Math.min(r.end, end));
  if (sobrepostos.length === 0) return [];
  const minProfundidade = Math.min(...sobrepostos.map((r) => r.caminho.length));
  const raiz = sobrepostos.filter((r) => r.caminho.length === minProfundidade);
  return raiz.map((r) => r.caminho);
}
