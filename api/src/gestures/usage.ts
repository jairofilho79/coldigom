import type { GestureDocument, Item } from './schema';

/**
 * A única coisa que sabe traduzir documento em linhas de gesture_usage. Serve ao
 * PUT /content e ao importador; se os dois contassem por conta própria, um dia
 * divergiriam e a página do dicionário mentiria o uso.
 */
export function contarUsos(doc: GestureDocument): Map<string, number> {
  const usos = new Map<string, number>();
  const visitar = (item: Item): void => {
    if (item.type === 'gesture') {
      usos.set(item.gestureId, (usos.get(item.gestureId) ?? 0) + 1);
      return;
    }
    if ('children' in item) item.children.forEach(visitar);
  };
  doc.items.forEach(visitar);
  return usos;
}

/** Reescrita usada pelo replace-with: imutável, devolve o documento novo e quantos ids trocou. */
export function substituirGesto(
  doc: GestureDocument,
  de: string,
  para: string
): { doc: GestureDocument; trocados: number } {
  let trocados = 0;
  const mapear = <T extends Item>(item: T): T => {
    if (item.type === 'gesture') {
      if (item.gestureId !== de) return item;
      trocados += 1;
      return { ...item, gestureId: para };
    }
    if ('children' in item) {
      return { ...item, children: item.children.map(mapear) };
    }
    return item;
  };
  return { doc: { ...doc, items: doc.items.map(mapear) }, trocados };
}
