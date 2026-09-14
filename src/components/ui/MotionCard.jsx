/**
 * HEY V1 — Motion Card Component
 * Implements Section 17: Project / Card / List Motion
 */

import { forwardRef } from 'react';
import { useReducedMotion } from '../../lib/motion';
import '../../styles/motion.css';

const MotionCard = forwardRef(({
  children,
  href,
  onClick,
  selectable = false,
  selected = false,
  hoverable = true,
  elevated = false,
  className = '',
  ...props
}, ref) => {
  const reduced = useReducedMotion();

  const baseClasses = [
    'glass-card',
    'hey-glass-surface',
    hoverable && 'hey-hover-lift',
    selectable && 'hey-card-selectable',
    selected && 'hey-card-selected',
    elevated && 'hey-card-elevated',
    className,
  ].filter(Boolean).join(' ');

  const Component = href ? 'a' : onClick ? 'button' : 'div';

  return (
    <Component
      ref={ref}
      className={baseClasses}
      href={href}
      onClick={onClick}
      aria-selected={selectable ? selected : undefined}
      tabIndex={onClick || href ? 0 : undefined}
      {...props}
    >
      {children}
    </Component>
  );
});

MotionCard.displayName = 'MotionCard';

export default MotionCard;