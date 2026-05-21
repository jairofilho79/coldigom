import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchableSelect } from '../SearchableSelect';

const options = [
  { value: '1', label: 'Partitura' },
  { value: '2', label: 'Áudio' },
  { value: '3', label: 'MIDI' },
  { value: '4', label: 'Cifra' },
];

describe('SearchableSelect', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters options by search query', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        aria-label="Categoria"
        value="1"
        onChange={onChange}
        options={options}
      />
    );

    await user.click(screen.getByLabelText('Categoria'));
    const search = screen.getByPlaceholderText('Buscar…');
    await user.type(search, 'midi');
    expect(screen.getByRole('option', { name: 'MIDI' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Partitura' })).toBeNull();
  });

  it('shows empty message when no match', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        aria-label="Categoria"
        value="1"
        onChange={onChange}
        options={options}
      />
    );

    await user.click(screen.getByLabelText('Categoria'));
    await user.type(screen.getByPlaceholderText('Buscar…'), 'xyz');
    expect(screen.getByText('Nenhum resultado')).toBeTruthy();
  });

  it('selects option and closes panel', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        aria-label="Categoria"
        value="1"
        onChange={onChange}
        options={options}
      />
    );

    await user.click(screen.getByLabelText('Categoria'));
    await user.click(screen.getByRole('option', { name: 'Áudio' }));
    expect(onChange).toHaveBeenCalledWith('2');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
