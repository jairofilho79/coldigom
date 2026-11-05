import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BulkFolderScanStatus, InferenceBadge } from '../BulkFolderScanStatus';
import { INITIAL_BULK_SCAN } from '../bulkScanState';

describe('estado da importação de pasta', () => {
  it('mostra confiança e método da categoria identificada', () => {
    const { rerender } = render(<InferenceBadge inference={{ materialKindId: 'v', confidence: 0.8, method: 'fuzzy', matchedOn: 'voz' }} />);
    expect(screen.getByText('Auto 80%')).toHaveAttribute('title', '80% (fuzzy) — voz');
    rerender(<InferenceBadge inference={{ materialKindId: 'v', confidence: 0.95, method: 'exact' }} />);
    expect(screen.getByText('Auto 95%')).toHaveAttribute('title', '95% (exact)');
    rerender(<InferenceBadge inference={{ materialKindId: '', confidence: 0, method: 'unknown' }} />);
    expect(screen.getByText('Desconhecido')).toBeInTheDocument();
  });

  it('mostra progresso zero antes de conhecer o total', () => {
    render(<BulkFolderScanStatus scan={{ ...INITIAL_BULK_SCAN, phase: 'scanning' }} files={[]} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('status')).toHaveTextContent('0/0');
  });

  it('oferece nova tentativa após erro e usa mensagem padrão quando necessário', async () => {
    const onRetry = vi.fn();
    const scan = { ...INITIAL_BULK_SCAN, phase: 'error' as const };
    const { rerender } = render(<BulkFolderScanStatus scan={scan} files={[]} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao analisar a pasta.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<BulkFolderScanStatus scan={{ ...scan, error: 'Pasta indisponível' }} files={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Pasta indisponível');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
