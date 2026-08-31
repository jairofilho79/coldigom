/**
 * Chave do objeto no R2 a partir do `r2_key` gravado na linha do material.
 *
 * A normalização existia em UM lugar só (o head de `has_content`) e faltava nas
 * outras três chamadas. Com um `r2_key` legado começando por `/`, a gravação
 * respondia 200 mas ia parar em `storage//assets/...`: `has_content` continuava
 * false, o leitor nunca via o texto e o objeto ficava órfão no bucket.
 */
export function storageKeyFor(r2Key: string): string {
  return `storage/${String(r2Key).replace(/^\/+/, '')}`;
}
