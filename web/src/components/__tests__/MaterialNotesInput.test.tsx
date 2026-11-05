import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MaterialNotesInput } from '../MaterialNotesInput';

describe('MaterialNotesInput', () => {
  it('não salva espaços adicionais quando a nota não mudou', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<MaterialNotesInput value="Soprano" onSave={onSave} />);
    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.type(input, ' ');
    await user.tab();
    expect(onSave).not.toHaveBeenCalled();
    expect(input).toHaveValue('Soprano');
  });

  it('salva uma nota vazia como null ao pressionar Enter', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<MaterialNotesInput value="Soprano" onSave={onSave} />);
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '  {Enter}');
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
  });

  it('Escape cancela a edição sem salvar', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<MaterialNotesInput value="Soprano" onSave={onSave} />);
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Alto{Escape}');
    expect(input).toHaveValue('Soprano');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('restaura a nota quando o salvamento falha e permite nova tentativa', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValueOnce(new Error('falha')).mockResolvedValueOnce(undefined);
    render(<MaterialNotesInput value="Soprano" onSave={onSave} />);
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Alto{Enter}');
    await waitFor(() => expect(input).toHaveValue('Soprano'));
    await user.clear(input);
    await user.type(input, '  Alto  {Enter}');
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith('Alto'));
  });

  it('não submete Enter durante composição IME e acompanha valor externo', () => {
    const onSave = vi.fn();
    const { rerender } = render(<MaterialNotesInput value={null} onSave={onSave} disabled />);
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    rerender(<MaterialNotesInput value="Tenor" onSave={onSave} />);
    expect(input).toHaveValue('Tenor');
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true });
    expect(input).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });
});
