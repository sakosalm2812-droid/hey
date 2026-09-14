import { useId, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import './Select.css';

export const Select = ({
  label,
  placeholder,
  value,
  onChange,
  options = [],
  disabled = false,
  required = false,
  error,
  helperText,
  searchable = false,
  multiple = false,
  className = '',
  id,
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;
  const errorId = error ? `${selectId}-error` : undefined;
  const helperId = helperText && !error ? `${selectId}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearchValue('');
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  const filteredOptions = searchable
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(searchValue.toLowerCase()) ||
        (opt.value && opt.value.toLowerCase().includes(searchValue.toLowerCase()))
      )
    : options;

  const selectedOption = options.find(opt => opt.value === value);
  const displayValue = multiple
    ? options.filter(opt => value?.includes(opt.value)).map(opt => opt.label).join(', ')
    : selectedOption?.label || placeholder;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setSearchValue('');
    } else if (e.key === 'ArrowDown' && !open) {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div ref={containerRef} className={`hey-select ${className} ${disabled ? 'hey-select--disabled' : ''} ${error ? 'hey-select--error' : ''} ${open ? 'hey-select--open' : ''}`}>
      {label && (
        <label htmlFor={selectId} className="hey-select__label">
          {label}
          {required && <span className="hey-select__required" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="hey-select__container">
        <button
          ref={containerRef}
          type="button"
          id={selectId}
          className="hey-select__trigger"
          onClick={() => !disabled && setOpen(!open)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : 'false'}
          tabIndex={disabled ? -1 : 0}
        >
          <span className={`hey-select__value ${!value ? 'hey-select__value--placeholder' : ''}`}>
            {displayValue || placeholder}
          </span>
          <ChevronDown
            size={16}
            className={`hey-select__chevron ${open ? 'hey-select__chevron--open' : ''}`}
            aria-hidden="true"
          />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              className="hey-select__menu"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              role="listbox"
              aria-label={label || 'Select options'}
            >
              {searchable && (
                <div className="hey-select__search">
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Search…"
                    className="hey-select__search-input"
                    autoFocus
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              )}

              <div className="hey-select__options" role="presentation">
                {filteredOptions.length === 0 ? (
                  <div className="hey-select__empty">No options found</div>
                ) : (
                  filteredOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      className={`hey-select__option ${value === option.value || (multiple && value?.includes(option.value)) ? 'hey-select__option--selected' : ''} ${option.disabled ? 'hey-select__option--disabled' : ''}`}
                      onClick={() => {
                        if (option.disabled) return;
                        if (multiple) {
                          const newValue = value?.includes(option.value)
                            ? value.filter(v => v !== option.value)
                            : [...(value || []), option.value];
                          onChange?.(newValue);
                        } else {
                          onChange?.(option.value);
                          setOpen(false);
                        }
                      }}
                      disabled={option.disabled}
                      aria-selected={value === option.value || (multiple && value?.includes(option.value))}
                      aria-disabled={option.disabled}
                    >
                      <span className="hey-select__option-label">{option.label}</span>
                      {(value === option.value || (multiple && value?.includes(option.value))) && (
                        <Check size={14} className="hey-select__option-check" aria-hidden="true" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {error && (
        <p id={errorId} className="hey-select__error" role="alert">{error}</p>
      )}
      {helperText && !error && (
        <p id={helperId} className="hey-select__helper">{helperText}</p>
      )}
    </div>
  );
}

Select.displayName = 'Select';