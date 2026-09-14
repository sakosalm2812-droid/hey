import { forwardRef, useId } from 'react';
import './Toggle.css';

export const Toggle = forwardRef((
  {
    label,
    description,
    checked,
    onChange,
    disabled = false,
    required = false,
    error,
    size = 'md',
    className = '',
    id,
    name,
    ...props
  },
  ref
) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const describedBy = description ? `${inputId}-desc` : undefined;

  return (
    <label className={`hey-toggle ${className} ${disabled ? 'hey-toggle--disabled' : ''} ${error ? 'hey-toggle--error' : ''}`}>
      <input
        ref={ref}
        type="checkbox"
        id={inputId}
        name={name}
        checked={checked}
        onChange={(e) => !disabled && onChange?.(e.target.checked)}
        disabled={disabled}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={error ? 'true' : 'false'}
        className="hey-toggle__input"
        {...props}
      />
      <span className={`hey-toggle__track hey-toggle__track--${size}`}>
        <span className={`hey-toggle__thumb hey-toggle__thumb--${size}`} aria-hidden="true" />
      </span>
      {(label || description) && (
        <div className="hey-toggle__content">
          {label && <span className="hey-toggle__label">{label}</span>}
          {description && <span id={describedBy} className="hey-toggle__description">{description}</span>}
        </div>
      )}
      {error && <span className="hey-toggle__error" role="alert">{error}</span>}
    </label>
  );
});

Toggle.displayName = 'Toggle';

export const Checkbox = forwardRef((
  {
    label,
    description,
    checked,
    onChange,
    disabled = false,
    required = false,
    error,
    indeterminate = false,
    className = '',
    id,
    name,
    ...props
  },
  ref
) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const describedBy = description ? `${inputId}-desc` : undefined;

  return (
    <label className={`hey-checkbox ${className} ${disabled ? 'hey-checkbox--disabled' : ''} ${error ? 'hey-checkbox--error' : ''}`}>
      <input
        ref={ref}
        type="checkbox"
        id={inputId}
        name={name}
        checked={checked}
        onChange={(e) => !disabled && onChange?.(e.target.checked)}
        disabled={disabled}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={error ? 'true' : 'false'}
        className="hey-checkbox__input"
        {...props}
      />
      <span className="hey-checkbox__box" aria-hidden="true">
        {indeterminate ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        ) : checked ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : null}
      </span>
      {(label || description) && (
        <div className="hey-checkbox__content">
          {label && <span className="hey-checkbox__label">{label}</span>}
          {description && <span id={describedBy} className="hey-checkbox__description">{description}</span>}
        </div>
      )}
      {error && <span className="hey-checkbox__error" role="alert">{error}</span>}
    </label>
  );
});

Checkbox.displayName = 'Checkbox';

export const Radio = forwardRef((
  {
    label,
    description,
    value,
    checked,
    onChange,
    disabled = false,
    required = false,
    error,
    className = '',
    id,
    name,
    ...props
  },
  ref
) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const describedBy = description ? `${inputId}-desc` : undefined;

  return (
    <label className={`hey-radio ${className} ${disabled ? 'hey-radio--disabled' : ''} ${error ? 'hey-radio--error' : ''}`}>
      <input
        ref={ref}
        type="radio"
        id={inputId}
        name={name}
        value={value}
        checked={checked}
        onChange={(e) => !disabled && onChange?.(e.target.value)}
        disabled={disabled}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={error ? 'true' : 'false'}
        className="hey-radio__input"
        {...props}
      />
      <span className="hey-radio__dot" aria-hidden="true">
        <span className="hey-radio__inner" />
      </span>
      {(label || description) && (
        <div className="hey-radio__content">
          {label && <span className="hey-radio__label">{label}</span>}
          {description && <span id={describedBy} className="hey-radio__description">{description}</span>}
        </div>
      )}
      {error && <span className="hey-radio__error" role="alert">{error}</span>}
    </label>
  );
});

Radio.displayName = 'Radio';

export const RadioGroup = ({ label, options, value, onChange, disabled = false, required = false, error, className = '', name, direction = 'vertical', ...props }) => {
  return (
    <fieldset className={`hey-radio-group ${className}`} disabled={disabled} aria-invalid={error ? 'true' : 'false'}>
      {label && <legend className="hey-radio-group__legend">{label}</legend>}
      <div className={`hey-radio-group__options hey-radio-group__options--${direction}`}>
        {options.map((option) => (
          <Radio
            key={option.value}
            label={option.label}
            description={option.description}
            value={option.value}
            checked={value === option.value}
            onChange={onChange}
            disabled={disabled || option.disabled}
            required={required}
            error={error}
            name={name}
            {...props}
          />
        ))}
      </div>
      {error && <span className="hey-radio-group__error" role="alert">{error}</span>}
    </fieldset>
  );
};

RadioGroup.displayName = 'RadioGroup';