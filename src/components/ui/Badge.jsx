import { forwardRef } from 'react';
import './Badge.css';

export const Badge = forwardRef((
  {
    children,
    variant = 'default',
    size = 'md',
    dot = false,
    dotColor,
    removable = false,
    onRemove,
    className = '',
    ...props
  },
  ref
) => {
  const classNames = [
    'hey-badge',
    `hey-badge--${variant}`,
    `hey-badge--${size}`,
    dot && 'hey-badge--dot',
    removable && 'hey-badge--removable',
    className,
  ].filter(Boolean).join(' ');

  return (
    <span ref={ref} className={classNames} {...props}>
      {dot && <span className="hey-badge__dot" style={{ background: dotColor }} aria-hidden="true" />}
      <span className="hey-badge__text">{children}</span>
      {removable && (
        <button
          type="button"
          className="hey-badge__remove"
          onClick={onRemove}
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </span>
  );
});

Badge.displayName = 'Badge';

export const Chip = forwardRef((
  {
    children,
    variant = 'default',
    size = 'md',
    selected = false,
    disabled = false,
    onClick,
    leftIcon,
    rightIcon,
    className = '',
    ...props
  },
  ref
) => {
  const classNames = [
    'hey-chip',
    `hey-chip--${variant}`,
    `hey-chip--${size}`,
    selected && 'hey-chip--selected',
    disabled && 'hey-chip--disabled',
    onClick && !disabled && 'hey-chip--clickable',
    className,
  ].filter(Boolean).join(' ');

  const Component = onClick && !disabled ? 'button' : 'span';

  return (
    <Component
      ref={ref}
      className={classNames}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {leftIcon && <span className="hey-chip__icon hey-chip__icon--left" aria-hidden="true">{leftIcon}</span>}
      <span className="hey-chip__text">{children}</span>
      {rightIcon && <span className="hey-chip__icon hey-chip__icon--right" aria-hidden="true">{rightIcon}</span>}
    </Component>
  );
});

Chip.displayName = 'Chip';