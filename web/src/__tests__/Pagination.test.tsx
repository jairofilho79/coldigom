import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from '../components/Pagination';
import type { PaginationInfo } from '../types';

describe('Pagination Component', () => {
  const mockOnPageChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when totalPages is 1 or less', () => {
    const pagination: PaginationInfo = {
      page: 1,
      limit: 20,
      total: 10,
      totalPages: 1,
    };

    const { container } = render(
      <Pagination pagination={pagination} onPageChange={mockOnPageChange} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('should not render when totalPages is 0', () => {
    const pagination: PaginationInfo = {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    };

    const { container } = render(
      <Pagination pagination={pagination} onPageChange={mockOnPageChange} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('should render pagination buttons for multiple pages', () => {
    const pagination: PaginationInfo = {
      page: 1,
      limit: 20,
      total: 50,
      totalPages: 3,
    };

    render(<Pagination pagination={pagination} onPageChange={mockOnPageChange} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it('should disable previous button on first page', () => {
    const pagination: PaginationInfo = {
      page: 1,
      limit: 20,
      total: 50,
      totalPages: 3,
    };

    render(<Pagination pagination={pagination} onPageChange={mockOnPageChange} />);

    const prevButton = screen.getByLabelText(/página anterior/i);
    expect(prevButton).toBeDisabled();
  });

  it('should disable next button on last page', () => {
    const pagination: PaginationInfo = {
      page: 3,
      limit: 20,
      total: 50,
      totalPages: 3,
    };

    render(<Pagination pagination={pagination} onPageChange={mockOnPageChange} />);

    const nextButton = screen.getByLabelText(/próxima página/i);
    expect(nextButton).toBeDisabled();
  });

  it('should call onPageChange with previous page number', () => {
    const pagination: PaginationInfo = {
      page: 2,
      limit: 20,
      total: 50,
      totalPages: 3,
    };

    render(<Pagination pagination={pagination} onPageChange={mockOnPageChange} />);

    const prevButton = screen.getByLabelText(/página anterior/i);
    fireEvent.click(prevButton);

    expect(mockOnPageChange).toHaveBeenCalledWith(1);
  });

  it('should call onPageChange with next page number', () => {
    const pagination: PaginationInfo = {
      page: 2,
      limit: 20,
      total: 50,
      totalPages: 3,
    };

    render(<Pagination pagination={pagination} onPageChange={mockOnPageChange} />);

    const nextButton = screen.getByLabelText(/próxima página/i);
    fireEvent.click(nextButton);

    expect(mockOnPageChange).toHaveBeenCalledWith(3);
  });

  it('should call onPageChange with specific page number', () => {
    const pagination: PaginationInfo = {
      page: 2,
      limit: 20,
      total: 100,
      totalPages: 5,
    };

    render(<Pagination pagination={pagination} onPageChange={mockOnPageChange} />);

    const pageButton = screen.getByLabelText('Página 3');
    fireEvent.click(pageButton);

    expect(mockOnPageChange).toHaveBeenCalledWith(3);
  });

  it('should mark current page as active', () => {
    const pagination: PaginationInfo = {
      page: 2,
      limit: 20,
      total: 50,
      totalPages: 3,
    };

    render(<Pagination pagination={pagination} onPageChange={mockOnPageChange} />);

    const activeButton = screen.getByLabelText('Página 2');
    expect(activeButton).toHaveClass('active');
  });

  it('should show ellipsis for large page ranges', () => {
    const pagination: PaginationInfo = {
      page: 5,
      limit: 20,
      total: 200,
      totalPages: 10,
    };

    render(<Pagination pagination={pagination} onPageChange={mockOnPageChange} />);

    const ellipsis = screen.getAllByText('…');
    expect(ellipsis.length).toBeGreaterThan(0);
  });
});
