import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import './Drawer.css';

export const Drawer = ({
  open,
  onClose,
  title,
  description,
  children,
  side = 'right',
  size = 'md',
  showClose = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = '',
  footer,
}) => {
  const handleKeyDown = useCallback((e) => {
    if (!closeOnEscape) return;
    if (e.key === 'Escape') onClose?.();
  }, [closeOnEscape, onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  const handleBackdropClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose?.();
    }
  };

  const sideClass = `hey-drawer--${side}`;
  const sizeClass = `hey-drawer--${size}`;

  return (
    <AnimatePresence>
      {open && (
        <div className={`hey-drawer-backdrop ${sideClass}`} onClick={handleBackdropClick} aria-hidden="true">
          <motion.aside
            className={`hey-drawer ${sideClass} ${sizeClass} ${className}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'hey-drawer-title' : undefined}
            aria-describedby={description ? 'hey-drawer-description' : undefined}
            initial={{ x: side === 'right' ? '100%' : side === 'left' ? '-100%' : 0, y: side === 'bottom' ? '100%' : side === 'top' ? '-100%' : 0 }}
            animate={{ x: 0, y: 0 }}
            exit={{ x: side === 'right' ? '100%' : side === 'left' ? '-100%' : 0, y: side === 'bottom' ? '100%' : side === 'top' ? '-100%' : 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {(title || showClose) && (
              <div className="hey-drawer__header">
                {title && (
                  <div>
                    <h2 id="hey-drawer-title" className="hey-drawer__title">{title}</h2>
                    {description && <p id="hey-drawer-description" className="hey-drawer__description">{description}</p>}
                  </div>
                )}
                {showClose && (
                  <button
                    type="button"
                    className="hey-drawer__close"
                    onClick={onClose}
                    aria-label="Close drawer"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            )}
            <div className="hey-drawer__content">{children}</div>
            {footer && <div className="hey-drawer__footer">{footer}</div>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};

Drawer.displayName = 'Drawer';