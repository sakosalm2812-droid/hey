/**
 * HEY V1 — Motion Tooltip Component
 * Implements Section 8: Tooltip / Popover / Context Menu
 */

import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion, useMotionPreset } from '../../lib/motion';
import '../../styles/motion.css';

interface TooltipProps {
  children: React.ReactElement;
  content: string | React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
}

const Tooltip = forwardRef(({
  children,
  content,
  position = 'top',
  delay = 300,
  className = '',
}, ref) => {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [positionStyles, setPositionStyles] = useState({});
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeoutRef = useRef(null);
  const preset = useMotionPreset('micro');

  const showTooltip = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setVisible(true);
      updatePosition();
    }, reduced ? 0 : delay);
  }, [delay, reduced]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const gap = 8;
    let top, left;

    switch (position) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - gap;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + gap;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.left - tooltipRect.width - gap;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.right + gap;
        break;
    }

    setPositionStyles({
      top: `${top + window.scrollY}px`,
      left: `${left + window.scrollX}px`,
    });
  }, [position]);

  useEffect(() => {
    if (visible) {
      updatePosition();
      window.addEventListener('scroll', updatePosition);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [visible, updatePosition]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const child = React.Children.only(children);
  const childWithRef = React.cloneElement(child, {
    ref: triggerRef,
    onMouseEnter: showTooltip,
    onMouseLeave: hideTooltip,
    onFocus: showTooltip,
    onBlur: hideTooltip,
  });

  if (!visible) return childWithRef;

  return (
    <>
      {childWithRef}
      {createPortal(
        <div
          ref={tooltipRef}
          className={`hey-tooltip hey-tooltip-${position} ${className}`}
          style={positionStyles}
          role="tooltip"
          aria-hidden="true"
        >
          <div className="hey-tooltip-arrow" />
          <div className="hey-tooltip-content">{content}</div>
        </div>,
        document.body
      )}
    </>
  );
});

Tooltip.displayName = 'Tooltip';

export default Tooltip;