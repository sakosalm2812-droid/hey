import { forwardRef } from 'react';
import './Button.css';

export const Button = forwardRef((
  {
    children,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    onClick,
    type = 'button',
    className = '',
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    ...props
  },
  ref
) => {
  const classNames = [
    'hey-button',
    `hey-button--${variant}`,
    `hey-button--${size}`,
    fullWidth && 'hey-button--full',
    disabled && 'hey-button--disabled',
    loading && 'hey-button--loading',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classNames}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-busy={loading}
      onClick={onClick}
      {...props}
    >
      {loading && <span className="hey-button__spinner" aria-hidden="true" />}
      {!loading && leftIcon && <span className="hey-button__icon hey-button__icon--left" aria-hidden="true">{leftIcon}</span>}
      <span className="hey-button__text">{children}</span>
      {!loading && rightIcon && <span className="hey-button__icon hey-button__icon--right" aria-hidden="true">{rightIcon}</span>}
    </button>
  );
});

Button.displayName = 'Button';

export const IconButton = forwardRef((
  {
    children,
    variant = 'ghost',
    size = 'md',
    disabled = false,
    loading = false,
    onClick,
    'aria-label': ariaLabel,
    className = '',
    ...props
  },
  ref
) => {
  const classNames = [
    'hey-icon-button',
    `hey-icon-button--${variant}`,
    `hey-icon-button--${size}`,
    disabled && 'hey-icon-button--disabled',
    loading && 'hey-icon-button--loading',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type="button"
      className={classNames}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading}
      onClick={onClick}
      {...props}
    >
      {loading ? <span className="hey-icon-button__spinner" aria-hidden="true" /> : children}
    </button>
  );
});

IconButton.displayName = 'IconButton';

export const SplitButton = ({ primaryLabel, primaryOnClick, items, variant = 'primary', size = 'md', disabled = false, className = '' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  return (
    <div className={`hey-split-button ${className}`} ref={ref}>
      <Button variant={variant} size={size} disabled={disabled} onClick={primaryOnClick}>
        {primaryLabel}
      </Button>
      <IconButton
        variant={variant}
        size={size}
        disabled={disabled}
        aria-label="More options"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <ChevronDown size={14} />
      </IconButton>
      {open && (
        <motion.div
          className="hey-split-button__menu"
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          role="menu"
        >
          {items.map((item, i) => (
            <button
              key={i}
              role="menuitem"
              className="hey-split-button__item"
              onClick={() => { item.onClick?.(); setOpen(false); }}
              disabled={item.disabled}
            >
              {item.icon && <span className="hey-split-button__item-icon">{item.icon}</span>}
              <span>{item.label}</span>
              {item.shortcut && <kbd className="hey-split-button__shortcut">{item.shortcut}</kbd>}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
};

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';