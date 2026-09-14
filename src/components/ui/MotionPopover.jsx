/**
 * HEY V1 — Motion Popover Component
 * Implements Section 8: Tooltip / Popover / Context Menu
 */

import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion, useMotionPreset } from '../../lib/motion';
import '../../styles/motion.css';

interface PopoverProps {
  children: React.ReactElement;
  content: React.ReactNode;
  trigger?: 'click' | 'hover';
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  closeOnOutsideClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  'aria-label'?: string;
}

const Popover = forwardRef(({
  children,
  content,
  trigger = 'click',
  position = 'bottom',
  align = 'center',
  closeOnOutsideClick = true,
  closeOnEscape = true,
  className = '',
  'aria-label': ariaLabel,
}, ref) => {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [positionStyles, setPositionStyles] = useState({});
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const preset = useMotionPreset('fast');
  const outsideClickRef = useRef((e) => {});

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const gap = 8;
    let top, left;

    switch (position) {
      case 'top':
        top = triggerRect.top - popoverRect.height - gap;
        break;
      case 'bottom':
        top = triggerRect.bottom + gap;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - popoverRect.height) / 2;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height - popoverRect.height) / 2;
        break;
    }

    switch (align) {
      case 'start':
        left = position === 'left' || position === 'right' 
          ? (position === 'left' ? triggerRect.left - popoverRect.width - gap : triggerRect.right + gap)
          : triggerRect.left;
        break;
      case 'center':
        left = triggerRect.left + (triggerRect.width - popoverRect.width) / 2;
        break;
      case 'end':
        left = position === 'left' || position === 'right'
          ? (position === 'left' ? triggerRect.left - popoverRect.width - gap : triggerRect.right + gap)
          : triggerRect.right - popoverRect.width;
        break;
    }

    setPositionStyles({
      top: `${top + window.scrollY}px`,
      left: `${left + window.scrollX}px`,
    });
  }, [position, align]);

  const handleOutsideClick = useCallback((e) => {
    if (!closeOnOutsideClick) return;
    if (triggerRef.current?.contains(e.target)) return;
    if (popoverRef.current?.contains(e.target)) return;
    setOpen(false);
  }, [closeOnOutsideClick]);

  const handleEscape = useCallback((e) => {
    if (!closeOnEscape) return;
    if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [closeOnEscape]);

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener('scroll', updatePosition);
      window.addEventListener('resize', updatePosition);
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, updatePosition, handleOutsideClick, handleEscape]);

  const handleTriggerClick = useCallback(() => {
    setOpen(!open);
  }, [open]);

  const handleTriggerHover = useCallback(() => {
    setOpen(true);
  }, []);

  const handleTriggerLeave = useCallback(() => {
    setOpen(false);
  }, []);

  const child = React.Children.only(children);
  const childProps = trigger === 'click'
    ? { onClick: handleTriggerClick }
    : { onMouseEnter: handleTriggerHover, onMouseLeave: handleTriggerLeave };

  const childWithRef = React.cloneElement(child, {
    ref: triggerRef,
    ...childProps,
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-label': ariaLabel,
  });

  return (
    <>
      {childWithRef}
      {open && createPortal(
        <div
          ref={popoverRef}
          className={`hey-popover hey-popover-${position} hey-popover-align-${align} ${className}`}
          style={positionStyles}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          <div className="hey-popover-arrow" />
          <div className="hey-popover-content">{content}</div>
        </div>,
        document.body
      )}
    </>
  );
});

Popover.displayName = 'Popover';

export default Popover;