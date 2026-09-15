import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkFilePreviewList } from '../BulkFilePreviewList';
import type { BulkFileItem } from '../../lib/materialKindInference/scanFolder';

const sampleOptions = [
  { value: 'kind-1', label: 'Partitura' },
  { value: 'kind-2', label: 'Áudio' },
];

describe('BulkFilePreviewList audio conversion', () => {
  const onConvertToMp3 = vi.fn();
  const onConvertAllToMp3 = vi.fn();
  const onKindChange = vi.fn();
  const onRemove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders convert-all banner and row convert buttons when convertible audio files exist', async () => {
    const user = userEvent.setup();
    const files: BulkFileItem[] = [
      {
        relPath: 'audio1.m4a',
        type: 'm4a',
        material_kind: 'kind-2',
        inference: { materialKindId: 'kind-2', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'audio1.m4a', { type: 'audio/mp4' }),
      },
      {
        relPath: 'sheet.pdf',
        type: 'pdf',
        material_kind: 'kind-1',
        inference: { materialKindId: 'kind-1', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'sheet.pdf', { type: 'application/pdf' }),
      },
    ];

    render(
      <BulkFilePreviewList
        files={files}
        materialKindOptions={sampleOptions}
        onKindChange={onKindChange}
        onRemove={onRemove}
        onConvertToMp3={onConvertToMp3}
        onConvertAllToMp3={onConvertAllToMp3}
      />
    );

    // Banner should be visible
    expect(screen.getByText(/1 áudio\(s\) conversível\(is\) para MP3 detectado\(s\)/)).toBeInTheDocument();

    const convertAllBtn = screen.getByRole('button', { name: /converter para mp3/i });
    expect(convertAllBtn).toBeInTheDocument();
    await user.click(convertAllBtn);
    expect(onConvertAllToMp3).toHaveBeenCalledTimes(1);

    // Single item convert button
    const singleConvertBtn = screen.getByRole('button', { name: /converter audio1.m4a para mp3/i });
    expect(singleConvertBtn).toBeInTheDocument();
    await user.click(singleConvertBtn);
    expect(onConvertToMp3).toHaveBeenCalledWith(0);
  });

  it('disables conversion buttons when converting is true', () => {
    const files: BulkFileItem[] = [
      {
        relPath: 'audio1.m4a',
        type: 'm4a',
        material_kind: 'kind-2',
        inference: { materialKindId: 'kind-2', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'audio1.m4a', { type: 'audio/mp4' }),
      },
    ];

    render(
      <BulkFilePreviewList
        files={files}
        materialKindOptions={sampleOptions}
        onConvertToMp3={onConvertToMp3}
        onConvertAllToMp3={onConvertAllToMp3}
        converting={true}
      />
    );

    expect(screen.getByRole('button', { name: /convertendo para mp3…/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /converter audio1.m4a para mp3/i })).toBeDisabled();
  });

  it('does not render convert banner when only non-convertible files exist', () => {
    const files: BulkFileItem[] = [
      {
        relPath: 'song.mp3',
        type: 'mp3',
        material_kind: 'kind-2',
        inference: { materialKindId: 'kind-2', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'song.mp3', { type: 'audio/mpeg' }),
      },
      {
        relPath: 'sheet.pdf',
        type: 'pdf',
        material_kind: 'kind-1',
        inference: { materialKindId: 'kind-1', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'sheet.pdf', { type: 'application/pdf' }),
      },
    ];

    render(
      <BulkFilePreviewList
        files={files}
        materialKindOptions={sampleOptions}
        onConvertToMp3={onConvertToMp3}
        onConvertAllToMp3={onConvertAllToMp3}
      />
    );

    expect(screen.queryByText(/áudio\(s\) conversível\(is\) para MP3 detectado\(s\)/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /converter.*mp3/i })).not.toBeInTheDocument();
  });

  it('renders downloading and converting progress with percentage and progressbar', () => {
    const files: BulkFileItem[] = [
      {
        relPath: 'audio1.m4a',
        type: 'm4a',
        material_kind: 'kind-2',
        inference: { materialKindId: 'kind-2', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'audio1.m4a', { type: 'audio/mp4' }),
      },
      {
        relPath: 'audio2.m4a',
        type: 'm4a',
        material_kind: 'kind-2',
        inference: { materialKindId: 'kind-2', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'audio2.m4a', { type: 'audio/mp4' }),
      },
    ];

    const { rerender } = render(
      <BulkFilePreviewList
        files={files}
        materialKindOptions={sampleOptions}
        onConvertToMp3={onConvertToMp3}
        onConvertAllToMp3={onConvertAllToMp3}
        converting={true}
        convertingIndex={0}
        conversionProgress={{
          phase: 'downloading',
          current: 1,
          total: 2,
          fileName: 'audio1.m4a',
        }}
      />
    );

    expect(screen.getByText(/Baixando do Drive \(1\/2\):/)).toBeInTheDocument();
    expect(screen.getAllByText('audio1.m4a')).toHaveLength(2);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Convertendo…')).toBeInTheDocument();

    // Now converting with 65% progress
    rerender(
      <BulkFilePreviewList
        files={files}
        materialKindOptions={sampleOptions}
        onConvertToMp3={onConvertToMp3}
        onConvertAllToMp3={onConvertAllToMp3}
        converting={true}
        convertingIndex={0}
        conversionProgress={{
          phase: 'converting',
          current: 1,
          total: 2,
          fileName: 'audio1.m4a',
          percent: 65,
        }}
      />
    );

    expect(screen.getByText(/Convertendo para MP3 \(1\/2\):/)).toBeInTheDocument();
    expect(screen.getByText(/\(65%\)…/)).toBeInTheDocument();
  });

  it('renders error banner with retry option when conversion fails', () => {
    const files: BulkFileItem[] = [
      {
        relPath: 'audio1.m4a',
        type: 'm4a',
        material_kind: 'kind-2',
        inference: { materialKindId: 'kind-2', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'audio1.m4a', { type: 'audio/mp4' }),
      },
    ];

    render(
      <BulkFilePreviewList
        files={files}
        materialKindOptions={sampleOptions}
        onConvertToMp3={onConvertToMp3}
        onConvertAllToMp3={onConvertAllToMp3}
        conversionProgress={{
          phase: 'error',
          error: 'Codec não suportado',
        }}
      />
    );

    expect(screen.getByText(/Falha na conversão: Codec não suportado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('renders success message when conversion is completed', () => {
    const files: BulkFileItem[] = [
      {
        relPath: 'audio1.m4a',
        type: 'm4a',
        material_kind: 'kind-2',
        inference: { materialKindId: 'kind-2', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'audio1.m4a', { type: 'audio/mp4' }),
      },
    ];

    render(
      <BulkFilePreviewList
        files={files}
        materialKindOptions={sampleOptions}
        onConvertToMp3={onConvertToMp3}
        onConvertAllToMp3={onConvertAllToMp3}
        conversionProgress={{
          phase: 'done',
          total: 1,
        }}
      />
    );

    expect(screen.getByText(/1 áudio\(s\) convertidos com sucesso para MP3!/)).toBeInTheDocument();
  });
});

describe('BulkFilePreviewList — categoria, prévia e remoção', () => {
  const onKindChange = vi.fn();
  const onRemove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('troca a categoria pelo seletor e chama onKindChange com o índice certo', async () => {
    const user = userEvent.setup();
    const files: BulkFileItem[] = [
      {
        relPath: 'sheet.pdf',
        type: 'pdf',
        material_kind: 'kind-1',
        inference: { materialKindId: 'kind-1', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'sheet.pdf', { type: 'application/pdf' }),
      },
    ];

    render(
      <BulkFilePreviewList
        files={files}
        materialKindOptions={sampleOptions}
        onKindChange={onKindChange}
        onRemove={onRemove}
      />
    );

    await user.click(screen.getByLabelText('Categoria do material'));
    await user.click(screen.getByRole('option', { name: 'Áudio' }));
    expect(onKindChange).toHaveBeenCalledWith(0, 'kind-2');
  });

  it('abre a prévia de um arquivo local numa nova aba e revoga o object URL depois', () => {
    // fireEvent (síncrono) em vez de userEvent: com timers falsos, o
    // userEvent hospeda esperas internas que travam mesmo com advanceTimers.
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:local-preview');
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const files: BulkFileItem[] = [
      {
        relPath: 'sheet.pdf',
        type: 'pdf',
        material_kind: 'kind-1',
        inference: { materialKindId: 'kind-1', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'sheet.pdf', { type: 'application/pdf' }),
      },
    ];

    try {
      render(
        <BulkFilePreviewList
          files={files}
          materialKindOptions={sampleOptions}
          onKindChange={onKindChange}
          onRemove={onRemove}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Ver sheet.pdf' }));
      expect(createObjectURL).toHaveBeenCalledWith(files[0].file);
      expect(openSpy).toHaveBeenCalledWith('blob:local-preview', '_blank', 'noopener,noreferrer');

      // A revogação é agendada para 60s depois — confirmamos o agendamento
      // avançando o relógio falso, sem esperar o tempo real todo.
      vi.advanceTimersByTime(60_000);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-preview');
    } finally {
      vi.useRealTimers();
      openSpy.mockRestore();
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('linka para o Drive quando o item vem do Drive, em vez de abrir prévia local', () => {
    const files: BulkFileItem[] = [
      {
        driveFileId: 'drive-42',
        relPath: 'Louvor/audio.m4a',
        type: 'm4a',
        material_kind: 'kind-2',
        inference: { materialKindId: 'kind-2', confidence: 0.9, method: 'exact' },
      },
    ];

    render(
      <BulkFilePreviewList
        files={files}
        materialKindOptions={sampleOptions}
        onKindChange={onKindChange}
        onRemove={onRemove}
      />
    );

    const link = screen.getByRole('link', { name: 'Ver Louvor/audio.m4a no Google Drive' });
    expect(link).toHaveAttribute('href', 'https://drive.google.com/file/d/drive-42/view');
  });

  it('remove o item pelo botão Remover, chamando onRemove com o índice', async () => {
    const user = userEvent.setup();
    const files: BulkFileItem[] = [
      {
        relPath: 'sheet.pdf',
        type: 'pdf',
        material_kind: 'kind-1',
        inference: { materialKindId: 'kind-1', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'sheet.pdf', { type: 'application/pdf' }),
      },
    ];

    render(
      <BulkFilePreviewList
        files={files}
        materialKindOptions={sampleOptions}
        onKindChange={onKindChange}
        onRemove={onRemove}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remover da importação' }));
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it('mostra a categoria só como texto, sem seletor nem remoção, quando não editável', () => {
    const files: BulkFileItem[] = [
      {
        relPath: 'sheet.pdf',
        type: 'pdf',
        material_kind: 'kind-1',
        inference: { materialKindId: 'kind-1', confidence: 0.9, method: 'exact' },
        file: new File(['dummy'], 'sheet.pdf', { type: 'application/pdf' }),
      },
    ];

    render(
      <BulkFilePreviewList
        files={files}
        materialKindOptions={sampleOptions}
        editable={false}
      />
    );

    expect(screen.queryByLabelText('Categoria do material')).not.toBeInTheDocument();
    expect(screen.getByText('Partitura')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remover/i })).not.toBeInTheDocument();
  });

  it('mostra "Ver os N arquivo(s)" quando há mais itens que a prévia, e clicar revela o resto', async () => {
    const user = userEvent.setup();
    const files: BulkFileItem[] = Array.from({ length: 30 }, (_, i) => ({
      relPath: `arquivo-${i}.pdf`,
      type: 'pdf',
      material_kind: 'kind-1',
      inference: { materialKindId: 'kind-1', confidence: 0.9, method: 'exact' },
      file: new File(['dummy'], `arquivo-${i}.pdf`, { type: 'application/pdf' }),
    }));

    render(
      <BulkFilePreviewList
        files={files}
        materialKindOptions={sampleOptions}
        onKindChange={onKindChange}
        onRemove={onRemove}
      />
    );

    expect(screen.queryByText('arquivo-29.pdf')).not.toBeInTheDocument();
    const verTodos = screen.getByRole('button', { name: /ver os 30 arquivo\(s\)/i });
    await user.click(verTodos);
    expect(screen.getByText('arquivo-29.pdf')).toBeInTheDocument();
  });
});

