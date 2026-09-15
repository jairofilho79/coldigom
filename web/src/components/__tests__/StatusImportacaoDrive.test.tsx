import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusImportacaoDrive } from '../StatusImportacaoDrive';
import type { ImportJobSummary } from '../../services/api';

function job(overrides: Partial<ImportJobSummary> = {}): ImportJobSummary {
  return {
    id: 'job-1',
    praise_id: 'praise-1',
    status: 'running',
    total_count: 4,
    done_count: 1,
    failed_count: 0,
    skipped_count: 0,
    ...overrides,
  };
}

describe('StatusImportacaoDrive', () => {
  it('não renderiza nada sem erro nem job', () => {
    const { container } = render(
      <StatusImportacaoDrive job={null} erro={null} ocupado={false} onTentarFalhas={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra a mensagem de erro do acompanhamento mesmo sem job', () => {
    render(
      <StatusImportacaoDrive job={null} erro="Falha ao consultar status" ocupado={false} onTentarFalhas={vi.fn()} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Falha ao consultar status');
  });

  it('avisa para não sair da tela enquanto o job está em andamento e mostra o resumo', () => {
    render(
      <StatusImportacaoDrive job={job({ status: 'running' })} erro={null} ocupado={false} onTentarFalhas={vi.fn()} />
    );
    expect(screen.getByText(/Não saia desta tela/)).toBeInTheDocument();
    expect(screen.getByText('1/4 importados')).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('mostra "Na fila" para status desconhecido/pendente e some com o aviso de permanência quando terminal', () => {
    render(
      <StatusImportacaoDrive
        job={job({ status: 'queued' })}
        erro={null}
        ocupado={false}
        onTentarFalhas={vi.fn()}
      />
    );
    expect(screen.getByText('Na fila')).toBeInTheDocument();
  });

  it('mostra "Concluída" sem aviso de permanência quando o job termina com sucesso', () => {
    render(
      <StatusImportacaoDrive
        job={job({ status: 'done', done_count: 4, failed_count: 0 })}
        erro={null}
        ocupado={false}
        onTentarFalhas={vi.fn()}
      />
    );
    expect(screen.queryByText(/Não saia desta tela/)).not.toBeInTheDocument();
    expect(screen.getByText('Concluída')).toBeInTheDocument();
  });

  it('mostra "Concluída com erros" e a contagem de falhas quando parte do lote falhou', () => {
    render(
      <StatusImportacaoDrive
        job={job({ status: 'completed_with_errors', done_count: 3, failed_count: 1 })}
        erro={null}
        ocupado={false}
        onTentarFalhas={vi.fn()}
      />
    );
    expect(screen.getByText(/3\/4 importados · 1 com erro/)).toBeInTheDocument();
    expect(screen.getByText('Concluída com erros')).toBeInTheDocument();
  });

  it('mostra "Falhou" quando o job inteiro falha', () => {
    render(
      <StatusImportacaoDrive
        job={job({ status: 'failed', done_count: 0, failed_count: 4 })}
        erro={null}
        ocupado={false}
        onTentarFalhas={vi.fn()}
      />
    );
    expect(screen.getByText('Falhou')).toBeInTheDocument();
  });

  it('lista os itens do job com o rótulo e o motivo da falha de cada um', () => {
    render(
      <StatusImportacaoDrive
        job={job({
          status: 'completed_with_errors',
          done_count: 1,
          failed_count: 1,
          items: [
            { id: 'i1', drive_file_id: 'd1', file_path_legacy: 'Louvor/audio.mp3', status: 'done', error: null },
            { id: 'i2', drive_file_id: 'd2', file_path_legacy: null, status: 'failed', error: 'Arquivo corrompido' },
            { id: 'i3', drive_file_id: 'd3', file_path_legacy: null, status: 'running', error: null },
            { id: 'i4', drive_file_id: 'd4', file_path_legacy: null, status: 'queued', error: null },
          ],
        })}
        erro={null}
        ocupado={false}
        onTentarFalhas={vi.fn()}
      />
    );
    expect(screen.getByText('Louvor/audio.mp3')).toBeInTheDocument();
    expect(screen.getByText('d2')).toBeInTheDocument();
    expect(screen.getByText('Arquivo corrompido')).toBeInTheDocument();
    expect(screen.getByText('Ok')).toBeInTheDocument();
    expect(screen.getByText('Falha')).toBeInTheDocument();
    expect(screen.getByText('Importando…')).toBeInTheDocument();
    expect(screen.getByText('Na fila')).toBeInTheDocument();
  });

  it('oferece repetir os que falharam quando o job termina com falhas, e chama onTentarFalhas ao clicar', async () => {
    const user = userEvent.setup();
    const onTentarFalhas = vi.fn();
    render(
      <StatusImportacaoDrive
        job={job({ status: 'failed', done_count: 0, failed_count: 4 })}
        erro={null}
        ocupado={false}
        onTentarFalhas={onTentarFalhas}
      />
    );
    const botao = screen.getByRole('button', { name: /tentar de novo os que falharam/i });
    await user.click(botao);
    expect(onTentarFalhas).toHaveBeenCalledTimes(1);
  });

  it('desabilita o botão de repetir enquanto ocupado', () => {
    render(
      <StatusImportacaoDrive
        job={job({ status: 'failed', done_count: 0, failed_count: 4 })}
        erro={null}
        ocupado={true}
        onTentarFalhas={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /tentar de novo os que falharam/i })).toBeDisabled();
  });

  it('não oferece repetir enquanto o job ainda está em andamento, mesmo com falhas parciais', () => {
    render(
      <StatusImportacaoDrive
        job={job({ status: 'running', done_count: 2, failed_count: 1 })}
        erro={null}
        ocupado={false}
        onTentarFalhas={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /tentar de novo os que falharam/i })).not.toBeInTheDocument();
  });
});
