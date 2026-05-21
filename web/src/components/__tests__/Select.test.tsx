import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from '../Select';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma', disabled: true },
];

describe('Select', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows selected label on trigger', () => {
    render(
      <Select
        label="Teste"
        value="b"
        onChange={onChange}
        options={options}
      />
    );
    expect(screen.getByLabelText('Teste')).toHaveTextContent('Beta');
  });

  it('shows placeholder when value is empty', () => {
    render(
      <Select
        aria-label="Escolher"
        value=""
        onChange={onChange}
        options={options}
        placeholder="Selecione…"
      />
    );
    expect(screen.getByLabelText('Escolher')).toHaveTextContent('Selecione…');
  });

  it('opens listbox and calls onChange when option is chosen', async () => {
    const user = userEvent.setup();
    render(
      <Select
        aria-label="Escolher"
        value="a"
        onChange={onChange}
        options={options}
      />
    );

    await user.click(screen.getByLabelText('Escolher'));
    expect(screen.getByRole('listbox')).toBeTruthy();
    await user.click(screen.getByRole('option', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    render(
      <Select
        aria-label="Escolher"
        value="a"
        onChange={onChange}
        options={options}
        disabled
      />
    );

    await user.click(screen.getByLabelText('Escolher'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
