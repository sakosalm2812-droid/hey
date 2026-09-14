import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import './Toast.css';

const icons = {
  success: <CheckCircle size={20} />,
  error: <AlertCircle size={20} />,
  warning: <AlertTriangle size={20} />,
  info: <Info size={20} />,
  default: null,
};

const colors = {
  success: 'var(--semantic-success-text)',
  error: 'var(--semantic-destructive-text)',
  warning: 'var(--semantic-warning-text)',
  info: 'var(--semantic-info-text)',
  default: 'var(--text-secondary)',
};

export function Toast({ id, message, type = 'default', duration = 4000, onClose, action, className = '' }) {
  const iconColor = colors[type] || colors.default;
  const Icon = icons[type] || icons.default;

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => onClose?.(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  return (
    <motion.div
      className={`hey-toast hey-toast--${type} ${className}`}
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      role="alert"
      aria-live="polite"
    >
      <div className="hey-toast__icon" style={{ color: iconColor }} aria-hidden="true">
        {Icon}
      </div>
      <div className="hey-toast__content">
        <p className="hey-toast__message">{message}</p>
        {action && (
          <button
            type="button"
            className="hey-toast__action"
            onClick={() => { action.onClick?.(); onClose?.(id); }}
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        className="hey-toast__close"
        onClick={() => onClose?.(id)}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const show = (message, options = {}) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, ...options };
    setToasts(prev => [...prev, toast]);
    return id;
  };

  const dismiss = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const dismissAll = () => setToasts([]);

  return { toasts, show, dismiss, dismissAll };
}

export function ToastProvider({ children, position = 'bottom-right' }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <>
      {children}
      <AnimatePresence>
        <div className={`hey-toast-container hey-toast-container--${position}`} aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              id={toast.id}
              message={toast.message}
              type={toast.type}
              duration={toast.duration}
              action={toast.action}
              onClose={dismiss}
            />
          ))}
        </div>
      </AnimatePresence>
    </>
  );
}

ToastProvider.displayName = 'ToastProvider';