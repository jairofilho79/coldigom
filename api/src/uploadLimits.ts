/**
 * Limites e validação dos uploads de material.
 *
 * O `type` do material vira a extensão da chave do R2
 * (`assets/praises/<louvor>/<material>.<type>`) e também é gravado no banco,
 * onde alimenta lógica da aplicação — `type = 'chord'` abre o viewer,
 * `type = 'youtube'` entra na busca por vídeo. Ele não era validado além de
 * "string não vazia", e uma sonda contra a app confirmou que
 * `type: "../../outro/roubado.pdf"` produzia a chave
 * `storage/assets/praises/X/<uuid>.../../outro/roubado.pdf`.
 */

/** 100 MB por arquivo. O ZIP de download já tinha teto; o upload não tinha nenhum. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Itens por lote. O laço do bulk-upload não tinha teto. */
export const MAX_UPLOAD_ITEMS = 200;

/**
 * 256 KB por cifra em `PUT /api/materials/:id/content`, que não tinha teto
 * nenhum: `c.req.text()` materializava o corpo inteiro antes de qualquer
 * checagem, e um PUT de 5 MB passava.
 *
 * Não reaproveita MAX_UPLOAD_BYTES — aqueles 100 MB são para PDF e áudio. Uma
 * cifra do acervo tem ~611 bytes; a mais longa que se pode imaginar, com
 * anotação em cada linha, não passa de umas dezenas de KB. 256 KB dá ~400x de
 * folga sobre a média e ainda é pequeno o bastante para que um corpo absurdo
 * seja recusado antes de virar objeto gigante no R2 sob a chave de uma cifra.
 */
export const MAX_CHORD_CONTENT_BYTES = 256 * 1024;

/**
 * Restringe por FORMA, não por lista fechada: o acervo tem tipos que não estão
 * todos no código (pdf, mp3, mid, midi, chord, gestures, txt, link, youtube, e
 * possivelmente outros vindos da ingestão legada). Uma lista errada quebraria
 * material que já existe; a forma barra travessia, curinga de URL e
 * comprimento absurdo sem precisar conhecer todos os valores.
 */
export function isSafeMaterialType(type: unknown): type is string {
  return typeof type === 'string' && /^[a-z0-9]{1,16}$/.test(type);
}
