/**
 * HEY V1 — Motion Toast Component
 * Implements Section 9: Toast / Notification Motion
 */

import { useEffect, useState, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion, useMotionPreset } from '../../lib/motion';
import '../../styles/motion.css';

interface ToastProps {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onClose?: (id: string) => void;
  action?: { label: string; onClick: () => void };
  grouped?: boolean;
  index?: number;
}

const Toast = ({
  id,
  message,
  type = 'info',
  duration = 5000,
  onClose,
  action,
  grouped = false,
  index = 0,
}) => {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const toastRef = useRef(null);
  const enterPreset = useMotionPreset('fast');
  const exitPreset = useMotionPreset('fast');

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => {
        setVisible(false);
        onClose?.(id);
      }, reduced ? 1 : exitPreset.duration);
    }, duration);
    return () => clearTimeout(timer);
  }, [id, duration, onClose, reduced, exitPreset.duration]);

  const handleClose = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      onClose?.(id);
    }, reduced ? 1 : exitPreset.duration);
  }, [id, onClose, reduced, exitPreset.duration]);

  if (!visible) return null;

  const typeIcons = {
    success: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    error: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    warning: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    info: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  };

  const typeColors = {
    success: 'var(--success)',
    error: 'var(--error)',
    warning: 'var(--warning)',
    info: 'var(--info)',
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 760;

  return createPortal(
    <div
      ref={toastRef}
      className={`hey-toast hey-toast-${type} ${grouped ? 'hey-toast-grouped' : ''} ${exiting ? 'hey-toast-exiting' : ''} ${isMobile ? 'hey-toast-mobile' : 'hey-toast-desktop'}`}
      role="alert"
      aria-live="polite"
      style={{
        '--toast-index': index,
        '--toast-type-color': typeColors[type],
      } as React.CSSProperties}
    >
      <div className="hey-toast-icon" style={{ color: typeColors[type] }}>
        {typeIcons[type]}
      </div>
      <div className="hey-toast-content">
        <p className="hey-toast-message">{message}</p>
      </div>
      {action && (
        <button className="hey-toast-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      <button className="hey-toast-close" onClick={handleClose} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      {type === 'success' && (
        <div className="hey-toast-success-pop" aria-hidden="true" />
      )}
    </div>,
    document.body
  );
};

Toast.displayName = 'Toast';

// Toast Container for managing multiple toasts
export const ToastContainer = ({ toasts, onClose, maxVisible = 5 }) => {
  const visibleToasts = toasts.slice(-maxVisible);

  return (
    <div className="hey-toast-container" role="region" aria-label="Notifications">
      {visibleToasts.map((toast, index) => (
        <Toast
          key={toast.id}
          {...toast}
          grouped={toasts.length > 1}
          index={index}
          onClose={onClose}
        />
      ))}
    </div>
  );
};

export default Toast;