import { forwardRef } from 'react';
import './Timeline.css';

export const Timeline = forwardRef((
  {
    items = [],
    reverse = false,
    className = '',
    ...props
  },
  ref
) => {
  const displayItems = reverse ? [...items].reverse() : items;

  return (
    <div ref={ref} className={`hey-timeline ${reverse ? 'hey-timeline--reverse' : ''} ${className}`} {...props}>
      <ol className="hey-timeline__list" role="list">
        {displayItems.map((item, index) => (
          <li key={item.id || index} className="hey-timeline__item">
            <div className="hey-timeline__marker" style={{ '--marker-color': item.color || 'var(--accent)' }}>
              {item.icon && <span className="hey-timeline__icon" aria-hidden="true">{item.icon}</span>}
            </div>
            <div className="hey-timeline__content">
              {item.time && <time className="hey-timeline__time" dateTime={item.time}>{item.time}</time>}
              <div className="hey-timeline__body">
                {item.title && <h4 className="hey-timeline__title">{item.title}</h4>}
                {item.description && <p className="hey-timeline__description">{item.description}</p>}
                {item.meta && <div className="hey-timeline__meta">{item.meta}</div>}
                {item.actions && (
                  <div className="hey-timeline__actions">
                    {item.actions.map((action, i) => (
                      <button key={i} type="button" className="hey-button hey-button--ghost hey-button--xs" onClick={action.onClick}>
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {index < displayItems.length - 1 && <div className="hey-timeline__line" />}
          </li>
        ))}
      </ol>
    </div>
  );
});

Timeline.displayName = 'Timeline';

export const TimelineItem = ({ time, title, description, color, icon, meta, actions, ...props }) => {
  return (
    <li {...props}>
      <div className="hey-timeline__marker" style={{ '--marker-color': color || 'var(--accent)' }}>
        {icon && <span className="hey-timeline__icon" aria-hidden="true">{icon}</span>}
      </div>
      <div className="hey-timeline__content">
        {time && <time className="hey-timeline__time" dateTime={time}>{time}</time>}
        <div className="hey-timeline__body">
          {title && <h4 className="hey-timeline__title">{title}</h4>}
          {description && <p className="hey-timeline__description">{description}</p>}
          {meta && <div className="hey-timeline__meta">{meta}</div>}
          {actions && (
            <div className="hey-timeline__actions">
              {actions.map((action, i) => (
                <button key={i} type="button" className="hey-button hey-button--ghost hey-button--xs" onClick={action.onClick}>
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

TimelineItem.displayName = 'TimelineItem';