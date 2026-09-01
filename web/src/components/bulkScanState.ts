/**
 * Estado do mapeamento de uma pasta (local ou do Drive).
 *
 * Mora fora do `BulkFolderScanStatus.tsx` porque um arquivo que exporta
 * componentes e constantes junto quebra o fast refresh do Vite — a cada
 * salvamento o componente perde o estado em vez de só reaplicar o código.
 */

export type BulkScanPhase = 'idle' | 'scanning' | 'done' | 'error';

export type BulkScanState = {
  phase: BulkScanPhase;
  processed: number;
  total: number;
  folderName: string | null;
  error: string | null;
};

export const INITIAL_BULK_SCAN: BulkScanState = {
  phase: 'idle',
  processed: 0,
  total: 0,
  folderName: null,
  error: null,
};
