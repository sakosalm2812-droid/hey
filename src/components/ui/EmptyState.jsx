import { forwardRef } from 'react';
import './EmptyState.css';

export const EmptyState = forwardRef((
  {
    title,
    description,
    icon,
    action,
    secondaryAction,
    illustration,
    className = '',
    ...props
  },
  ref
) => {
  return (
    <div ref={ref} className={`hey-empty-state ${className}`} {...props}>
      {illustration && (
        <div className="hey-empty-state__illustration" aria-hidden="true">
          {illustration}
        </div>
      )}
      {icon && !illustration && (
        <div className="hey-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="hey-empty-state__content">
        {title && <h3 className="hey-empty-state__title">{title}</h3>}
        {description && <p className="hey-empty-state__description">{description}</p>}
        {(action || secondaryAction) && (
          <div className="hey-empty-state__actions">
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
        )}
      </div>
    </div>
  );
});

EmptyState.displayName = 'EmptyState';

export const EmptyStatePage = ({
  title,
  description,
  icon,
  action,
  secondaryAction,
  children,
  className = '',
}) => {
  return (
    <div className={`hey-empty-state-page ${className}`} role="status">
      <div className="hey-empty-state-page__container">
        {icon && <div className="hey-empty-state-page__icon" aria-hidden="true">{icon}</div>}
        <h1 className="hey-empty-state-page__title">{title}</h1>
        {description && <p className="hey-empty-state-page__description">{description}</p>}
        {(action || secondaryAction) && (
          <div className="hey-empty-state-page__actions">
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
        )}
        {children}
      </div>
    </div>
  );
};

EmptyStatePage.displayName = 'EmptyStatePage';