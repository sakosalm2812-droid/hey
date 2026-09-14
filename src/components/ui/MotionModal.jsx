/**
 * HEY V1 — Motion Modal Component
 * Implements Section 7: Modal / Drawer / Sheet Motion
 */

import { useEffect, useRef, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion, sharedTransitions, useInterruptibleAnimation } from '../../lib/motion';
import '../../styles/motion.css';

const MotionModal = forwardRef(({
  open = false,
  onClose,
  title,
  description,
  children,
  size = 'medium',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = '',
  'aria-labelledby': ariaLabelledby,
  'aria-describedby': ariaDescribedby,
  ...props
}, ref) => {
  const reduced = useReducedMotion();
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const previousActiveElement = useRef(null);
  const { startAnimation, interrupt } = useInterruptibleAnimation();

  // Focus management
  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement;
      document.body.style.overflow = 'hidden';
      // Focus first focusable element
      setTimeout(() => {
        panelRef.current?.focus();
      }, reduced ? 0 : 160);
    } else {
      document.body.style.overflow = '';
      previousActiveElement.current?.focus();
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, reduced]);

  // Escape key
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, closeOnEscape, onClose]);

  // Trap focus
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusableElements = panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    panel.addEventListener('keydown', handleTab);
    return () => panel.removeEventListener('keydown', handleTab);
  }, [open]);

  if (!open) return null;

  const modalContent = (
    <div
      ref={overlayRef}
      className="hey-modal-overlay"
      onClick={closeOnOverlayClick ? onClose : undefined}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={`hey-modal-panel hey-modal-${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledby || (title ? 'hey-modal-title' : undefined)}
        aria-describedby={ariaDescribedby || (description ? 'hey-modal-description' : undefined)}
        tabIndex={-1}
        {...props}
      >
        {(title || description) && (
          <header className="hey-modal-header">
            {title && (
              <h2 id="hey-modal-title" className="hey-modal-title">{title}</h2>
            )}
            {description && (
              <p id="hey-modal-description" className="hey-modal-description">{description}</p>
            )}
            <button
              className="hey-modal-close"
              onClick={onClose}
              aria-label="Close modal"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>
        )}
        <div className="hey-modal-content">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
});

MotionModal.displayName = 'MotionModal';

export default MotionModal;