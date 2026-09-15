import { describe, expect, it, vi } from 'vitest';
import { scanFolderFilesAsync, mapDriveFilesAsync, folderNameFromFiles, bulkScanSummary } from '../lib/materialKindInference/scanFolder';

const KIND = {
  sheetMusic: '36fa6e60-37d6-40a4-87e4-aa099839ad25',
  unknown: 'c7454ea9-3ae0-4548-9cc5-c4187b80641a',
};

const materialKinds = [
  { id: KIND.sheetMusic, name: 'Partitura' },
  { id: KIND.unknown, name: 'Desconhecido' },
];

function mockFile(name: string, relPath?: string): File {
  const file = new File(['x'], name, { type: 'application/pdf' });
  if (relPath) {
    Object.defineProperty(file, 'webkitRelativePath', { value: relPath });
  }
  return file;
}

describe('scanFolderFilesAsync', () => {
  it('reports progress and yields results', async () => {
    const files = [
      mockFile('Partitura.pdf', 'Louvor/Partitura.pdf'),
      mockFile('doc.pdf', 'Louvor/doc.pdf'),
    ];
    const progress: number[] = [];
    const results = await scanFolderFilesAsync(files, materialKinds, (p) => {
      progress.push(p);
    });
    expect(results).toHaveLength(2);
    expect(results[0].material_kind).toBe(KIND.sheetMusic);
    expect(progress.at(-1)).toBe(2);
  });

  it('aborts when signal is cancelled', async () => {
    const files = Array.from({ length: 20 }, (_, i) =>
      mockFile(`f${i}.pdf`, `Pasta/f${i}.pdf`)
    );
    const ac = new AbortController();
    ac.abort();
    await expect(
      scanFolderFilesAsync(files, materialKinds, vi.fn(), ac.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('folderNameFromFiles', () => {
  it('extracts root folder name', () => {
    expect(folderNameFromFiles([mockFile('a.pdf', 'MinhaPasta/a.pdf')])).toBe('MinhaPasta');
  });
});

describe('bulkScanSummary', () => {
  it('counts unknown items', async () => {
    const files = [mockFile('Partitura.pdf'), mockFile('x.pdf')];
    const items = await scanFolderFilesAsync(files, materialKinds, () => {});
    const summary = bulkScanSummary(items);
    expect(summary.total).toBe(2);
    expect(summary.identified).toBeGreaterThanOrEqual(1);
  });
});

describe('scanFolderFilesAsync — catálogo sem o id de desconhecido', () => {
  it('acrescenta UNKNOWN_MATERIAL_KIND_ID ao catálogo quando o chamador não o inclui', async () => {
    const soConhecidos = [{ id: KIND.sheetMusic, name: 'Partitura' }];
    const files = [mockFile('sem-pista.xyz', 'Pasta/sem-pista.xyz')];
    const results = await scanFolderFilesAsync(files, soConhecidos, () => {});
    // Sem o id de desconhecido no catálogo passado, a função o acrescenta por
    // conta própria — senão um arquivo não identificado nem cairia no
    // material_kind "desconhecido", ficando sem nenhuma categoria válida.
    expect(results[0].material_kind).toBe(KIND.unknown);
  });
});

describe('mapDriveFilesAsync', () => {
  const driveFile = (i: number) => ({
    drive_file_id: `drive-${i}`,
    name: `Partitura${i}.pdf`,
    rel_path: `Louvor/Partitura${i}.pdf`,
    mime_type: 'application/pdf',
    size_bytes: 1024,
  });

  it('processa arquivos do Drive em lotes, reportando progresso até o total', async () => {
    const files = Array.from({ length: 10 }, (_, i) => driveFile(i));
    const progress: number[] = [];
    const results = await mapDriveFilesAsync(files, materialKinds, (p) => {
      progress.push(p);
    });
    expect(results).toHaveLength(10);
    expect(results[0].driveFileId).toBe('drive-0');
    expect(results[0].material_kind).toBe(KIND.sheetMusic);
    expect(progress.at(-1)).toBe(10);
    // Mais de um lote (BATCH_SIZE = 8): o progresso reporta um estágio intermediário.
    expect(progress).toContain(8);
  });

  it('acrescenta UNKNOWN_MATERIAL_KIND_ID ao catálogo quando o chamador não o inclui', async () => {
    const soConhecidos = [{ id: KIND.sheetMusic, name: 'Partitura' }];
    const files = [{ drive_file_id: 'd1', name: 'arquivo-sem-pista.xyz', rel_path: 'Pasta/arquivo-sem-pista.xyz' }];
    const results = await mapDriveFilesAsync(files, soConhecidos, () => {});
    expect(results[0].material_kind).toBe(KIND.unknown);
  });

  it('aborta quando o sinal já está cancelado', async () => {
    const files = Array.from({ length: 20 }, (_, i) => driveFile(i));
    const ac = new AbortController();
    ac.abort();
    await expect(
      mapDriveFilesAsync(files, materialKinds, vi.fn(), ac.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('mapDriveScanFile', () => {
  it('deduz o tipo a partir do mime_type quando o nome no Drive não tem extensão', async () => {
    const { mapDriveScanFile } = await import('../lib/materialKindInference/scanFolder');
    const catalogIds = new Set([KIND.sheetMusic, KIND.unknown]);
    const item = mapDriveScanFile(
      {
        drive_file_id: 'drive-123',
        name: 'BAIXO - Majestoso és',
        rel_path: 'Majestoso és/VOCAL/KIT ENSAIO/BAIXO - Majestoso és',
        mime_type: 'audio/x-m4a',
        size_bytes: 4737910,
      },
      catalogIds
    );
    expect(item.type).toBe('m4a');
    expect(item.driveFileId).toBe('drive-123');
  });
});
