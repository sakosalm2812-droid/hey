import { forwardRef } from 'react';
import './Card.css';

export const Card = forwardRef((
  {
    children,
    variant = 'default',
    padding = 'md',
    hover = false,
    pressed = false,
    selected = false,
    className = '',
    onClick,
    ...props
  },
  ref
) => {
  const classNames = [
    'hey-card',
    `hey-card--${variant}`,
    `hey-card--padding-${padding}`,
    hover && 'hey-card--hover',
    pressed && 'hey-card--pressed',
    selected && 'hey-card--selected',
    onClick && 'hey-card--interactive',
    className,
  ].filter(Boolean).join(' ');

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      ref={ref}
      className={classNames}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      {...props}
    >
      {children}
    </Component>
  );
});

Card.displayName = 'Card';

export const GlassCard = forwardRef((
  {
    children,
    variant = 'default',
    padding = 'md',
    blur = 'standard',
    className = '',
    ...props
  },
  ref
) => {
  const classNames = [
    'hey-glass-card',
    `hey-glass-card--${variant}`,
    `hey-glass-card--padding-${padding}`,
    `hey-glass-card--blur-${blur}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={ref}
      className={classNames}
      {...props}
    >
      {children}
    </div>
  );
});

GlassCard.displayName = 'GlassCard';

export const RaisedCard = forwardRef((
  {
    children,
    elevation = 1,
    padding = 'md',
    className = '',
    ...props
  },
  ref
) => {
  const classNames = [
    'hey-raised-card',
    `hey-raised-card--elevation-${elevation}`,
    `hey-raised-card--padding-${padding}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={ref}
      className={classNames}
      {...props}
    >
      {children}
    </div>
  );
});

RaisedCard.displayName = 'RaisedCard';