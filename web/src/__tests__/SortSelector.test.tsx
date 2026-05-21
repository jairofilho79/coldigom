import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SortSelector } from '../components/SortSelector';

describe('SortSelector Component', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render with current sort value', () => {
    render(
      <SortSelector sort="number" order="asc" onChange={mockOnChange} />
    );

    expect(screen.getByLabelText(/ordenar por/i)).toHaveTextContent('Número');
  });

  it('should render all sort options', async () => {
    const user = userEvent.setup();
    render(
      <SortSelector sort="number" order="asc" onChange={mockOnChange} />
    );

    await user.click(screen.getByLabelText(/ordenar por/i));
    expect(screen.getByRole('option', { name: 'Número' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Nome' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Ritmo' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Tom' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Categoria' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Autor' })).toBeTruthy();
  });

  it('should call onChange when sort selection changes', async () => {
    const user = userEvent.setup();
    render(
      <SortSelector sort="number" order="asc" onChange={mockOnChange} />
    );

    await user.click(screen.getByLabelText(/ordenar por/i));
    await user.click(screen.getByRole('option', { name: 'Nome' }));

    expect(mockOnChange).toHaveBeenCalledWith('name', 'asc');
  });

  it('should toggle order when same sort is selected', async () => {
    const user = userEvent.setup();
    render(
      <SortSelector sort="number" order="asc" onChange={mockOnChange} />
    );

    await user.click(screen.getByLabelText(/ordenar por/i));
    await user.click(screen.getByRole('option', { name: 'Número' }));

    expect(mockOnChange).toHaveBeenCalledWith('number', 'desc');
  });

  it('should show ascending arrow when order is asc', () => {
    render(
      <SortSelector sort="number" order="asc" onChange={mockOnChange} />
    );

    const orderButton = screen.getByLabelText(/ordenar decrescente/i);
    expect(orderButton).toHaveTextContent('↑');
  });

  it('should show descending arrow when order is desc', () => {
    render(
      <SortSelector sort="number" order="desc" onChange={mockOnChange} />
    );

    const orderButton = screen.getByLabelText(/ordenar crescente/i);
    expect(orderButton).toHaveTextContent('↓');
  });

  it('should call onChange when order button is clicked', () => {
    render(
      <SortSelector sort="name" order="asc" onChange={mockOnChange} />
    );

    const orderButton = screen.getByLabelText(/ordenar decrescente/i);
    fireEvent.click(orderButton);

    expect(mockOnChange).toHaveBeenCalledWith('name', 'desc');
  });

  it('should toggle to asc when order is desc', () => {
    render(
      <SortSelector sort="name" order="desc" onChange={mockOnChange} />
    );

    const orderButton = screen.getByLabelText(/ordenar crescente/i);
    fireEvent.click(orderButton);

    expect(mockOnChange).toHaveBeenCalledWith('name', 'asc');
  });

  it('should have correct title for ascending order', () => {
    render(
      <SortSelector sort="number" order="asc" onChange={mockOnChange} />
    );

    const orderButton = screen.getByTitle('Crescente');
    expect(orderButton).toBeTruthy();
  });

  it('should have correct title for descending order', () => {
    render(
      <SortSelector sort="number" order="desc" onChange={mockOnChange} />
    );

    const orderButton = screen.getByTitle('Decrescente');
    expect(orderButton).toBeTruthy();
  });
});
