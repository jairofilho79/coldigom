import { describe, expect, it, vi } from 'vitest';
import { scanFolderFilesAsync, folderNameFromFiles, bulkScanSummary } from '../lib/materialKindInference/scanFolder';

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
