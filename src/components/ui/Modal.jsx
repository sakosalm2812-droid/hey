import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import './Modal.css';

export const Modal = ({
  open,
  onClose,
  title,
  description,
  children,
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

  return (
    <AnimatePresence>
      {open && (
        <div className="hey-modal-backdrop" onClick={handleBackdropClick} aria-hidden="true">
          <motion.div
            className={`hey-modal hey-modal--${size} ${className}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'hey-modal-title' : undefined}
            aria-describedby={description ? 'hey-modal-description' : undefined}
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 16 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {(title || showClose) && (
              <div className="hey-modal__header">
                {title && (
                  <div>
                    <h2 id="hey-modal-title" className="hey-modal__title">{title}</h2>
                    {description && <p id="hey-modal-description" className="hey-modal__description">{description}</p>}
                  </div>
                )}
                {showClose && (
                  <button
                    type="button"
                    className="hey-modal__close"
                    onClick={onClose}
                    aria-label="Close modal"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            )}
            <div className="hey-modal__content">{children}</div>
            {footer && <div className="hey-modal__footer">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

Modal.displayName = 'Modal';

export const AlertModal = ({
  open,
  onClose,
  title,
  message,
  variant = 'info',
  confirmLabel = 'OK',
  cancelLabel,
  onConfirm,
  onCancel,
  loading = false,
  className = '',
}) => {
  const iconMap = {
    info: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    ),
    success: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    warning: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    destructive: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      className={className}
      footer={
        <div className="hey-modal__footer-actions">
          {cancelLabel && (
            <button
              type="button"
              className="hey-button hey-button--ghost hey-button--md"
              onClick={() => { onCancel?.(); onClose?.(); }}
              disabled={loading}
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={`hey-button hey-button--md ${variant === 'destructive' ? 'hey-button--destructive' : 'hey-button--primary'}`}
            onClick={() => { onConfirm?.(); onClose?.(); }}
            disabled={loading}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      }
    >
      <div className={`hey-alert-modal hey-alert-modal--${variant}`}>
        <div className="hey-alert-modal__icon" aria-hidden="true">{iconMap[variant]}</div>
        <p className="hey-alert-modal__message">{message}</p>
      </div>
    </Modal>
  );
};

AlertModal.displayName = 'AlertModal';

export const ConfirmModal = ({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'primary',
  loading = false,
  className = '',
}) => {
  return (
    <AlertModal
      open={open}
      onClose={onClose}
      title={title}
      message={message}
      variant={variant}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      onConfirm={onConfirm}
      onCancel={onCancel}
      loading={loading}
      className={className}
    />
  );
};

ConfirmModal.displayName = 'ConfirmModal';