/**
 * Espelho dos limites que a API aplica em `api/src/uploadLimits.ts`.
 *
 * A fonte de verdade continua sendo o servidor — isto aqui existe para o
 * usuário descobrir o problema ANTES de a rede ser usada. Sem isso, uma pasta
 * de 300 arquivos subia inteira e só então voltava recusada, e um arquivo
 * grande demais derrubava o lote inteiro depois da espera.
 *
 * Se um dia divergirem, o servidor manda e o usuário vê a recusa dele.
 */

/** 100 MB por arquivo. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Itens por requisição de lote. */
export const MAX_UPLOAD_ITEMS = 200;

/** Mesma forma aceita pela API: barra travessia de caminho e nome sem extensão. */
export function isSafeMaterialType(type: unknown): type is string {
  return typeof type === 'string' && /^[a-z0-9]{1,16}$/.test(type);
}

export function formatarMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export type ProblemaDeArquivo = 'grande' | 'tipo';

/**
 * Por que este arquivo seria recusado pela API, ou null se está tudo certo.
 * O tipo inválido vem de arquivo sem extensão (`Louvor 42` vira o tipo
 * `louvor 42`) ou de nomes como `.DS_Store`, e hoje derruba o lote inteiro.
 */
export function problemaDoArquivo(item: {
  type: string;
  sizeBytes?: number;
}): ProblemaDeArquivo | null {
  if (!isSafeMaterialType(item.type)) return 'tipo';
  if (typeof item.sizeBytes === 'number' && item.sizeBytes > MAX_UPLOAD_BYTES) return 'grande';
  return null;
}

/** Divide o lote em requisições que a API aceita. */
export function fatiarLote<T>(itens: T[], tamanho = MAX_UPLOAD_ITEMS): T[][] {
  const fatias: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    fatias.push(itens.slice(i, i + tamanho));
  }
  return fatias;
}
