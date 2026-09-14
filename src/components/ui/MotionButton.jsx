/**
 * HEY V1 — Motion Button Component
 * Implements Section 3: Classic 3D Tactile Control Motion
 */

import { forwardRef } from 'react';
import { useReducedMotion, useMotionPreset } from '../../lib/motion';
import '../../styles/motion.css';

const MotionButton = forwardRef(({
  children,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  onClick,
  className = '',
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
  ...props
}, ref) => {
  const reduced = useReducedMotion();
  const pressPreset = useMotionPreset('instant');
  const hoverPreset = useMotionPreset('micro');

  const handleMouseDown = (e) => {
    if (disabled || loading) {
      e.preventDefault();
      return;
    }
    if (!reduced) {
      e.currentTarget.style.transition = `transform ${pressPreset.duration}ms ${pressPreset.easing}`;
    }
  };

  const handleMouseUp = (e) => {
    if (disabled || loading) return;
    if (!reduced) {
      e.currentTarget.style.transition = `transform ${hoverPreset.duration}ms ${hoverPreset.easing}`;
    }
  };

  const handleMouseLeave = (e) => {
    if (disabled || loading) return;
    if (!reduced) {
      e.currentTarget.style.transition = `transform ${hoverPreset.duration}ms ${hoverPreset.easing}`;
    }
  };

  const baseClasses = [
    'hey-tactile-button',
    `hey-btn-${variant}`,
    `hey-btn-${size}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      className={baseClasses}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-busy={loading}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      {...props}
    >
      {loading && (
        <span className="hey-btn-spinner" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" strokeLinecap="round">
              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
            </circle>
          </svg>
        </span>
      )}
      <span className="hey-btn-content">{children}</span>
    </button>
  );
});

MotionButton.displayName = 'MotionButton';

export default MotionButton;