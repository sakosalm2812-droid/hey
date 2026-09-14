import { forwardRef } from 'react';
import './Breadcrumb.css';

export const Breadcrumb = forwardRef((
  {
    items = [],
    separator = '/',
    maxItems = 5,
    className = '',
    'aria-label': ariaLabel = 'Breadcrumb',
    ...props
  },
  ref
) => {
  const displayItems = items.length > maxItems
    ? [items[0], { label: '...', collapsed: true }, ...items.slice(-maxItems + 2)]
    : items;

  return (
    <nav ref={ref} className={`hey-breadcrumb ${className}`} aria-label={ariaLabel} {...props}>
      <ol className="hey-breadcrumb__list">
        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;
          const isCollapsed = item.collapsed;

          return (
            <li key={item.path || index} className="hey-breadcrumb__item" aria-current={isLast ? 'page' : undefined}>
              {!isCollapsed && item.path && (
                <a
                  href={item.path}
                  className="hey-breadcrumb__link"
                  onClick={(e) => {
                    if (item.onClick) {
                      e.preventDefault();
                      item.onClick(e);
                    }
                  }}
                >
                  {item.icon && <span className="hey-breadcrumb__icon" aria-hidden="true">{item.icon}</span>}
                  <span>{item.label}</span>
                </a>
              )}
              {!isCollapsed && !item.path && (
                <span className="hey-breadcrumb__current">
                  {item.icon && <span className="hey-breadcrumb__icon" aria-hidden="true">{item.icon}</span>}
                  <span>{item.label}</span>
                </span>
              )}
              {isCollapsed && (
                <span className="hey-breadcrumb__ellipsis" aria-hidden="true">…</span>
              )}
              {!isLast && (
                <span className="hey-breadcrumb__separator" aria-hidden="true">{separator}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
});

Breadcrumb.displayName = 'Breadcrumb';

export const BreadcrumbItem = ({ label, path, icon, onClick, children, ...props }) => {
  return (
    <li {...props}>
      {path ? (
        <a href={path} onClick={onClick}>
          {icon && <span className="hey-breadcrumb__icon" aria-hidden="true">{icon}</span>}
          <span>{label}</span>
        </a>
      ) : (
        <span className="hey-breadcrumb__current">
          {icon && <span className="hey-breadcrumb__icon" aria-hidden="true">{icon}</span>}
          <span>{label}</span>
        </span>
      )}
      {children}
    </li>
  );
};

BreadcrumbItem.displayName = 'BreadcrumbItem';