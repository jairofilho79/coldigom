import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
