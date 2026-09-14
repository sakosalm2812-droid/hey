import { forwardRef, useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import './Table.css';

export const Table = forwardRef((
  {
    columns = [],
    data = [],
    keyField = 'id',
    sortable = false,
    selectable = false,
    onSelectionChange,
    selectedRows = [],
    onRowClick,
    emptyState,
    loading = false,
    striped = true,
    hoverable = true,
    dense = false,
    resizable = false,
    pagination = false,
    pageSize = 20,
    className = '',
    'aria-label': ariaLabel,
    ...props
  },
  _ref
) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);

  const sortedData = useMemo(() => {
    if (!sortable || !sortConfig.key) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig, sortable]);

  const paginatedData = pagination
    ? sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sortedData;

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const handleSort = (key) => {
    if (!sortable) return;
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const isSelected = (row) => selectedRows.some(s => s[keyField] === row[keyField]);
  const isAllSelected = paginatedData.length > 0 && paginatedData.every(row => isSelected(row));
  const isIndeterminate = paginatedData.some(row => isSelected(row)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      onSelectionChange?.([]);
    } else {
      onSelectionChange?.(paginatedData.map(row => row[keyField]));
    }
  };

  const toggleRow = (row) => {
    const newSelection = isSelected(row)
      ? selectedRows.filter(s => s !== row[keyField])
      : [...selectedRows, row[keyField]];
    onSelectionChange?.(newSelection);
  };

  if (loading) {
    return (
      <div className={`hey-table ${className}`} role="table" aria-label={ariaLabel} aria-busy="true">
        <div className="hey-table__skeleton">
          <div className="hey-table__header-skeleton">
            {columns.map((_, i) => <div key={i} className="hey-skeleton hey-skeleton--text" style={{ width: '100%' }} />)}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="hey-table__row-skeleton">
              {columns.map((_, j) => <div key={j} className="hey-skeleton hey-skeleton--text" style={{ width: '100%' }} />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`hey-table ${striped ? 'hey-table--striped' : ''} ${hoverable ? 'hey-table--hoverable' : ''} ${dense ? 'hey-table--dense' : ''} ${className}`} role="table" aria-label={ariaLabel} {...props}>
      <div className="hey-table__container">
        <table className="hey-table__table">
          <thead className="hey-table__head">
            <tr className="hey-table__header-row">
              {selectable && (
                <th className="hey-table__cell hey-table__cell--checkbox" scope="col">
                  <label className="hey-table__select-all">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      indeterminate={isIndeterminate}
                      onChange={toggleSelectAll}
                      className="hey-table__select-input"
                      aria-label="Select all rows"
                    />
                    <span className="hey-table__select-indicator" />
                  </label>
                </th>
              )}
              {columns.map((column, index) => (
                <th
                  key={column.key || index}
                  className={`hey-table__cell hey-table__cell--header ${column.align ? `hey-table__cell--${column.align}` : ''} ${column.sortable && sortable ? 'hey-table__cell--sortable' : ''} ${column.width ? 'hey-table__cell--fixed' : ''}`}
                  scope="col"
                  style={{ width: column.width, minWidth: column.minWidth }}
                  onClick={() => column.sortable && sortable && handleSort(column.key)}
                >
                  <div className="hey-table__header-content">
                    <span>{column.header}</span>
                    {column.sortable && sortable && (
                      <span className="hey-table__sort-icon" aria-hidden="true">
                        {sortConfig.key === column.key ? (
                          sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3">
                            <path d="M7 16l5-5 5 5" />
                            <path d="M7 8l5 5 5-5" />
                          </svg>
                        )}
                      </span>
                    )}
                  </div>
                  {resizable && index < columns.length - 1 && (
                    <div className="hey-table__resize-handle" />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="hey-table__body">
            {paginatedData.length === 0 ? (
              <tr className="hey-table__empty-row">
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="hey-table__empty-cell">
                  {emptyState || (
                    <div className="hey-table__empty-state">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M9 9h6M9 12h6M9 15h4" />
                      </svg>
                      <p>No data available</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => (
                <tr
                  key={row[keyField]}
                  className={`hey-table__row ${isSelected(row) ? 'hey-table__row--selected' : ''}`}
                  onClick={() => onRowClick?.(row)}
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {selectable && (
                    <td className="hey-table__cell hey-table__cell--checkbox">
                      <label className="hey-table__select-row">
                        <input
                          type="checkbox"
                          checked={isSelected(row)}
                          onChange={(e) => { e.stopPropagation(); toggleRow(row); }}
                          className="hey-table__select-input"
                          aria-label={`Select row ${rowIndex + 1}`}
                        />
                        <span className="hey-table__select-indicator" />
                      </label>
                    </td>
                  )}
                  {columns.map((column, colIndex) => (
                    <td
                      key={column.key || colIndex}
                      className={`hey-table__cell ${column.align ? `hey-table__cell--${column.align}` : ''}`}
                      style={{ width: column.width, minWidth: column.minWidth }}
                    >
                      <div className="hey-table__cell-content">
                        {column.render ? column.render(row[column.key], row, rowIndex) : row[column.key]}
                      </div>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="hey-table__pagination">
          <div className="hey-table__pagination-info">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length}
          </div>
          <div className="hey-table__pagination-controls">
            <button
              type="button"
              className="hey-button hey-button--ghost hey-button--sm hey-icon-button hey-icon-button--ghost hey-icon-button--sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              aria-label="First page"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
                <path d="M9 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              className="hey-button hey-button--ghost hey-button--sm hey-icon-button hey-icon-button--ghost hey-icon-button--sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="hey-table__page-indicator" aria-current="page">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="hey-button hey-button--ghost hey-button--sm hey-icon-button hey-icon-button--ghost hey-icon-button--sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="hey-button hey-button--ghost hey-button--sm hey-icon-button hey-icon-button--ghost hey-icon-button--sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              aria-label="Last page"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
                <path d="M15 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

Table.displayName = 'Table';

export const TableColumn = ({ key, header, align, width, minWidth, sortable, render }) => ({
  key,
  header,
  align,
  width,
  minWidth,
  sortable,
  render,
});