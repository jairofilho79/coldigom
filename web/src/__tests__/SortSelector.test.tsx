import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

    const select = screen.getByLabelText(/ordenar por/i);
    expect(select).toHaveValue('number');
  });

  it('should render all sort options', () => {
    render(
      <SortSelector sort="number" order="asc" onChange={mockOnChange} />
    );

    expect(screen.getByText('Número')).toBeTruthy();
    expect(screen.getByText('Nome')).toBeTruthy();
    expect(screen.getByText('Ritmo')).toBeTruthy();
    expect(screen.getByText('Tom')).toBeTruthy();
    expect(screen.getByText('Categoria')).toBeTruthy();
    expect(screen.getByText('Autor')).toBeTruthy();
  });

  it('should call onChange when sort selection changes', () => {
    render(
      <SortSelector sort="number" order="asc" onChange={mockOnChange} />
    );

    const select = screen.getByLabelText(/ordenar por/i);
    fireEvent.change(select, { target: { value: 'name' } });

    expect(mockOnChange).toHaveBeenCalledWith('name', 'asc');
  });

  it('should toggle order when same sort is selected', () => {
    render(
      <SortSelector sort="number" order="asc" onChange={mockOnChange} />
    );

    const select = screen.getByLabelText(/ordenar por/i);
    fireEvent.change(select, { target: { value: 'number' } });

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
