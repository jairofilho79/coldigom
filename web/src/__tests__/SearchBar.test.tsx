import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from '../components/SearchBar';

describe('SearchBar Component', () => {
  const mockOnSearch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render with initial value', () => {
    render(<SearchBar onSearch={mockOnSearch} initialValue="test query" />);
    
    const input = screen.getByPlaceholderText(/buscar por nome, letra, autor/i);
    expect(input).toHaveValue('test query');
  });

  it('should render empty when no initial value', () => {
    render(<SearchBar onSearch={mockOnSearch} />);
    
    const input = screen.getByPlaceholderText(/buscar por nome, letra, autor/i);
    expect(input).toHaveValue('');
  });

  it('should update internal value on change', () => {
    render(<SearchBar onSearch={mockOnSearch} />);
    
    const input = screen.getByPlaceholderText(/buscar por nome, letra, autor/i);
    fireEvent.change(input, { target: { value: 'new search' } });
    
    expect(input).toHaveValue('new search');
  });

  it('should call onSearch with query on form submit', () => {
    render(<SearchBar onSearch={mockOnSearch} />);
    
    const input = screen.getByPlaceholderText(/buscar por nome, letra, autor/i);
    fireEvent.change(input, { target: { value: 'test query' } });
    
    const form = input.closest('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
    
    expect(mockOnSearch).toHaveBeenCalledWith('test query');
  });

  it('should clear input and call onSearch with empty string on clear', () => {
    render(<SearchBar onSearch={mockOnSearch} initialValue="test" />);
    
    const clearButton = screen.getByLabelText(/limpar busca/i);
    fireEvent.click(clearButton);
    
    expect(mockOnSearch).toHaveBeenCalledWith('');
  });

  it('should not show clear button when input is empty', () => {
    render(<SearchBar onSearch={mockOnSearch} />);
    
    const clearButton = screen.queryByLabelText(/limpar busca/i);
    expect(clearButton).toBeNull();
  });

  it('should show clear button when input has value', () => {
    render(<SearchBar onSearch={mockOnSearch} initialValue="test" />);
    
    const clearButton = screen.getByLabelText(/limpar busca/i);
    expect(clearButton).toBeTruthy();
  });

  it('should not call onSearch when pressing Enter without changes', () => {
    render(<SearchBar onSearch={mockOnSearch} initialValue="initial" />);
    
    const input = screen.getByPlaceholderText(/buscar por nome, letra, autor/i);
    fireEvent.submit(input.closest('form')!);
    
    expect(mockOnSearch).toHaveBeenCalledWith('initial');
  });
});
