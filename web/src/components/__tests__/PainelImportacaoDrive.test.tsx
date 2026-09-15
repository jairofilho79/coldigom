import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PainelImportacaoDrive } from '../PainelImportacaoDrive';
import { INITIAL_BULK_SCAN, type BulkScanState } from '../bulkScanState';
import type { BulkFileItem } from '../../lib/materialKindInference/scanFolder';

const options = [{ value: 'kind-1', label: 'Partitura' }];

function arquivo(relPath: string): BulkFileItem {
  return {
    driveFileId: `drive-${relPath}`,
    relPath,
    type: 'pdf',
    material_kind: 'kind-1',
    inference: { materialKindId: 'kind-1', confidence: 0.9, method: 'exact' },
  };
}

describe('PainelImportacaoDrive', () => {
  it('pede autorização quando o Drive não está conectado, e chama onConectar', async () => {
    const user = userEvent.setup();
    const onConectar = vi.fn();
    render(
      <PainelImportacaoDrive
        conectado={false}
        onConectar={onConectar}
        url=""
        onUrlChange={vi.fn()}
        ocupado={false}
        onMapear={vi.fn()}
        scan={INITIAL_BULK_SCAN}
        arquivos={[]}
        pulados={[]}
        materialKindOptions={options}
        onKindChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    const botao = screen.getByRole('button', { name: /conectar google drive/i });
    await user.click(botao);
    expect(onConectar).toHaveBeenCalledTimes(1);
  });

  it('não pede autorização quando conectado é null (ainda checando) ou true', () => {
    const { rerender } = render(
      <PainelImportacaoDrive
        conectado={null}
        onConectar={vi.fn()}
        url=""
        onUrlChange={vi.fn()}
        ocupado={false}
        onMapear={vi.fn()}
        scan={INITIAL_BULK_SCAN}
        arquivos={[]}
        pulados={[]}
        materialKindOptions={options}
        onKindChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /conectar google drive/i })).not.toBeInTheDocument();

    rerender(
      <PainelImportacaoDrive
        conectado={true}
        onConectar={vi.fn()}
        url=""
        onUrlChange={vi.fn()}
        ocupado={false}
        onMapear={vi.fn()}
        scan={INITIAL_BULK_SCAN}
        arquivos={[]}
        pulados={[]}
        materialKindOptions={options}
        onKindChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /conectar google drive/i })).not.toBeInTheDocument();
  });

  it('digitar no campo de link chama onUrlChange, e Mapear pasta chama onMapear com link preenchido', async () => {
    const user = userEvent.setup();
    const onUrlChange = vi.fn();
    const onMapear = vi.fn();
    render(
      <PainelImportacaoDrive
        conectado={true}
        onConectar={vi.fn()}
        url="https://drive.google.com/drive/folders/abc"
        onUrlChange={onUrlChange}
        ocupado={false}
        onMapear={onMapear}
        scan={INITIAL_BULK_SCAN}
        arquivos={[]}
        pulados={[]}
        materialKindOptions={options}
        onKindChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    const input = screen.getByLabelText(/link da pasta ou arquivo/i);
    await user.type(input, 'x');
    expect(onUrlChange).toHaveBeenCalled();

    const botaoMapear = screen.getByRole('button', { name: /mapear pasta/i });
    expect(botaoMapear).not.toBeDisabled();
    await user.click(botaoMapear);
    expect(onMapear).toHaveBeenCalledTimes(1);
  });

  it('desabilita o campo e o botão, e troca o texto para "Lendo…", enquanto ocupado', () => {
    render(
      <PainelImportacaoDrive
        conectado={true}
        onConectar={vi.fn()}
        url="https://drive.google.com/drive/folders/abc"
        onUrlChange={vi.fn()}
        ocupado={true}
        onMapear={vi.fn()}
        scan={INITIAL_BULK_SCAN}
        arquivos={[]}
        pulados={[]}
        materialKindOptions={options}
        onKindChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/link da pasta ou arquivo/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /lendo…/i })).toBeDisabled();
  });

  it('desabilita Mapear pasta quando o link está vazio', () => {
    render(
      <PainelImportacaoDrive
        conectado={true}
        onConectar={vi.fn()}
        url="   "
        onUrlChange={vi.fn()}
        ocupado={false}
        onMapear={vi.fn()}
        scan={INITIAL_BULK_SCAN}
        arquivos={[]}
        pulados={[]}
        materialKindOptions={options}
        onKindChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /mapear pasta/i })).toBeDisabled();
  });

  it('lista os itens pulados e resume o excedente além dos 8 primeiros', () => {
    const pulados = Array.from({ length: 10 }, (_, i) => ({ path: `arquivo${i}.gdoc`, reason: 'Google Docs' }));
    render(
      <PainelImportacaoDrive
        conectado={true}
        onConectar={vi.fn()}
        url="https://drive.google.com/drive/folders/abc"
        onUrlChange={vi.fn()}
        ocupado={false}
        onMapear={vi.fn()}
        scan={INITIAL_BULK_SCAN}
        arquivos={[]}
        pulados={pulados}
        materialKindOptions={options}
        onKindChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText('10 item(ns) pulado(s)')).toBeInTheDocument();
    expect(screen.getByText('arquivo0.gdoc: Google Docs')).toBeInTheDocument();
    expect(screen.getByText('… e mais 2')).toBeInTheDocument();
  });

  it('mostra a prévia dos arquivos e a ação do lote só quando o scan termina com arquivos mapeados', () => {
    const scanDone: BulkScanState = { phase: 'done', processed: 2, total: 2, folderName: 'Louvor', error: null };
    render(
      <PainelImportacaoDrive
        conectado={true}
        onConectar={vi.fn()}
        url="https://drive.google.com/drive/folders/abc"
        onUrlChange={vi.fn()}
        ocupado={false}
        onMapear={vi.fn()}
        scan={scanDone}
        arquivos={[arquivo('a.pdf'), arquivo('b.pdf')]}
        pulados={[]}
        materialKindOptions={options}
        onKindChange={vi.fn()}
        onRemove={vi.fn()}
        acaoDoLote={<button type="button">Importar lote</button>}
        ajudaExtra={<span>ajuda extra</span>}
      >
        <div>acompanhamento do job</div>
      </PainelImportacaoDrive>
    );
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar lote' })).toBeInTheDocument();
    expect(screen.getByText('ajuda extra')).toBeInTheDocument();
    expect(screen.getByText('acompanhamento do job')).toBeInTheDocument();
  });

  it('não mostra a prévia nem a ação do lote enquanto o scan não termina', () => {
    render(
      <PainelImportacaoDrive
        conectado={true}
        onConectar={vi.fn()}
        url="https://drive.google.com/drive/folders/abc"
        onUrlChange={vi.fn()}
        ocupado={false}
        onMapear={vi.fn()}
        scan={{ phase: 'scanning', processed: 1, total: 2, folderName: 'Louvor', error: null }}
        arquivos={[arquivo('a.pdf')]}
        pulados={[]}
        materialKindOptions={options}
        onKindChange={vi.fn()}
        onRemove={vi.fn()}
        acaoDoLote={<button type="button">Importar lote</button>}
      />
    );
    expect(screen.queryByRole('button', { name: 'Importar lote' })).not.toBeInTheDocument();
  });
});
