import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import './ErrorState.css';

export const ErrorState = forwardRef((
  {
    title,
    message,
    code,
    icon,
    action,
    secondaryAction,
    details,
    onRetry,
    className = '',
    ...props
  },
  ref
) => {
  return (
    <div ref={ref} className={`hey-error-state ${className}`} {...props} role="alert">
      <div className="hey-error-state__icon" aria-hidden="true">
        {icon || (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
      </div>
      <div className="hey-error-state__content">
        {code && <span className="hey-error-state__code">Error {code}</span>}
        {title && <h3 className="hey-error-state__title">{title}</h3>}
        {message && <p className="hey-error-state__message">{message}</p>}
        {details && (
          <details className="hey-error-state__details">
            <summary>Show details</summary>
            <pre className="hey-error-state__details-text">{details}</pre>
          </details>
        )}
        <div className="hey-error-state__actions">
          {onRetry && (
            <button
              type="button"
              className="hey-button hey-button--primary hey-button--md"
              onClick={onRetry}
            >
              Try Again
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              className="hey-button hey-button--ghost hey-button--md"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          )}
          {action && (
            <button
              type="button"
              className="hey-button hey-button--primary hey-button--md"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

ErrorState.displayName = 'ErrorState';

export const ErrorStatePage = ({
  title,
  message,
  code,
  icon,
  action,
  secondaryAction,
  onRetry,
  className = '',
}) => {
  return (
    <div className={`hey-error-state-page ${className}`} role="alert">
      <motion.div
        className="hey-error-state-page__container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="hey-error-state-page__icon" aria-hidden="true">
          {icon || (
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
        </div>
        {code && <span className="hey-error-state-page__code">Error {code}</span>}
        <h1 className="hey-error-state-page__title">{title}</h1>
        {message && <p className="hey-error-state-page__message">{message}</p>}
        <div className="hey-error-state-page__actions">
          {onRetry && (
            <button
              type="button"
              className="hey-button hey-button--primary hey-button--lg"
              onClick={onRetry}
            >
              Try Again
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              className="hey-button hey-button--ghost hey-button--lg"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          )}
          {action && (
            <button
              type="button"
              className="hey-button hey-button--primary hey-button--lg"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

ErrorStatePage.displayName = 'ErrorStatePage';

export const InlineError = ({ message, action, className = '' }) => {
  return (
    <div className={`hey-inline-error ${className}`} role="alert">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div className="hey-inline-error__content">
        <p className="hey-inline-error__message">{message}</p>
        {action && (
          <button
            type="button"
            className="hey-button hey-button--ghost hey-button--xs"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
};

InlineError.displayName = 'InlineError';