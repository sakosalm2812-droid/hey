import { forwardRef, useId } from 'react';
import './Input.css';

export const TextInput = forwardRef((
  {
    label,
    placeholder,
    value,
    onChange,
    type = 'text',
    disabled = false,
    readOnly = false,
    required = false,
    error,
    success = false,
    helperText,
    leftIcon,
    rightIcon,
    leftElement,
    rightElement,
    className = '',
    id,
    name,
    autoComplete,
    inputMode,
    pattern,
    minLength,
    maxLength,
    min,
    max,
    step,
    onBlur,
    onFocus,
    onKeyDown,
    ...props
  },
  ref
) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helperText && !error ? `${inputId}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`hey-input-wrapper ${className} ${disabled ? 'hey-input-wrapper--disabled' : ''} ${error ? 'hey-input-wrapper--error' : ''} ${success && !error ? 'hey-input-wrapper--success' : ''}`}>
      {label && (
        <label htmlFor={inputId} className="hey-input__label">
          {label}
          {required && <span className="hey-input__required" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="hey-input__container">
        {leftIcon && <span className="hey-input__icon hey-input__icon--left" aria-hidden="true">{leftIcon}</span>}
        {leftElement && <span className="hey-input__element hey-input__element--left">{leftElement}</span>}
        <input
          ref={ref}
          id={inputId}
          name={name}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          autoComplete={autoComplete}
          inputMode={inputMode}
          pattern={pattern}
          minLength={minLength}
          maxLength={maxLength}
          min={min}
          max={max}
          step={step}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          className="hey-input"
          {...props}
        />
        {rightElement && <span className="hey-input__element hey-input__element--right">{rightElement}</span>}
        {rightIcon && <span className="hey-input__icon hey-input__icon--right" aria-hidden="true">{rightIcon}</span>}
        {error && <span className="hey-input__error-indicator" aria-hidden="true">!</span>}
        {success && !error && <span className="hey-input__success-indicator" aria-hidden="true">✓</span>}
      </div>
      {error && (
        <p id={errorId} className="hey-input__error" role="alert">{error}</p>
      )}
      {helperText && !error && (
        <p id={helperId} className="hey-input__helper">{helperText}</p>
      )}
    </div>
  );
});

TextInput.displayName = 'TextInput';

export const Textarea = forwardRef((
  {
    label,
    placeholder,
    value,
    onChange,
    disabled = false,
    readOnly = false,
    required = false,
    error,
    success = false,
    helperText,
    rows = 4,
    resize = 'vertical',
    className = '',
    id,
    name,
    autoComplete,
    onBlur,
    onFocus,
    onKeyDown,
    ...props
  },
  ref
) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helperText && !error ? `${inputId}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`hey-input-wrapper hey-input-wrapper--textarea ${className} ${disabled ? 'hey-input-wrapper--disabled' : ''} ${error ? 'hey-input-wrapper--error' : ''} ${success && !error ? 'hey-input-wrapper--success' : ''}`}>
      {label && (
        <label htmlFor={inputId} className="hey-input__label">
          {label}
          {required && <span className="hey-input__required" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="hey-input__container hey-input__container--textarea">
        <textarea
          ref={ref}
          id={inputId}
          name={name}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          autoComplete={autoComplete}
          rows={rows}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          className="hey-textarea"
          style={{ resize }}
          {...props}
        />
        {error && <span className="hey-input__error-indicator" aria-hidden="true">!</span>}
        {success && !error && <span className="hey-input__success-indicator" aria-hidden="true">✓</span>}
      </div>
      {error && (
        <p id={errorId} className="hey-input__error" role="alert">{error}</p>
      )}
      {helperText && !error && (
        <p id={helperId} className="hey-input__helper">{helperText}</p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';

export const PromptInput = ({ value, onChange, onSubmit, disabled = false, loading = false, placeholder = 'Ask HEY…', className = '', autoFocus = false, maxHeight = 220, ...props }) => {
  const textareaRef = useRef(null);
  const [height, setHeight] = useState(48);

  useEffect(() => {
    if (textareaRef.current) {
      const minHeight = 48;
      const newHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
      setHeight(Math.max(minHeight, newHeight));
    }
  }, [value, maxHeight]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.(value);
    }
  };

  return (
    <div className={`hey-prompt-input ${className} ${disabled ? 'hey-prompt-input--disabled' : ''} ${loading ? 'hey-prompt-input--loading' : ''}`}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || loading}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="hey-prompt-input__textarea"
        style={{ height: `${height}px`, minHeight: '48px', maxHeight: `${maxHeight}px` }}
        aria-label="Prompt input"
        aria-busy={loading}
        {...props}
      />
      <div className="hey-prompt-input__actions">
        <button
          type="button"
          className="hey-prompt-input__action"
          onClick={() => onSubmit?.(value)}
          disabled={!value.trim() || disabled || loading}
          aria-label="Send"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

import { useRef, useState, useEffect } from 'react';